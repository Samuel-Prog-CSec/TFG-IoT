/**
 * @fileoverview Motor de juego stateful optimizado con gestión avanzada de partidas.
 * Maneja el ciclo de vida completo con rooms de Socket.IO, limits y cleanup automático.
 * Persiste estado en Redis para recuperación tras reinicio del servidor.
 * @module services/gameEngine
 */

const Sentry = require('@sentry/node');
const logger = require('../../utils/logger').child({ component: 'gameEngine' });
const userRepository = require('../../repositories/userRepository');
const { SCAN_IGNORED_REASONS, PLAY_INTERRUPTED_REASONS } = require('../../constants/errorCodes');
const redisService = require('../redisService');
const { cacheInvalidatePattern } = require('../../utils/cacheHelper');
// T-931 (pre-v1.0.0) — materialización Redis para hot reads dashboard.
const materializedAnalytics = require('../analytics/materializedAnalyticsService');
const { recalculateSessionStatusFromPlays } = require('../sessionStatusService');
const { getMechanicStrategy } = require('../../strategies/mechanics');
const {
  ensureMemoryBoardLayoutIsComplete
} = require('../../controllers/helpers/sessionValidationHelpers');

// Módulos extraídos del GameEngine para mejor mantenibilidad
const timerManager = require('./timerManager');
const stateHelpers = require('./stateHelpers');
const recovery = require('./recovery');
const sequenceFlow = require('./sequenceFlow');
const finalSummary = require('./finalSummary');

// Constantes de configuración
// Umbral de alerta (soft limit) - no bloquea, solo emite warnings
const ACTIVE_PLAYS_WARNING_THRESHOLD =
  Number.parseInt(process.env.ACTIVE_PLAYS_WARNING_THRESHOLD, 10) || 1000;
// Límite duro de partidas activas simultáneas - protección contra OOM
const ACTIVE_PLAYS_HARD_LIMIT = Number.parseInt(process.env.ACTIVE_PLAYS_HARD_LIMIT, 10) || 2000;
const PLAY_TIMEOUT_MS = Number.parseInt(process.env.PLAY_TIMEOUT_MS, 10) || 3600000; // 1 hora
const CLEANUP_INTERVAL_MS = 300000; // 5 minutos
const PROCESS_BATCH_SIZE = Number.parseInt(process.env.GAME_ENGINE_BATCH_SIZE, 10) || 20;
const PERSIST_ROUND_START_EVENTS = process.env.PERSIST_ROUND_START_EVENTS === 'true';
const DISTRIBUTED_LOCK_TTL_SECONDS =
  Number.parseInt(process.env.GAME_ENGINE_LOCK_TTL_SECONDS, 10) || 90;
const LOCK_HEARTBEAT_INTERVAL_MS =
  Number.parseInt(process.env.GAME_ENGINE_LOCK_HEARTBEAT_MS, 10) || 30000;
const MEMORY_DEFAULT_HIDE_DELAY_MS = Number.parseInt(process.env.MEMORY_HIDE_DELAY_MS, 10) || 1200;
const MEMORY_FEEDBACK_PAUSE_MS = Number.parseInt(process.env.MEMORY_FEEDBACK_PAUSE_MS, 10) || 1400;

// Pausa entre `validation_result` y `new_round` en Asociación. El valor
// histórico era 4000 ms, lo que bloqueaba el panel táctil (las cards
// permanecen `disabled` hasta que llega `new_round`) y producía la
// sensación de UI "pillada" tras cada respuesta. 1500 ms da margen
// suficiente para que el alumno vea el bounce del target (~600 ms),
// el badge de puntos y la mascota reaccionando, y se alinea con
// `sequenceFlow.FEEDBACK_PAUSE_MS` (1700 ms) para coherencia entre
// mecánicas. Sobrescribible vía env para QA / pacing especial.
const ASSOCIATION_NEXT_ROUND_DELAY_MS =
  Number.parseInt(process.env.ASSOCIATION_NEXT_ROUND_DELAY_MS, 10) || 1500;
// Pausa post-timeout: igual que tras respuesta para pacing predecible
// (antes 2000 ms, inconsistente con la pausa post-respuesta).
const ASSOCIATION_TIMEOUT_NEXT_ROUND_DELAY_MS =
  Number.parseInt(process.env.ASSOCIATION_TIMEOUT_NEXT_ROUND_DELAY_MS, 10) || 1500;

const CHECKPOINT_INTERVAL_MS = Number.parseInt(process.env.CHECKPOINT_INTERVAL_MS, 10) || 120000; // 2 min
const CHECKPOINT_EVENT_THRESHOLD = Number.parseInt(process.env.CHECKPOINT_EVENT_THRESHOLD, 10) || 5;

/**
 * Ventana de gracia post-`timeLimit` en la que el servidor sigue aceptando
 * scans antes de marcar la ronda como timeout (PROP-79, ADR-089).
 *
 * Justificación: en Asociación con tiempos cortos (≤15s) la latencia de red
 * + render del cliente puede dejar el scan en tránsito justo cuando expira el
 * timer. Sin grace period, el backend descartaría el scan como `not_awaiting`
 * y la ronda quedaría como "sin completar" pese al esfuerzo del jugador.
 *
 * El cliente sigue mostrando 0s cuando llega `timeLimit`; el buffer es
 * imperceptible visualmente (150ms) pero captura los scans-borde.
 *
 * Sobrescribible vía env para QA / load testing.
 */
const ROUND_GRACE_PERIOD_MS = Number.parseInt(process.env.ROUND_GRACE_PERIOD_MS, 10) || 150;

/**
 * Ventana de agregación para logs de "tarjeta escaneada sin partida activa".
 * Permite emitir un único log info por UID/ventana en lugar de spamear debug
 * por cada scan. Síntoma típico de tarjetas mal asociadas o sensor en mal modo.
 */
const CARD_NOT_IN_PLAY_LOG_WINDOW_MS = 60_000;

/**
 * Umbral de alertas de contención de locks (cada N conflictos disparamos
 * Sentry warning para detectar patrones de carga anómala).
 */
const LOCK_CONTENTION_ALERT_THRESHOLD = 100;

/**
 * Contador agrupado de scans `card_not_in_play` por UID en la ventana actual.
 * Reseteado de forma perezosa cuando expira la ventana.
 *
 * @type {Map<string, { count: number, firstAt: number }>}
 */
const cardNotInPlayCounters = new Map();

const resetCardNotInPlayCountersForTests = () => cardNotInPlayCounters.clear();

const peekCardNotInPlayCountersForTests = () => Array.from(cardNotInPlayCounters.entries());

/**
 * GameEngine - Servicio con estado para gestión de partidas en tiempo real.
 *
 * Este servicio mantiene en memoria el estado de TODAS las partidas activas del sistema.
 * Es un singleton que se instancia UNA VEZ en server.js con la instancia de Socket.IO inyectada.
 *
 * Responsabilidades principales:
 * - Gestionar el ciclo de vida de las partidas (inicio, pausa, finalización)
 * - Generar y enviar desafíos a los jugadores
 * - Validar respuestas escaneadas mediante tarjetas RFID
 * - Manejar timeouts y calcular puntuaciones
 * - Emitir eventos en tiempo real a los clientes vía Socket.IO
 * - Bloquear tarjetas para evitar conflictos entre partidas simultáneas
 *
 * @class GameEngine
 */
class GameEngine {
  /**
   * Crea una nueva instancia del motor de juego.
   *
   * @constructor
   * @param {import("socket.io").Server} io - Instancia de Socket.IO para comunicación en tiempo real
   */
  constructor(io) {
    /**
     * Instancia de Socket.IO para emitir eventos a los clientes conectados.
     * @type {import("socket.io").Server}
     */
    this.io = io;

    if (!this.io) {
      logger.warn('GameEngine inicializado sin instancia de Socket.IO');
    }

    /**
     * Almacén en memoria del estado de todas las partidas activas.
     * Mapea un playId (String) con el objeto de estado completo de esa partida.
     *
     * @type {Map<string, Object>}
     * @property {Object} playDoc - Documento Mongoose de GamePlay
     * @property {Object} sessionDoc - Documento Mongoose de GameSession
     * @property {Map<string, Object>} uidToMapping - Índice O(1) para búsqueda rápida: uid → cardMapping
     * @property {Object|null} currentChallenge - Desafío actual que debe resolver el jugador
     * @property {NodeJS.Timeout|null} roundTimer - Manejador del setTimeout para el límite de tiempo
     * @property {boolean} awaitingResponse - Indica si se está esperando una respuesta del jugador
     * @property {number} roundStartTime - Timestamp de inicio de la ronda actual
     * @property {number} createdAt - Timestamp de creación para detectar partidas abandonadas
     */
    this.activePlays = new Map();

    /**
     * Mapa de búsqueda inversa para encontrar partidas por UID de tarjeta.
     * Mapea un UID de tarjeta (String) con el playId (String) que la está usando.
     *
     * Este mapa permite búsqueda O(1) al escanear una tarjeta, eliminando la necesidad
     * de iterar por todas las partidas activas. Es la clave de rendimiento del sistema.
     *
     * @type {Map<string, string>}
     */
    this.cardUidToPlayId = new Map();

    /**
     * Cola de exclusión mutua por partida para serializar operaciones críticas
     * (scan/timeout/pause/resume/next_round manual).
     * @type {Map<string, Promise<any>>}
     */
    this.playLocks = new Map();

    /**
     * Métricas del motor de juego para monitoreo.
     * @type {Object}
     */
    this.metrics = {
      totalPlaysStarted: 0,
      totalPlaysCompleted: 0,
      totalPlaysCancelled: 0,
      totalCardScans: 0,
      ignoredCardScans: 0,
      scanRaceDiscarded: 0,
      blockedManualNextRound: 0,
      totalTimeouts: 0,
      totalMemoryAttempts: 0,
      totalMemoryMatches: 0,
      averageRoundResponseTimeMs: 0,
      totalRoundResponses: 0,
      // PROP-79 / ADR-089: cuántos scans habrían sido descartados sin la
      // ventana de gracia post-timeout. Visible en /api/admin/metrics.
      scansSavedByGracePeriod: 0,
      lockContention: 0,
      distributedLockLeaseRenewed: 0,
      distributedLockLeaseFailed: 0,
      averagePlayDuration: 0,
      // Métricas Lua (T-066)
      luaReserveCardExecutions: 0,
      luaReserveCardConflicts: 0,
      luaReleaseCardExecutions: 0,
      luaRenewLeaseExecutions: 0,
      luaRenewLeasePartialFailures: 0,
      pipelineRecoveryBatchSize: 0,
      checkpointExecuted: 0
    };

    // Iniciar cleanup automático de partidas abandonadas
    // En tests lo deshabilitamos para evitar open handles en Jest.
    if (process.env.NODE_ENV !== 'test') {
      this.startCleanupTimer();
      this.startLockHeartbeatTimer();

      // Registrar callback para re-registrar card locks tras reconexión Redis.
      // Cuando Redis se cae y vuelve, las card locks expiran. Este callback
      // recrea las reservas de tarjetas para las partidas aún activas en memoria.
      const { onReconnect } = require('../../config/redis');
      onReconnect(async () => {
        await this.reRegisterCardLocks();
      });
    }

    logger.info('GameEngine inicializado', {
      activePlaysWarningThreshold: ACTIVE_PLAYS_WARNING_THRESHOLD,
      activePlaysHardLimit: ACTIVE_PLAYS_HARD_LIMIT,
      playTimeoutMs: PLAY_TIMEOUT_MS,
      cleanupIntervalMs: CLEANUP_INTERVAL_MS,
      distributedLockTtlSeconds: DISTRIBUTED_LOCK_TTL_SECONDS,
      lockHeartbeatIntervalMs: LOCK_HEARTBEAT_INTERVAL_MS,
      checkpointIntervalMs: CHECKPOINT_INTERVAL_MS,
      checkpointEventThreshold: CHECKPOINT_EVENT_THRESHOLD
    });
  }

  // ── Delegados a timerManager.js ──────────────────────────────────────────
  startCleanupTimer() {
    timerManager.startCleanupTimer(this);
  }
  stopCleanupTimer() {
    timerManager.stopCleanupTimer(this);
  }
  async cleanupAbandonedPlays() {
    await timerManager.cleanupAbandonedPlays(this);
    // (D10-003) Purgar contadores `cardNotInPlayCounters` cuya ventana ya
    // expiró. Sin esto, los UIDs escaneados que nunca llegaron a coincidir
    // con un mapeo activo (sensor mal configurado, tarjeta de otra sesión)
    // se acumulaban en la Map sin tope porque el `set(...)` solo se rearmaba
    // al detectar una nueva ventana — los UIDs que solo se escaneaban una
    // vez nunca se limpiaban. Coste: O(entries), insignificante (<1000 UIDs
    // únicos por aula y semana).
    const now = Date.now();
    for (const [uid, entry] of cardNotInPlayCounters) {
      if (now - entry.firstAt > CARD_NOT_IN_PLAY_LOG_WINDOW_MS) {
        cardNotInPlayCounters.delete(uid);
      }
    }
  }
  startLockHeartbeatTimer() {
    timerManager.startLockHeartbeatTimer(this);
  }
  stopLockHeartbeatTimer() {
    timerManager.stopLockHeartbeatTimer(this);
  }
  async refreshActivePlayLeases() {
    await timerManager.refreshActivePlayLeases(this);
  }
  async refreshPlayLease(playId, playState) {
    await timerManager.refreshPlayLease(this, playId, playState);
  }

  // ── Delegados a recovery.js ────────────────────────────────────────────
  async reRegisterCardLocks() {
    await recovery.reRegisterCardLocks(this);
  }

  /**
   * Ejecuta una operación de forma exclusiva por playId.
   * @private
   * @param {string} playId
   * @param {string} operationName
   * @param {() => Promise<any>} operation
   * @returns {Promise<any>}
   */
  async executeWithPlayLock(playId, operationName, operation) {
    const previousOperation = this.playLocks.get(playId);

    if (this.playLocks.has(playId) === true) {
      this.metrics.lockContention++;
      // Alerta cada N conflictos: indica carga anómala (escaneos en cascada
      // o muchas operaciones concurrentes sobre la misma partida).
      if (this.metrics.lockContention % LOCK_CONTENTION_ALERT_THRESHOLD === 0) {
        logger.warn('Alta contención de locks RFID', {
          playId,
          operationName,
          contention: this.metrics.lockContention,
          threshold: LOCK_CONTENTION_ALERT_THRESHOLD
        });
        Sentry.captureMessage('Lock contention spike RFID', {
          level: 'warning',
          tags: { module: 'gameEngine', path: 'executeWithPlayLock' },
          extra: { playId, operationName, contention: this.metrics.lockContention }
        });
      }
    }

    const operationQueue =
      previousOperation instanceof Promise ? previousOperation : Promise.resolve();

    const currentOperation = operationQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          return await operation();
        } catch (error) {
          logger.error(`Error en operación serializada '${operationName}' para ${playId}`, {
            playId,
            operationName,
            error: error.message
          });
          throw error;
        }
      });

    this.playLocks.set(playId, currentOperation);

    return currentOperation.finally(() => {
      if (this.playLocks.get(playId) === currentOperation) {
        this.playLocks.delete(playId);
      }
    });
  }

  /**
   * Procesa elementos en lotes para reducir latencia de bucles secuenciales.
   * @private
   * @template T
   * @param {T[]} items
   * @param {(item: T) => Promise<any>} processor
   * @returns {Promise<void>}
   */
  async processInBatches(items, processor) {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    for (let index = 0; index < items.length; index += PROCESS_BATCH_SIZE) {
      const batch = items.slice(index, index + PROCESS_BATCH_SIZE);
      await Promise.all(batch.map(item => processor(item)));
    }
  }

  /**
   * Reserva los UIDs de una sesión en Redis con semántica NX para evitar colisiones multi-instancia.
   *
   * @private
   * @param {string} playId
   * @param {Object} sessionDoc
   * @returns {Promise<{ok:boolean, conflicts:string[]}>}
   */
  async reserveDistributedCardMappings(playId, sessionDoc) {
    const cardEntries = (sessionDoc?.cardMappings || []).map(mapping => ({
      id: mapping.uid,
      value: playId
    }));

    // Usar operación atómica Lua (all-or-nothing) en vez de SET NX secuencial.
    // Elimina la race window donde dos instancias podían adquirir tarjetas solapadas.
    const result = await redisService.reserveCardsAtomic(
      redisService.NAMESPACES.CARD,
      cardEntries,
      DISTRIBUTED_LOCK_TTL_SECONDS
    );

    if (result.ok) {
      this.metrics.luaReserveCardExecutions++;
    } else {
      this.metrics.luaReserveCardConflicts++;
    }

    return {
      ok: Boolean(result?.ok),
      conflicts: result?.conflicts || []
    };
  }

  /**
   * Libera UIDs reservados por una partida solo si Redis sigue apuntando a ese playId.
   *
   * @private
   * @param {string} playId
   * @param {string[]} cardUids
   * @returns {Promise<void>}
   */
  async releaseDistributedCardMappings(playId, cardUids = []) {
    const releaseEntries = (cardUids || []).map(uid => ({
      id: uid,
      expectedValue: playId
    }));

    // Usar operación atómica Lua (owner-aware) en vez de GET+compare+DEL secuencial.
    // Elimina la race window entre lectura y borrado.
    const result = await redisService.releaseCardsAtomic(
      redisService.NAMESPACES.CARD,
      releaseEntries
    );
    this.metrics.luaReleaseCardExecutions++;
    return result;
  }

  // ============================================================================
  // CICLO DE VIDA DE LA PARTIDA
  // ============================================================================

  /**
   * Inicia una nueva partida en el sistema.
   *
   * Este método:
   * 1. Verifica límites del sistema
   * 2. Bloquea las tarjetas RFID para esta partida (evita duplicados)
   * 3. Crea el estado inicial en memoria
   * 4. Envía el primer desafío al jugador
   *
   * Este método es llamado desde server.js al recibir el evento socket 'start_play'.
   *
   * @async
   * @param {Object} playDoc - Documento Mongoose de GamePlay (partida)
   * @param {Object} sessionDoc - Documento Mongoose de GameSession (configuración)
   * @returns {Promise<void>}
   * @emits error - Si alguna tarjeta ya está en uso por otra partida
   * @emits new_round - Cuando se envía el primer desafío al cliente
   */
  async startPlay(playDoc, sessionDoc) {
    const playId = playDoc._id.toString();
    const sessionId = sessionDoc?._id?.toString();
    const userId = playDoc?.playerId?.toString();
    const mechanicCode = sessionDoc?.mechanicId?.code || sessionDoc?.mechanicId?.name || undefined;

    // T-904 Fase A: span manual para visibilidad p95 del arranque de partida
    // (incluye espera de lock distribuido + lock en memoria + reservas de cards).
    return Sentry.startSpan(
      {
        name: 'gameplay.startPlay',
        op: 'gameplay',
        attributes: {
          'play.id': playId,
          'session.id': sessionId,
          'user.id': userId,
          'mechanic.code': mechanicCode
        }
      },
      () =>
        // eslint-disable-next-line sonarjs/cyclomatic-complexity -- orquestación stateful del arranque de partida; refactor diferido por riesgo de regresión en gameplay
        this.executeWithPlayLock(playId, 'startPlay', async () => {
          // Idempotencia distribuida: en despliegues multi-instancia con Socket.IO adapter,
          // dos instancias pueden recibir start_play concurrentes para el mismo playId.
          // SET NX con TTL 60s garantiza que solo una instancia ejecute el arranque.
          // Si Redis cae, setIfNotExists retorna true → fallback al guard en memoria.
          const acquired = await redisService.setIfNotExists(
            redisService.NAMESPACES.PLAY_INIT_LOCK,
            playId,
            'initializing',
            60
          );
          if (!acquired) {
            logger.warn(
              `Partida ${playId}: otra instancia ya está inicializando (lock distribuido activo)`
            );
            return;
          }

          if (this.activePlays.has(playId)) {
            logger.warn(
              `Partida ${playId} ya estaba iniciada en memoria (idempotencia start_play)`
            );
            return;
          }

          // 0a. Límite duro de partidas activas — protección contra OOM
          if (this.activePlays.size >= ACTIVE_PLAYS_HARD_LIMIT) {
            logger.error(
              `Límite duro de partidas activas alcanzado: ${this.activePlays.size}/${ACTIVE_PLAYS_HARD_LIMIT}. Rechazando nueva partida.`
            );
            this.io.to(`play_${playId}`).emit('error', {
              message:
                'El servidor ha alcanzado el límite de partidas simultáneas. Inténtalo de nuevo más tarde.'
            });
            return;
          }

          // 0b. Verificar umbral de partidas activas (Monitorización - solo warning)
          if (this.activePlays.size >= ACTIVE_PLAYS_WARNING_THRESHOLD) {
            logger.warn(
              `Umbral de partidas activas alcanzado o superado: ${this.activePlays.size}/${ACTIVE_PLAYS_WARNING_THRESHOLD}`
            );
          }

          // 1. Bloquear las tarjetas para este juego
          // Esto previene que la misma tarjeta se use en dos juegos a la vez
          for (const mapping of sessionDoc.cardMappings) {
            if (this.cardUidToPlayId.has(mapping.uid)) {
              // La tarjeta ya está en otro juego activo
              logger.error(`Error al iniciar ${playId}: Tarjeta ${mapping.uid} ya en uso.`);
              this.io.to(`play_${playId}`).emit('error', {
                message: `La tarjeta ${mapping.assignedValue || mapping.uid} ya está en uso en otra partida`
              });
              return;
            }
          }

          const distributedReservation = await this.reserveDistributedCardMappings(
            playId,
            sessionDoc
          );
          if (!distributedReservation.ok) {
            const conflictedUid = distributedReservation.conflicts?.[0] || null;
            const conflictedMapping = sessionDoc.cardMappings.find(
              mapping => mapping.uid === conflictedUid
            );

            logger.error(`Error al iniciar ${playId}: conflicto distribuido de tarjeta`, {
              playId,
              conflictedUid,
              conflicts: distributedReservation.conflicts
            });

            this.io.to(`play_${playId}`).emit('error', {
              message: `La tarjeta ${conflictedMapping?.assignedValue || conflictedUid || 'desconocida'} ya está en uso en otra partida`
            });
            return;
          }

          // Si todas las tarjetas están libres, las reservamos
          for (const mapping of sessionDoc.cardMappings) {
            this.cardUidToPlayId.set(mapping.uid, playId);
          }

          // 2. Construir índice O(1) para búsqueda rápida de mappings por UID
          const uidToMapping = new Map(sessionDoc.cardMappings.map(m => [m.uid, m]));

          // 3. Crear el estado en memoria
          // Garantizar que mechanicId esté poblado con su nombre
          if (
            (typeof sessionDoc.mechanicId !== 'object' || !sessionDoc.mechanicId?.name) &&
            typeof sessionDoc.populate === 'function'
          ) {
            await sessionDoc.populate({ path: 'mechanicId', select: 'name rules' });
          }
          const mechanicName = sessionDoc.mechanicId?.name || null;
          try {
            if (!mechanicName) {
              throw new Error('No se pudo resolver el nombre de la mecánica de juego.');
            }

            // Validar boardLayout para sesiones de memoria antes de construir el estado
            ensureMemoryBoardLayoutIsComplete({
              mechanic: sessionDoc.mechanicId,
              boardLayout: sessionDoc.boardLayout,
              cardMappings: sessionDoc.cardMappings
            });
          } catch (validationErr) {
            // Las tarjetas YA están reservadas (cardUidToPlayId + Redis). Si esta
            // validación tardía falla, hay que LIBERARLAS: si no, quedan marcadas
            // "en uso" para SIEMPRE en `cardUidToPlayId` (Map en memoria sin TTL) y
            // ninguna partida futura con esas tarjetas podrá arrancar hasta
            // reiniciar el servidor. (La rama de Secuencia de abajo ya liberaba en
            // su propio fallo; estas dos rutas —mecánica sin nombre, board de
            // Memoria incompleto— no lo hacían: fuga confirmada en auditoría
            // 2026-06-28.)
            await this._releaseReservedCards(playId, sessionDoc.cardMappings);
            logger.error(`Error validando ${playId} tras reservar tarjetas; reserva liberada`, {
              playId,
              err: validationErr?.message
            });
            this.io.to(`play_${playId}`).emit('error', {
              message: 'No se pudo iniciar la partida (configuración inválida). Avisa al docente.'
            });
            return;
          }

          // Validar sequencePlan para sesiones Secuencia antes de iniciar.
          if (mechanicName === 'sequence') {
            const plan = Array.isArray(sessionDoc.sequencePlan) ? sessionDoc.sequencePlan : [];
            const expectedRounds = Number(sessionDoc.config?.numberOfRounds || 0);
            if (plan.length === 0 || plan.length !== expectedRounds) {
              this.io.to(`play_${playId}`).emit('error', {
                message:
                  'La sesión de Secuencia no tiene un plan válido. Reconfigúrala antes de jugar.'
              });
              await this.releaseDistributedCardMappings(
                playId,
                sessionDoc.cardMappings.map(m => m.uid)
              );
              for (const mapping of sessionDoc.cardMappings) {
                this.cardUidToPlayId.delete(mapping.uid);
              }
              return;
            }
          }

          const mechanicStrategy = getMechanicStrategy(mechanicName, logger);
          const strategyState = mechanicStrategy.initialize({ sessionDoc, playDoc });

          const playState = {
            playDoc,
            sessionDoc,
            uidToMapping, // Índice O(1): uid → mapping completo
            mechanicName: mechanicStrategy.getName(),
            mechanicStrategy,
            strategyState,
            currentChallenge: null,
            roundTimer: null,
            nextRoundTimer: null,
            playTimer: null,
            awaitingResponse: false,
            paused: false,
            pausedAt: null,
            remainingTimeMs: null,
            roundElapsedBeforePauseMs: 0,
            playDurationMs: null,
            playEndsAt: null,
            createdAt: Date.now(), // Para detectar abandonos
            lastCheckpointEventCount: 0,
            lastCheckpointAt: Date.now(),
            transientTimers: new Set()
          };

          if (playState.mechanicName === 'memory') {
            const playDurationMs =
              Number(playState.mechanicStrategy.getPlayDurationMs(sessionDoc)) ||
              (sessionDoc.config?.timeLimit || 90) * 1000;
            playState.playDurationMs = playDurationMs;
            playState.awaitingBoardReady = true;
            // El timer se inicia cuando el frontend confirma que el tablero es visible (board_ready)
          } else if (playState.mechanicName === 'sequence') {
            // La memorización de Secuencia debe arrancar cuando el alumno pulsa
            // EMPEZAR (board_ready), NO en el bootstrap. Sin este gate, la
            // pantalla pre-inicio "¡Hora de Jugar!" consumía el tiempo de
            // memorización de la ronda 1 (el timer de displaySeconds corría antes
            // de que el alumno pudiera ver la secuencia). Memoria ya usa el mismo
            // mecanismo; aquí lo extendemos a Secuencia (F-03).
            playState.awaitingBoardReady = true;
          }

          // 4. Almacenar el estado en memoria
          this.activePlays.set(playId, playState);
          this.metrics.totalPlaysStarted++;

          // 5. Sincronizar con Redis para persistencia
          await this.syncPlayToRedis(playId, playState);

          logger.info(
            `Partida ${playId} iniciada. ${sessionDoc.cardMappings.length} tarjetas bloqueadas.`,
            {
              playId,
              playerId: playDoc.playerId,
              sessionId: sessionDoc._id,
              activePlaysCount: this.activePlays.size
            }
          );

          // 6. Enviar la primera ronda
          await this.sendNextRound(playId);
        }) // fin executeWithPlayLock
    ); // fin Sentry.startSpan
  }

  /**
   * Libera la reserva de tarjetas (memoria `cardUidToPlayId` + reserva
   * distribuida en Redis) y saca el play de `activePlays`. Best-effort: se usa
   * cuando `startPlay` falla DESPUÉS de reservar, para que las tarjetas no queden
   * marcadas "en uso" para siempre (el `Map cardUidToPlayId` no tiene TTL, a
   * diferencia de la reserva en Redis que sí caduca a los ~90s).
   *
   * @private
   * @param {string} playId
   * @param {Array} cardMappings
   */
  async _releaseReservedCards(playId, cardMappings) {
    const uids = Array.isArray(cardMappings) ? cardMappings.map(m => m.uid) : [];
    try {
      await this.releaseDistributedCardMappings(playId, uids);
    } catch (releaseErr) {
      logger.warn('Fallo liberando la reserva distribuida tras error de startPlay', {
        playId,
        err: releaseErr?.message
      });
    }
    for (const uid of uids) {
      if (this.cardUidToPlayId.get(uid) === playId) {
        this.cardUidToPlayId.delete(uid);
      }
    }
    this.activePlays.delete(playId);
  }

  /**
   * Finaliza una partida y libera todos sus recursos.
   *
   * Este método:
   * 1. Limpia los timers pendientes
   * 2. Guarda el estado final en la base de datos
   * 3. Emite el evento 'game_over' al cliente
   * 4. Libera las tarjetas bloqueadas
   * 5. Elimina la partida de la memoria activa
   * 6. Actualiza métricas del alumno
   *
   * @async
   * @param {string} playId - ID de la partida a finalizar
   * @param {Object} [options] - Opciones de finalización
   * @param {boolean} [options.abandoned=false] - Si true, marca la partida como abandonada
   *   (por timeout de inactividad) en vez de completada. Las partidas abandonadas no
   *   contribuyen al averageScore del alumno pero sí se registran en totalAbandonedGames.
   * @returns {Promise<void>}
   * @emits game_over - Con puntuación final y métricas
   */
  // eslint-disable-next-line sonarjs/no-inconsistent-returns -- early-return void en el guard; el resto de la función también retorna void
  async endPlay(playId, { abandoned = false } = {}) {
    const playState = this.activePlays.get(playId);
    if (!playState) {
      return;
    }

    // T-904 Fase A: span manual para medir p95 del cierre de partida
    // (incluye persistencia, métricas estudiante, liberación de cards).
    return Sentry.startSpan(
      {
        name: 'gameplay.endPlay',
        op: 'gameplay',
        attributes: {
          'play.id': playId,
          'play.abandoned': abandoned,
          'session.id': playState.sessionDoc?._id?.toString(),
          'user.id': playState.playDoc?.playerId?.toString(),
          'mechanic.code': playState.mechanicName
        }
      },
      () => this._endPlayInternal(playId, playState, { abandoned })
    );
  }

  /**
   * Body interno de endPlay extraído como método separado para que el
   * `Sentry.startSpan` envuelva limpiamente sin necesidad de un bloque IIFE
   * gigante. Idempotente respecto al `activePlays.get` ya hecho.
   *
   * @private
   * @param {string} playId
   * @param {Object} playState
   * @param {Object} options
   * @param {boolean} options.abandoned
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity, sonarjs/cyclomatic-complexity -- finalización de partida (game_over): orquestación stateful; refactor diferido por riesgo de regresión en gameplay
  async _endPlayInternal(playId, playState, { abandoned }) {
    logger.info(
      `Finalizando partida ${playId}${abandoned ? ' (abandonada por inactividad)' : ''}...`
    );

    // 1. Limpiar TODOS los timers pendientes (round/next/play/memorizing Y los
    //    transitorios). Antes se limpiaban a mano todos MENOS los
    //    `transientTimers` (timer de ocultado de un fallo de Memoria), que
    //    sobrevivía a `_endPlayInternal` ~1.2s: su callback es inocuo
    //    (`activePlays.get` → null), pero quedaba como timer huérfano sosteniendo
    //    el closure. `clearPlayTimers` los limpia todos de forma consistente.
    this.clearPlayTimers(playState);

    // 2. Guardar el estado final en la BD
    const playDuration = Date.now() - playState.createdAt;
    try {
      if (abandoned) {
        // Partida abandonada: marcar status y registrar evento
        playState.playDoc.status = 'abandoned';
        playState.playDoc.completedAt = new Date();
        playState.playDoc.metrics.completionTime = playDuration;
        playState.playDoc.events.push({
          timestamp: new Date(),
          eventType: 'server_restart',
          roundNumber: playState.playDoc.currentRound,
          pointsAwarded: 0
        });
        await playState.playDoc.save();

        // Registrar abandono en métricas del alumno (no afecta averageScore)
        const player = await userRepository.findById(playState.playDoc.playerId);
        if (player) {
          await player.recordAbandonedGame();
        }

        this.metrics.totalPlaysCancelled++;
      } else {
        // Construye el final summary específico de la mecánica y lo
        // persiste ANTES de complete() para que cualquier agregación de
        // analytics posterior vea peakStreak / categoryDominance /
        // maxSequenceLength etc.  ADR-B unifica el camino: factory
        // `buildFinalSummary(mechanicType, playState)` decide qué builder
        // ejecutar según mecánica; Sequence sigue serializando flat (los
        // campos viven directamente bajo `metrics.*`), Memoria/Asociación
        // se aíslan en sub-objetos `metrics.memory` / `metrics.association`.
        const persistedSummary = finalSummary.buildFinalSummary(playState.mechanicName, playState);
        let didModifyMetrics = false;
        if (playState.mechanicName === 'sequence') {
          if (!playState.playDoc.metrics) {
            playState.playDoc.metrics = {};
          }
          Object.assign(playState.playDoc.metrics, persistedSummary);
          didModifyMetrics = true;
        } else if (playState.mechanicName === 'memory') {
          if (!playState.playDoc.metrics) {
            playState.playDoc.metrics = {};
          }
          playState.playDoc.metrics.memory = persistedSummary;
          didModifyMetrics = true;
        } else if (playState.mechanicName === 'association') {
          if (!playState.playDoc.metrics) {
            playState.playDoc.metrics = {};
          }
          playState.playDoc.metrics.association = persistedSummary;
          didModifyMetrics = true;
        }
        // `markModified` solo existe en documentos Mongoose. Los tests
        // unitarios pasan plain objects en `playDoc`, así que el guard
        // evita que la rama Memoria/Asociación rompa esos tests.
        if (didModifyMetrics && typeof playState.playDoc.markModified === 'function') {
          playState.playDoc.markModified('metrics');
        }

        // Partida completada normalmente
        await playState.playDoc.complete();

        // Actualizar métricas del alumno con todos los datos
        // Solo si el tutor no ha ejercido el derecho de oposición a analytics (Art. 21 RGPD)
        const player = await userRepository.findById(playState.playDoc.playerId);
        if (player) {
          if (player.hasConsentFor('performance_analytics')) {
            await player.updateStudentMetrics({
              score: playState.playDoc.score,
              // SIN `maxScore`, updateStudentMetrics calcula scorePercent=0 para
              // TODA partida real (endPlay es el path principal), arrastrando el
              // `studentMetrics.averageScore` de cada alumno hacia 0% (todos
              // "en riesgo"). Los paths hermanos (completePlay HTTP y la
              // materialización Redis) sí lo pasan; aquí faltaba.
              maxScore: playState.playDoc.maxScore,
              correctAttempts: playState.playDoc.metrics.correctAttempts,
              errorAttempts: playState.playDoc.metrics.errorAttempts,
              timeoutAttempts: playState.playDoc.metrics.timeoutAttempts,
              averageResponseTime: playState.playDoc.metrics.averageResponseTime,
              maxSequenceLengthAchieved:
                playState.mechanicName === 'sequence'
                  ? persistedSummary.maxSequenceLengthAchieved
                  : undefined
            });

            // T-931 (pre-v1.0.0): materialización dual — escribir en
            // ZSETs leaderboards + Hash studentMetrics en paralelo a la
            // escritura Mongo. Fire-and-forget: si falla, la
            // reconciliación nocturna corregirá el drift. Respeta
            // consentimiento RGPD porque solo se ejecuta dentro de la
            // rama con `hasConsentFor('performance_analytics')`.
            materializedAnalytics
              .recordPlayCompletion({
                teacherId: playState.sessionDoc?.createdBy,
                contextId: playState.sessionDoc?.contextId,
                mechanicId: playState.sessionDoc?.mechanicId,
                studentId: playState.playDoc.playerId,
                score: playState.playDoc.score,
                maxScore: playState.playDoc.maxScore,
                correctAttempts: playState.playDoc.metrics.correctAttempts,
                errorAttempts: playState.playDoc.metrics.errorAttempts,
                timeoutAttempts: playState.playDoc.metrics.timeoutAttempts,
                averageResponseTime: playState.playDoc.metrics.averageResponseTime,
                mechanicName: playState.mechanicName,
                maxSequenceLengthAchieved:
                  playState.mechanicName === 'sequence'
                    ? persistedSummary.maxSequenceLengthAchieved
                    : 0,
                sequencesCompleted:
                  playState.mechanicName === 'sequence' ? persistedSummary.sequencesCompleted : 0
              })
              .catch(err => {
                logger.debug('T-931 recordPlayCompletion fallo (ignorado)', {
                  playId,
                  error: err.message
                });
              });
          } else {
            logger.info(
              'Métricas de analytics omitidas — sin consentimiento de performance_analytics',
              {
                playId,
                playerId: player._id
              }
            );
          }
        }

        this.metrics.totalPlaysCompleted++;
        this.metrics.averagePlayDuration =
          (this.metrics.averagePlayDuration * (this.metrics.totalPlaysCompleted - 1) +
            playDuration) /
          this.metrics.totalPlaysCompleted;
      }

      await recalculateSessionStatusFromPlays(playState.playDoc.sessionId);

      // Invalidación ACOTADA del cache de analytics (D1). Una partida terminada deja
      // stale (a) las analíticas del ALUMNO que jugó (engagement, summary…) y (b) las del
      // PROFESOR dueño que agregan esa partida (contentEffectiveness, comparison,
      // distribution, difficulties, teacherSessions…). Se invalida con dos patrones
      // amplios por id —`*<studentId>*` y `*<teacherId>*`— que cubren CUALQUIER forma de
      // key (presente o futura) de ese alumno/profesor sin tocar el cache de OTROS (los
      // ObjectId de 24 hex no colisionan como substring entre sí). Antes se flusheaba el
      // namespace ENTERO en cada partida → el cache de 300 s nunca maduraba y se gastaban
      // comandos Upstash de más. Fire-and-forget.
      //
      // NOTA DE RENDIMIENTO (verificada con benchmark): NO sustituir estos dos
      // patrones por un conjunto de patrones "anclados por prefijo"
      // (`summary:<id>:*`, `engagement:<id>:*`, …). `scanByNamespace` usa
      // `SCAN ... MATCH`, y MATCH en Redis es un FILTRO posterior, no un seek por
      // prefijo: cada SCAN recorre el keyspace COMPLETO independientemente del
      // patrón. Por tanto N patrones anclados = N barridos del keyspace, mientras
      // que estos 2 patrones amplios = 2 barridos. Medido sobre el Redis del
      // contenedor: 2 SCAN amplios = ~300 iteraciones de cursor; 26 SCAN anclados
      // (7 familias de alumno + 19 de profesor) = ~7300 iteraciones (~13× peor),
      // 348 ms → 4275 ms. Además, anclar exige mantener a mano la lista de
      // familias de key: si se olvida una, se reintroduce el bug de charts
      // vacíos/stale con datos de menores (ADR-183). El patrón amplio por id es
      // a la vez el más barato y el más seguro (auto-cubre toda familia presente
      // o futura). La alternativa GENUINAMENTE más rápida sería un índice inverso
      // (SET por id poblado en `cacheGet`, invalidación = SMEMBERS+DEL: ~6 cmds,
      // 0 barridos) — descartada por ahora: el keyspace real es pequeño (~100
      // keys ⇒ ~4 iteraciones por endPlay) y el refactor tocaría ~26 call-sites
      // de `cacheGet`, con su propio riesgo de staleness si alguno se omite.
      const invalidationTeacherId = playState.sessionDoc?.createdBy;
      const invalidationStudentId = playState.playDoc.playerId;
      const cacheInvalidations = [
        cacheInvalidatePattern('cache:analytics', `*${invalidationStudentId}*`),
        // Las KPIs agregadas del centro (`admin:overview:<rango>`) NO llevan id de
        // alumno/profesor en su key, así que los patrones por id no las alcanzan.
        // Sin esto, el dashboard del director quedaba stale hasta el TTL (5 min)
        // tras cada partida. Son 3 keys (7d/30d/90d): coste de invalidación mínimo.
        cacheInvalidatePattern('cache:analytics', 'admin:overview:*')
      ];
      if (invalidationTeacherId) {
        cacheInvalidations.push(
          cacheInvalidatePattern('cache:analytics', `*${invalidationTeacherId}*`)
        );
      }
      Promise.all(cacheInvalidations).catch(err => {
        logger.warn('endPlay: fallo al invalidar cache:analytics (ignorado)', {
          playId,
          error: err.message
        });
      });

      logger.info(`Partida ${playId} guardada en BD`, {
        playId,
        score: playState.playDoc.score,
        status: abandoned ? 'abandoned' : 'completed',
        duration: `${(playDuration / 1000).toFixed(2)}s`
      });
    } catch (err) {
      logger.error(`Error al guardar partida final ${playId}: ${err.message}`);
    }

    // 3. Emitir evento final al cliente.
    // Construimos `finalMetrics` desde el documento persistido (que ya
    // incluye los sub-objetos memory/association tras la rama no abandonada)
    // y volvemos a fusionar el summary específico para garantizar que el
    // frontend recibe datos frescos incluso si la persistencia anterior
    // falló de forma silenciosa (defense-in-depth).
    const finalMetrics = playState.playDoc.metrics?.toObject
      ? playState.playDoc.metrics.toObject()
      : { ...(playState.playDoc.metrics || {}) };
    let mode = 'association';
    if (playState.mechanicName === 'memory') {
      mode = 'memory';
    } else if (playState.mechanicName === 'sequence') {
      mode = 'sequence';
    }

    const emittedSummary = finalSummary.buildFinalSummary(playState.mechanicName, playState);
    if (mode === 'sequence') {
      Object.assign(finalMetrics, emittedSummary);
    } else if (mode === 'memory') {
      finalMetrics.memory = emittedSummary;
    } else if (mode === 'association') {
      finalMetrics.association = emittedSummary;
    }

    // Garantizar `completionTime` en el payload — `playDoc.complete()`
    // lo escribe en el documento, pero si el path falla o llega al
    // toObject anterior antes del save, el frontend mostraba "—" en
    // "Tiempo total" del GameOver de Secuencia (BUG QA 03/05/2026).
    if (!Number.isFinite(Number(finalMetrics.completionTime)) || finalMetrics.completionTime <= 0) {
      finalMetrics.completionTime = playDuration;
    }

    this.io.to(`play_${playId}`).emit('game_over', {
      finalScore: playState.playDoc.score,
      // ADR-114: enviamos `maxScore` para que el GameOver del cliente
      // pinte `score / maxScore (Z%)` y el alumno vea el techo absoluto
      // de la partida (no sólo cuántos puntos sacó). Persistido en
      // `GamePlay.maxScore` al crear la partida con la fórmula propia
      // de cada mecánica (ver gamePlayService.createPlay).
      maxScore: Number(playState.playDoc.maxScore) || null,
      metrics: finalMetrics,
      // `mode` se mantiene por compatibilidad con el frontend actual
      // (`GameOverStats` delega por `summary.mode`). `mechanicType` añade
      // el mismo valor con un nombre más explícito de cara a futuro
      // (mascota, tema visual, charts del profesor) — ADR-D/E/F lo usan
      // como propagación canónica.
      mode,
      mechanicType: playState.mechanicName,
      abandoned
    });

    // 4. Limpiar la memoria
    // Liberar las tarjetas
    const cardUids = [];
    for (const mapping of playState.sessionDoc.cardMappings) {
      this.cardUidToPlayId.delete(mapping.uid);
      cardUids.push(mapping.uid);
    }

    // También limpiar de Redis (solo si seguimos siendo owner del lock).
    // El Lua release es EVALSHA y no entra en pipeline.
    await this.releaseDistributedCardMappings(playId, cardUids);

    // Borrar la partida de la memoria activa
    this.activePlays.delete(playId);

    // B.7 (pre-v1.0.0): coalescer las 2 ops Redis restantes (DEL PLAY +
    // DEL PLAY_INIT_LOCK) en un único pipeline para ahorrar 1 RTT a
    // Upstash en cada endPlay. Bajo cluster típico de 30 sesiones/día
    // son ~30 round-trips ahorrados sin riesgo (ambos del son
    // independientes y best-effort). El TTL de 60s del PLAY_INIT_LOCK
    // sigue siendo red de seguridad si el pipeline falla.
    try {
      await redisService.runPipeline(p => {
        p.del(`${redisService.NAMESPACES.PLAY}:${playId}`);
        p.del(`${redisService.NAMESPACES.PLAY_INIT_LOCK}:${playId}`);
      }, 'endPlay-cleanup');
    } catch (err) {
      logger.warn('endPlay: pipeline cleanup falló (TTL es red de seguridad)', {
        playId,
        error: err.message
      });
    }

    logger.info(`Partida ${playId} finalizada y limpiada de memoria`, {
      activePlaysRemaining: this.activePlays.size
    });
  }

  // ============================================================================
  // LÓGICA DEL JUEGO
  // ============================================================================

  // ── Delegados a stateHelpers.js ─────────────────────────────────────────
  isMemoryPlay(playState) {
    return stateHelpers.isMemoryPlay(playState);
  }

  /**
   * Comprueba si una partida usa la mecánica Secuencia.
   *
   * @param {Object} playState
   * @returns {boolean}
   */
  isSequencePlay(playState) {
    return stateHelpers.isSequencePlay(playState);
  }
  getMemoryRemainingTimeMs(playState) {
    return stateHelpers.getMemoryRemainingTimeMs(playState);
  }
  emitMemoryTurnState(playId, playState, extra = {}) {
    stateHelpers.emitMemoryTurnState(this, playId, playState, extra);
  }

  scheduleMemoryPlayTimeout(playId, playState, remainingTimeMs) {
    if (!Number.isFinite(remainingTimeMs) || remainingTimeMs <= 0) {
      this.handleMemoryTimeout(playId);
      return;
    }

    if (playState.playTimer) {
      clearTimeout(playState.playTimer);
      playState.playTimer = null;
    }

    playState.playTimer = setTimeout(() => {
      this.handleMemoryTimeout(playId);
    }, remainingTimeMs);
  }

  async handleMemoryTimeout(playId) {
    await this.executeWithPlayLock(playId, 'handle_memory_timeout', async () => {
      const playState = this.activePlays.get(playId);
      if (!playState || !this.isMemoryPlay(playState)) {
        return;
      }

      if (playState.paused || playState.playDoc.status === 'paused') {
        return;
      }

      this.metrics.totalTimeouts++;
      playState.awaitingResponse = false;
      if (playState.playTimer) {
        clearTimeout(playState.playTimer);
        playState.playTimer = null;
      }

      this.io.to(`play_${playId}`).emit('validation_result', {
        isCorrect: false,
        timeout: true,
        pointsAwarded: 0,
        newScore: playState.playDoc.score,
        mechanicType: playState.mechanicName,
        streak: 0,
        peakStreak: Number(playState.strategyState?.peakStreak || 0)
      });

      await this.endPlay(playId);
    });
  }

  // eslint-disable-next-line sonarjs/cyclomatic-complexity -- orquestacion central del juego de memoria, la complejidad es inherente al flujo
  async processMemoryScan(playId, playState, scannedCard) {
    const timeElapsed = playState.roundStartTime ? Date.now() - playState.roundStartTime : 0;
    const outcome = playState.mechanicStrategy.processScan({
      scannedCard,
      sessionDoc: playState.sessionDoc,
      strategyState: playState.strategyState,
      playDoc: playState.playDoc,
      playState
    });

    if (!outcome || outcome.type === 'ignored') {
      this.metrics.ignoredCardScans++;
      if (outcome?.board) {
        this.emitMemoryTurnState(playId, playState, { phase: 'ignored' });
      }
      return;
    }

    if (outcome.type === 'first_pick') {
      playState.roundStartTime = Date.now();

      try {
        await playState.playDoc.addEvent({
          eventType: 'card_scanned',
          cardUid: scannedCard.uid,
          expectedValue: scannedCard.assignedValue,
          actualValue: scannedCard.assignedValue,
          pointsAwarded: 0,
          timeElapsed,
          roundNumber: playState.playDoc.currentRound
        });
      } catch (err) {
        await this._emitFatalScanError(playId, playState, err, 'processMemoryScan.firstPick');
        return;
      }

      this.emitMemoryTurnState(playId, playState, { phase: 'first_pick' });
      return;
    }

    if (outcome.type !== 'resolved') {
      return;
    }

    this.metrics.totalMemoryAttempts++;

    const eventType = outcome.isCorrect ? 'correct' : 'error';
    const selectedUids = outcome.selectedUids || [];
    const firstUid = selectedUids[0] || null;
    const secondUid = selectedUids[1] || null;

    const boardByUid = new Map(
      (playState.strategyState?.boardLayout || []).map(slot => [slot.uid, slot])
    );
    const firstCard = boardByUid.get(firstUid);
    const secondCard = boardByUid.get(secondUid);

    // Bookkeeping para `finalSummary.buildMemoryFinalSummary` (ADR-A/B).
    // Mantiene streak, peakStreak, tiempo medio por pareja y primera
    // pareja acertada en el strategyState — sin tocarlo, el GameOver
    // mostraría ceros para Memoria.
    if (typeof playState.mechanicStrategy.recordScanResult === 'function') {
      playState.mechanicStrategy.recordScanResult({
        isCorrect: outcome.isCorrect,
        scannedCard,
        currentChallenge: secondCard || firstCard || null,
        timeElapsed,
        strategyState: playState.strategyState,
        sessionDoc: playState.sessionDoc
      });
    }

    try {
      await playState.playDoc.addEventAtomic(
        {
          eventType,
          cardUid: secondUid || scannedCard.uid,
          expectedValue: firstCard?.assignedValue,
          actualValue: secondCard?.assignedValue,
          pointsAwarded: Number(outcome.pointsAwarded || 0),
          timeElapsed,
          roundNumber: playState.playDoc.currentRound
        },
        { advanceRound: true }
      );
    } catch (err) {
      await this._emitFatalScanError(playId, playState, err, 'processMemoryScan.resolve');
      return;
    }

    await this.checkpointPlayIfNeeded(playId, playState);

    if (outcome.isCorrect) {
      this.metrics.totalMemoryMatches++;
    }

    const mismatchHideDelay = Number(outcome.hideAfterMs) || MEMORY_DEFAULT_HIDE_DELAY_MS;
    const feedbackDelayMs = Math.max(
      MEMORY_FEEDBACK_PAUSE_MS,
      outcome.isCorrect ? 0 : mismatchHideDelay
    );

    if (feedbackDelayMs > 0 && Number.isFinite(playState.playEndsAt)) {
      playState.playEndsAt += feedbackDelayMs;
      this.scheduleMemoryPlayTimeout(playId, playState, this.getMemoryRemainingTimeMs(playState));
    }

    this.io.to(`play_${playId}`).emit('validation_result', {
      isCorrect: outcome.isCorrect,
      expected: firstCard?.displayData || null,
      actual: {
        value: secondCard?.assignedValue || scannedCard.assignedValue
      },
      pointsAwarded: Number(outcome.pointsAwarded || 0),
      newScore: playState.playDoc.score,
      feedbackDelayMs,
      remainingTimeMs: this.getMemoryRemainingTimeMs(playState),
      // Contexto de mecánica + racha para la mascota viva (ADR-D). El
      // frontend usa estos campos en `useMascotReactions` para escoger
      // diccionario y emoción.
      mechanicType: 'memory',
      streak: Number(playState.strategyState?.currentStreak || 0),
      peakStreak: Number(playState.strategyState?.peakStreak || 0)
    });

    this.emitMemoryTurnState(playId, playState, {
      phase: outcome.isCorrect ? 'match' : 'mismatch'
    });

    if (outcome.isCorrect && playState.mechanicStrategy.isCompleted(playState.strategyState)) {
      await this.endPlay(playId);
      return;
    }

    if (!outcome.isCorrect) {
      const hideDelay = mismatchHideDelay;
      this.scheduleTransientTimer(
        playState,
        () => {
          const currentState = this.activePlays.get(playId);
          if (!currentState || !this.isMemoryPlay(currentState)) {
            return;
          }
          currentState.mechanicStrategy.concealSelected(currentState.strategyState, selectedUids);
          this.emitMemoryTurnState(playId, currentState, { phase: 'concealed' });
        },
        hideDelay
      );
    }

    playState.roundStartTime = null;
  }

  /**
   * Genera y envía el siguiente desafío al jugador, o finaliza la partida.
   *
   * Este método:
   * 1. Verifica si el juego debe continuar o finalizar
   * 2. Limpia el timer de la ronda anterior
   * 3. Genera un desafío aleatorio según la mecánica
   * 4. Emite el desafío al cliente vía Socket.IO
   * 5. Programa el timeout para la ronda
   *
   * @async
   * @param {string} playId - ID de la partida
   * @returns {Promise<void>}
   * @emits new_round - Con el desafío y límite de tiempo
   */
  async sendNextRound(playId) {
    const playState = this.activePlays.get(playId);
    if (!playState) {
      return;
    }

    // Si está pausada, NO avanzar rondas ni rearmar timers.
    if (playState.paused || playState.playDoc.status === 'paused') {
      return;
    }

    if (this.isMemoryPlay(playState)) {
      if (playState.playDoc.currentRound === 1 && !playState.roundStartTime) {
        playState.roundStartTime = Date.now();
      }

      const remainingTimeMs = this.getMemoryRemainingTimeMs(playState);
      playState.awaitingResponse = true;

      // En modo memoria el timer del backend solo arranca cuando el cliente
      // confirma `board_ready`, por lo que `remainingTimeMs` puede ser null
      // en este punto (al emitir el primer `new_round`). Si lo enviamos así,
      // `Math.ceil((null||0)/1000) = 0` y el `Math.max(1, ...)` lo deja en
      // 1 segundo, dejando la TimerBar fosilizada en `timeLimit=1` durante
      // toda la partida (QA 26/04/2026 — el usuario reportó "la barra de
      // tiempo no baja"). Para memoria publicamos siempre la duración total
      // (`playDurationMs`) como `timeLimit`; el frontend la usa como
      // `roundTime` y `useGameTimer` la sincroniza vía effect cuando el
      // posterior `memory_turn_state` con `remainingTimeMs > 0` activa
      // `memoryTimerArmed`.
      const memoryTimeLimitSec = Math.max(
        1,
        Math.ceil((playState.playDurationMs || remainingTimeMs || 0) / 1000)
      );

      this.io.to(`play_${playId}`).emit('new_round', {
        roundNumber: playState.playDoc.currentRound,
        totalRounds: Number(playState.strategyState?.totalGroups || 0),
        challenge: {
          displayData: {
            mode: 'memory_board'
          }
        },
        timeLimit: memoryTimeLimitSec,
        score: playState.playDoc.score
      });

      this.emitMemoryTurnState(playId, playState, { phase: 'round_start' });
      // Solo programar timeout si el frontend ya confirmó que el tablero es visible
      if (!playState.awaitingBoardReady) {
        this.scheduleMemoryPlayTimeout(playId, playState, remainingTimeMs);
      }
      return;
    }

    // Branch Secuencia: la mecánica tiene su propio flujo (memorizing → reproducing)
    // gestionado por sequenceFlow. selectChallenge poblará la secuencia y luego
    // startSequenceMemorizingPhase emitirá el evento + programará la transición.
    if (this.isSequencePlay(playState)) {
      const { playDoc: seqPlayDoc, sessionDoc: seqSessionDoc } = playState;
      if (seqPlayDoc.currentRound > seqSessionDoc.config.numberOfRounds) {
        await this.endPlay(playId);
        return;
      }

      if (playState.roundTimer) {
        clearTimeout(playState.roundTimer);
      }
      if (playState.nextRoundTimer) {
        clearTimeout(playState.nextRoundTimer);
        playState.nextRoundTimer = null;
      }

      const challenge = playState.mechanicStrategy.selectChallenge({
        playDoc: seqPlayDoc,
        sessionDoc: seqSessionDoc,
        playState
      });

      if (!challenge) {
        logger.error('No se pudo generar la secuencia de la ronda', {
          playId,
          mechanicName: playState.mechanicName
        });
        this.io.to(`play_${playId}`).emit('error', {
          message: 'No se pudo generar la secuencia'
        });
        await this.endPlay(playId);
        return;
      }

      playState.currentChallenge = {
        uid: null,
        assignedValue: null,
        displayData: challenge.displayData
      };

      // F-03: en la ronda 1 esperamos a board_ready (EMPEZAR) para arrancar la
      // memorización, de modo que el alumno reciba los segundos completos. El
      // challenge ya está preparado; `confirmBoardReady` disparará la fase de
      // memorización. Las rondas 2+ (con `awaitingBoardReady` ya en false, porque
      // el alumno ya está jugando) arrancan de inmediato como hasta ahora.
      if (playState.awaitingBoardReady) {
        return;
      }

      sequenceFlow.startSequenceMemorizingPhase(this, playId);
      return;
    }

    // 1. Comprobar si el juego ha terminado
    const { playDoc, sessionDoc } = playState;
    if (playDoc.currentRound > sessionDoc.config.numberOfRounds) {
      await this.endPlay(playId);
      return;
    }

    // 2. Limpiar cualquier timer anterior
    if (playState.roundTimer) {
      clearTimeout(playState.roundTimer);
    }
    if (playState.nextRoundTimer) {
      clearTimeout(playState.nextRoundTimer);
      playState.nextRoundTimer = null;
    }

    // 3. Generar el desafío según la mecánica activa
    const challengeMapping = playState.mechanicStrategy.selectChallenge({
      playDoc,
      sessionDoc,
      playState
    });

    if (!challengeMapping) {
      logger.error('No se pudo generar desafio para la ronda', {
        playId,
        mechanicName: playState.mechanicName
      });
      this.io.to(`play_${playId}`).emit('error', {
        message: 'No se pudo generar el desafio de la ronda'
      });
      await this.endPlay(playId);
      return;
    }

    playState.currentChallenge = {
      uid: challengeMapping.uid,
      assignedValue: challengeMapping.assignedValue,
      displayData: challengeMapping.displayData
    };
    playState.roundStartTime = Date.now();
    playState.awaitingResponse = true;
    playState.remainingTimeMs = null;
    playState.roundElapsedBeforePauseMs = 0;

    // 4. Persistir inicio de ronda solo si está habilitado explícitamente.
    // Por defecto se prioriza una sola escritura por ronda (resultado/timeout).
    if (PERSIST_ROUND_START_EVENTS) {
      await playDoc.addEvent({
        eventType: 'round_start',
        roundNumber: playDoc.currentRound
      });
    }

    // 5. Emitir al cliente. `promptText` opcional: en asociación el profesor
    // puede personalizar la consigna por ronda (QA 2026-04-24, PROP-102).
    // Si viene vacío, el cliente aplica el default "¿Dónde está <X>?".
    this.io.to(`play_${playId}`).emit('new_round', {
      roundNumber: playDoc.currentRound,
      totalRounds: sessionDoc.config.numberOfRounds,
      challenge: {
        displayData: challengeMapping.displayData,
        promptText: challengeMapping.promptText || undefined
      },
      timeLimit: sessionDoc.config.timeLimit,
      score: playDoc.score
    });

    logger.debug(
      `Ronda ${playDoc.currentRound} iniciada para ${playId}. Esperando tarjeta ${challengeMapping.uid}`
    );

    // 6. Programar el timeout (con grace period — PROP-79/ADR-089).
    // El cliente cree que el reloj llega a 0 a `timeLimit`, pero el servidor
    // aún acepta scans durante `ROUND_GRACE_PERIOD_MS` extra. Esto evita que
    // los scans en tránsito en el último frame se descarten como `not_awaiting`.
    playState.roundTimer = setTimeout(
      () => {
        this.handleTimeout(playId);
      },
      sessionDoc.config.timeLimit * 1000 + ROUND_GRACE_PERIOD_MS
    );
  }

  /**
   * Solicita avanzar manualmente a la siguiente ronda.
   *
   * Se bloquea si la ronda actual está esperando respuesta para evitar saltos
   * y condiciones de carrera con timeout/escaneo.
   *
   * @param {string} playId
   * @returns {Promise<{ ok: boolean, reason: string|null }>}
   */
  async advanceToNextRound(playId) {
    return this.executeWithPlayLock(playId, 'advance_to_next_round', async () => {
      const playState = this.activePlays.get(playId);
      if (!playState) {
        return { ok: false, reason: 'play_not_active' };
      }

      if (playState.awaitingResponse) {
        this.metrics.blockedManualNextRound++;
        return { ok: false, reason: 'awaiting_response' };
      }

      await this.sendNextRound(playId);
      return { ok: true, reason: null };
    });
  }

  // ============================================================================
  // MANEJO DE ENTRADAS (ESCANEOS RFID)
  // ============================================================================

  /**
   * Manejador central para todos los escaneos de tarjetas RFID.
   *
   * Este método es invocado desde server.js cada vez que el rfidService detecta una tarjeta.
   * Utiliza el mapa cardUidToPlayId para búsqueda O(1) de la partida asociada.
   *
   * Flujo:
   * 1. Buscar a qué partida pertenece la tarjeta escaneada
   * 2. Verificar que la partida esté esperando respuesta
   * 3. Limpiar el timer de timeout
   * 4. Procesar la respuesta
   *
   * @async
   * @param {string} uid - UID de la tarjeta RFID escaneada (formato hexadecimal mayúsculas)
   * @returns {Promise<void>}
   */
  async handleCardScan(uid) {
    this.metrics.totalCardScans++;

    // 1. Búsqueda O(1) para encontrar la partida
    const playId = this.cardUidToPlayId.get(uid);
    if (!playId) {
      this.metrics.ignoredCardScans++;
      // Agrupamos el log por UID/ventana de 60s para no inundar producción
      // si alguien escanea repetidamente una tarjeta no registrada.
      const existing = cardNotInPlayCounters.get(uid);
      const now = Date.now();
      if (!existing) {
        cardNotInPlayCounters.set(uid, { count: 1, firstAt: now });
      } else if (now - existing.firstAt > CARD_NOT_IN_PLAY_LOG_WINDOW_MS) {
        logger.info('Tarjeta escaneada sin partida activa', {
          uid,
          occurrencesInWindow: existing.count,
          windowMs: CARD_NOT_IN_PLAY_LOG_WINDOW_MS
        });
        cardNotInPlayCounters.set(uid, { count: 1, firstAt: now });
      } else {
        existing.count++;
      }
      return;
    }

    await this.executeWithPlayLock(playId, 'handle_card_scan', async () => {
      // 2. Obtener el estado del juego
      const playState = this.activePlays.get(playId);

      // Ignorar escaneos si la partida está pausada.
      // C.3 (pre-v1.0.0): `volatile.emit` para `scan_ignored` — si el
      // cliente está bajo backpressure (red flaky, tab inactiva), el
      // servidor descarta este aviso en vez de encolar. El cliente sigue
      // viendo el siguiente scan correcto: estos eventos son feedback
      // informativo, no afectan correctness. Defensive fallback si el
      // mock io no expone `.volatile` (tests legacy).
      const safeVolatileEmit = (room, event, payload) => {
        const target = this.io.to(room);
        const channel = target.volatile || target;
        return channel.emit(event, payload);
      };
      if (playState?.paused || playState?.playDoc?.status === 'paused') {
        this.metrics.ignoredCardScans++;
        logger.debug(`Tarjeta ${uid} ignorada: partida ${playId} en pausa.`);
        safeVolatileEmit(`play_${playId}`, 'scan_ignored', {
          uid,
          reason: SCAN_IGNORED_REASONS.PLAY_PAUSED
        });
        return;
      }

      if (!playState?.awaitingResponse) {
        this.metrics.scanRaceDiscarded++;
        this.metrics.ignoredCardScans++;
        // El juego existe, pero no está esperando una respuesta
        // (ej. escaneo demasiado rápido, o entre rondas)
        logger.debug(`Tarjeta ${uid} escaneada para ${playId}, pero no se esperaba respuesta.`);
        safeVolatileEmit(`play_${playId}`, 'scan_ignored', {
          uid,
          reason: SCAN_IGNORED_REASONS.NOT_AWAITING
        });
        return;
      }

      // 3. Búsqueda O(1) del mapping de la tarjeta escaneada
      const scannedCardMapping = playState.uidToMapping.get(uid);
      if (!scannedCardMapping) {
        this.metrics.ignoredCardScans++;
        // Esto NO debería ocurrir si el índice está sincronizado correctamente
        logger.error(
          `Error CRÍTICO: ${uid} mapeado a ${playId} pero no encontrado en uidToMapping.`
        );
        this.io
          .to(`play_${playId}`)
          .emit('scan_ignored', { uid, reason: SCAN_IGNORED_REASONS.CARD_NOT_IN_PLAY });
        return;
      }

      // 4. Respuesta recibida → limpiar el timer (no aplica a memoria, que
      // tiene su propio playTimer; tampoco a Secuencia, que mantiene el timer
      // de ronda hasta que se complete o expire la fase reproducing).
      if (!this.isMemoryPlay(playState) && !this.isSequencePlay(playState)) {
        clearTimeout(playState.roundTimer);
        playState.roundTimer = null;
        playState.awaitingResponse = false;
      }

      // 5. Procesar la respuesta según mecánica
      if (this.isMemoryPlay(playState)) {
        await this.processMemoryScan(playId, playState, scannedCardMapping);
      } else if (this.isSequencePlay(playState)) {
        await sequenceFlow.processSequenceScan(this, playId, playState, scannedCardMapping);
      } else {
        await this.processResponse(playId, playState, scannedCardMapping);
      }
    });
  }

  /**
   * Obtiene el playId asociado a un UID de tarjeta si está en una partida activa.
   * @param {string} uid
   * @returns {string|null}
   */
  getPlayIdByCardUid(uid) {
    return this.cardUidToPlayId.get(uid) || null;
  }

  /**
   * Procesa y valida la respuesta del jugador tras un escaneo.
   *
   * Este método:
   * 1. Compara la tarjeta escaneada con la respuesta correcta
   * 2. Calcula puntuación (positiva o negativa)
   * 3. Registra el evento en la base de datos
   * 4. Emite el resultado al cliente
   * 5. Programa el siguiente desafío con un delay (para feedback visual)
   *
   * @async
   * @param {string} playId - ID de la partida
   * @param {Object} playState - Estado actual de la partida en memoria
   * @param {Object} scannedCard - Mapping de la tarjeta escaneada
   * @returns {Promise<void>}
   * @emits validation_result - Con corrección, puntos y nueva puntuación
   */
  async processResponse(playId, playState, scannedCard) {
    const { playDoc, sessionDoc, currentChallenge } = playState;
    const timeElapsed = Date.now() - playState.roundStartTime;

    // PROP-79 / ADR-089: contar scans rescatados por la ventana de gracia.
    // Si el tiempo transcurrido superó el `timeLimit` declarado al cliente,
    // este scan llegó dentro del buffer extra del servidor y de no haber
    // existido se habría descartado como `not_awaiting`.
    const declaredLimitMs = (sessionDoc?.config?.timeLimit || 0) * 1000;
    if (declaredLimitMs > 0 && timeElapsed > declaredLimitMs) {
      this.metrics.scansSavedByGracePeriod++;
    }

    // 1. Validar la respuesta POR VALOR (`assignedValue`), no por UID. En
    // Asociación el reto es un CONCEPTO ("encuentra el perro"): cualquier carta
    // cuyo valor coincida es correcta. Validar por UID marcaba ERROR la "otra"
    // carta del mismo valor en mazos con valores duplicados (creables por el
    // flujo normal del wizard — p. ej. el mazo seed "Formas Memoria" usado en una
    // sesión de Asociación) — exactamente el síntoma de BUG-FALLBACK-1. En mazos
    // de valores únicos (el caso normal) valor≡uid, así que es no-op. El resto del
    // flujo (eventos `expectedValue`/`actualValue`, `byValueAccuracy`) ya razona
    // por valor; esto alinea la corrección con la analítica.
    const isCorrect =
      Boolean(scannedCard.assignedValue) &&
      scannedCard.assignedValue === currentChallenge.assignedValue;

    // Logging defensivo (QA 2026-05-14): cuando un scan se marca como error
    // queremos saber el par scannedUid vs expectedUid y la fuente para
    // diagnosticar BUG-FALLBACK-1 (touch panel marcando aciertos como errores
    // en algunos flujos). En aciertos no logueamos para no inundar.
    if (!isCorrect) {
      logger.info('Asociación: scan incorrecto', {
        playId,
        round: playDoc?.currentRound,
        scannedUid: scannedCard?.uid,
        scannedValue: scannedCard?.assignedValue,
        expectedUid: currentChallenge?.uid,
        expectedValue: currentChallenge?.assignedValue,
        timeElapsedMs: timeElapsed
      });
    }

    let pointsAwarded = 0;
    let eventType;

    if (isCorrect) {
      pointsAwarded = sessionDoc.config.pointsPerCorrect;
      eventType = 'correct';
    } else {
      pointsAwarded = sessionDoc.config.penaltyPerError;
      eventType = 'error';
    }

    // Bookkeeping para `finalSummary.buildAssociationFinalSummary`
    // (ADR-A/B): peakStreak, quickestCorrectMs, byValueAccuracy. Sin esta
    // llamada el GameOver de Asociación seguiría sin métrica "categoría
    // dominante" ni racha, perdiendo señal pedagógica clave.
    if (typeof playState.mechanicStrategy?.recordScanResult === 'function') {
      playState.mechanicStrategy.recordScanResult({
        isCorrect,
        scannedCard,
        currentChallenge,
        timeElapsed,
        strategyState: playState.strategyState,
        sessionDoc
      });
    }

    // `penaltyPerError` ya viene con signo (e.g. -2), por lo que usamos el
    // propio signo del valor en el log. El previo `symbol = '-'` producia
    // `--2 pts` al concatenar con un valor negativo (QA 2026-04-24).
    const symbol = pointsAwarded >= 0 ? '+' : '';

    // 2. Crear el evento para la BD
    const eventData = {
      eventType,
      cardUid: scannedCard.uid, // UID (String) de la carta elegida como respuesta
      expectedValue: currentChallenge.assignedValue,
      actualValue: scannedCard.assignedValue,
      pointsAwarded,
      timeElapsed,
      roundNumber: playDoc.currentRound
    };

    // 3. Guardar el evento y avanzar ronda en una sola operación atómica.
    //    Si falla la persistencia, interrumpimos la partida en lugar de
    //    emitir un validation_result con score posiblemente incorrecto.
    try {
      await playDoc.addEventAtomic(eventData, { advanceRound: true });
    } catch (err) {
      await this._emitFatalScanError(playId, playState, err, 'processResponse');
      return;
    }

    await this.checkpointPlayIfNeeded(playId, playState);

    // 4. Emitir el resultado al cliente
    this.io.to(`play_${playId}`).emit('validation_result', {
      isCorrect,
      expected: currentChallenge.displayData,
      actual: {
        value: scannedCard.assignedValue
      },
      pointsAwarded,
      newScore: playDoc.score,
      // Contexto para la mascota viva y para que el frontend pueda
      // resaltar visualmente picos de racha (ADR-D). En Asociación la
      // racha se rompe con cualquier fallo.
      mechanicType: 'association',
      streak: Number(playState.strategyState?.currentStreak || 0),
      peakStreak: Number(playState.strategyState?.peakStreak || 0)
    });

    logger.info(
      `Partida: ${playId} | Ronda: ${playDoc.currentRound} | ${eventType} (${symbol}${pointsAwarded} pts)`
    );

    this.metrics.totalRoundResponses++;
    this.metrics.averageRoundResponseTimeMs =
      (this.metrics.averageRoundResponseTimeMs * (this.metrics.totalRoundResponses - 1) +
        timeElapsed) /
      this.metrics.totalRoundResponses;

    // 5. Pasar a la siguiente ronda tras la pausa de feedback. El valor
    //    está parametrizado en `ASSOCIATION_NEXT_ROUND_DELAY_MS` para que
    //    el pacing sea coherente con el resto de mecánicas y para
    //    desbloquear el panel táctil (que reabre cards al cambiar `round`)
    //    en un tiempo razonable.
    playState.nextRoundTimer = setTimeout(() => {
      this.advanceToNextRound(playId);
    }, ASSOCIATION_NEXT_ROUND_DELAY_MS);
  }

  /**
   * Maneja el timeout cuando el jugador no responde a tiempo.
   *
   * Este método se ejecuta automáticamente cuando el timer de la ronda expira.
   * No otorga ni resta puntos, pero registra el evento y avanza a la siguiente ronda.
   *
   * @async
   * @param {string} playId - ID de la partida
   * @returns {Promise<void>}
   * @emits validation_result - Indicando timeout sin puntuación
   */
  async handleTimeout(playId) {
    await this.executeWithPlayLock(playId, 'handle_timeout', async () => {
      const playState = this.activePlays.get(playId);
      if (!playState?.awaitingResponse) {
        // La respuesta llegó justo a tiempo, el timer ya fue limpiado
        this.metrics.scanRaceDiscarded++;
        return;
      }

      // Si está pausada, ignorar (race conditions)
      if (playState.paused || playState.playDoc.status === 'paused') {
        return;
      }

      if (this.isMemoryPlay(playState)) {
        await this.handleMemoryTimeout(playId);
        return;
      }

      logger.info(`Partida: ${playId} | Ronda: ${playState.playDoc.currentRound} | TIMEOUT`);
      this.metrics.totalTimeouts++;

      // 1. Limpiar estado
      playState.awaitingResponse = false;
      playState.roundTimer = null; // El timer ya se disparó
      const { playDoc, sessionDoc, currentChallenge } = playState;

      // Un timeout rompe la racha igual que un error. Sin esto, `recordScanResult`
      // (que sí resetea la racha en error) no se invocaba en el path de timeout, y
      // `peakStreak`/"Mejor racha" de Asociación sobrevivía a las rondas no
      // respondidas, inflando el resumen final (acierto, acierto, timeout,
      // acierto, acierto → racha 4 que el alumno nunca encadenó).
      if (typeof playState.mechanicStrategy?.recordTimeout === 'function') {
        playState.mechanicStrategy.recordTimeout(playState.strategyState);
      }

      // 2. Crear el evento 'timeout' (sin puntos)
      const eventData = {
        eventType: 'timeout',
        expectedValue: currentChallenge.assignedValue,
        timeElapsed: sessionDoc.config.timeLimit * 1000,
        roundNumber: playDoc.currentRound
      };

      // 3. Guardar en BD y avanzar ronda en una sola operación atómica.
      //    Si falla la persistencia, interrumpimos la partida en lugar de
      //    emitir un validation_result inconsistente.
      try {
        await playDoc.addEventAtomic(eventData, { advanceRound: true });
      } catch (err) {
        await this._emitFatalScanError(playId, playState, err, 'handleTimeout');
        return;
      }

      await this.checkpointPlayIfNeeded(playId, playState);

      // 4. Emitir al cliente
      this.io.to(`play_${playId}`).emit('validation_result', {
        isCorrect: false,
        timeout: true,
        expected: currentChallenge.displayData,
        pointsAwarded: 0,
        newScore: playDoc.score,
        mechanicType: playState.mechanicName,
        streak: 0,
        peakStreak: Number(playState.strategyState?.peakStreak || 0)
      });

      // 5. Pasar a la siguiente ronda — alineado con la pausa post-respuesta
      //    para ofrecer pacing predecible al alumno.
      playState.nextRoundTimer = setTimeout(() => {
        this.advanceToNextRound(playId);
      }, ASSOCIATION_TIMEOUT_NEXT_ROUND_DELAY_MS);
    });
  }

  // ============================================================================
  // UTILIDADES Y GESTIÓN DE ESTADO
  // ============================================================================

  /**
   * Maneja un error fatal durante el procesamiento de un escaneo:
   * loguea, notifica a Sentry, emite `play_interrupted` al cliente y
   * cierra la partida de forma segura. Cualquier excepción durante
   * `endPlay` se ignora para no escalar el fallo.
   *
   * @param {string} playId
   * @param {Object} playState
   * @param {Error} err
   * @param {string} context Identificador del path (processResponse/Memory/Timeout)
   */
  async _emitFatalScanError(playId, playState, err, context) {
    const finalScore = playState?.playDoc?.score ?? 0;
    logger.error('Fallo fatal procesando scan RFID', {
      playId,
      context,
      err: err?.message,
      stack: err?.stack
    });
    Sentry.captureException(err, {
      tags: { module: 'gameEngine', path: context },
      extra: { playId }
    });
    try {
      this.io.to(`play_${playId}`).emit('play_interrupted', {
        playId,
        reason: PLAY_INTERRUPTED_REASONS.INTERNAL_ERROR,
        message: 'Error interno procesando el escaneo. La partida se ha interrumpido.',
        finalScore
      });
    } catch (emitErr) {
      logger.warn('No se pudo emitir play_interrupted', {
        playId,
        emitErr: emitErr?.message
      });
    }
    try {
      await this.endPlay(playId);
    } catch (endErr) {
      logger.warn('Error cerrando partida tras fallo fatal', {
        playId,
        endErr: endErr?.message
      });
    }
  }

  getPlayState(playId) {
    return stateHelpers.getPlayState(this, playId);
  }
  getRealtimeRemainingTimeMs(playState) {
    return stateHelpers.getRealtimeRemainingTimeMs(playState);
  }
  getPlayRuntimeContext(playId) {
    return stateHelpers.getPlayRuntimeContext(this, playId);
  }

  /**
   * Pausa una partida en curso.
   *
   * Congela el timer, persiste el estado y notifica al cliente.
   *
   * @param {string} playId - ID de la partida a pausar
   */
  pausePlay(playId) {
    return this.pausePlayInternal(playId);
  }

  /**
   * Pausa una partida en curso (impl).
   * Congela el timer de la ronda actual y persiste el estado en BD.
   *
   * @private
   * @param {string} playId
   * @param {Object} [options]
   * @param {string} [options.requestedBy] - userId del profesor (opcional, para control de permisos)
   * @returns {Promise<{ remainingTimeMs: number | null }>} tiempo restante en ms
   */
  async pausePlayInternal(playId, options = {}) {
    // T-904 Fase A: span manual para pause/resume (más cortos que start/end
    // pero útiles para detectar latencia anómala en lock distribuido).
    return Sentry.startSpan(
      {
        name: 'gameplay.pausePlay',
        op: 'gameplay.pauseResume',
        attributes: {
          'play.id': playId,
          'user.id': options?.requestedBy?.toString()
        }
      },
      () =>
        this.executeWithPlayLock(playId, 'pause_play', async () => {
          const playState = this.activePlays.get(playId);
          if (!playState) {
            return { remainingTimeMs: null };
          }

          // Control de permisos
          if (!this.isPlayOwner(playState, options.requestedBy)) {
            this.io.to(`play_${playId}`).emit('error', {
              code: 'FORBIDDEN',
              message: 'No autorizado para pausar esta partida'
            });
            return { remainingTimeMs: null };
          }

          if (playState.paused || playState.playDoc.status === 'paused') {
            return {
              remainingTimeMs: playState.remainingTimeMs ?? playState.playDoc.remainingTime ?? null
            };
          }

          return this.executePause(playId, playState);
        })
    );
  }

  /**
   * Ejecuta la lógica de pausa una vez validados permisos y estado.
   */
  async executePause(playId, playState) {
    // En Secuencia, capturamos el tiempo restante de la fase memorizing antes
    // de limpiar timers para reanudarla con precisión tras el resume.
    if (this.isSequencePlay(playState)) {
      sequenceFlow.pauseMemorizingPhase(playState);
    }

    this.clearPlayTimers(playState);

    const remainingTimeMs = this.calculatePauseRemainingTime(playState);
    const pausedDuringFeedback =
      !this.isMemoryPlay(playState) &&
      !this.isSequencePlay(playState) &&
      !playState.awaitingResponse &&
      remainingTimeMs === null;

    playState.paused = true;
    playState.pausedAt = Date.now();
    playState.remainingTimeMs = remainingTimeMs;
    playState.pausedDuringFeedback = pausedDuringFeedback;
    playState.awaitingResponse = false;
    if (this.isMemoryPlay(playState)) {
      playState.playEndsAt = null;
    }

    await this.persistPauseState(playId, playState, remainingTimeMs);

    this.io.to(`play_${playId}`).emit('play_paused', {
      playId,
      currentRound: playState.playDoc.currentRound,
      remainingTimeMs
    });

    logger.info(`Partida ${playId} pausada`, { playId, remainingTimeMs });
    return { remainingTimeMs };
  }

  calculatePauseRemainingTime(playState) {
    return stateHelpers.calculatePauseRemainingTime(playState);
  }

  /**
   * Persiste el estado de pausa en BD.
   */
  async persistPauseState(playId, playState, remainingTimeMs) {
    try {
      playState.playDoc.status = 'paused';
      playState.playDoc.pausedAt = new Date(playState.pausedAt);
      playState.playDoc.remainingTime = remainingTimeMs;
      await playState.playDoc.save();
      await recalculateSessionStatusFromPlays(playState.playDoc.sessionId);
    } catch (err) {
      logger.error(`Error persistiendo pausa para ${playId}: ${err.message}`);
    }
  }

  isPlayOwner(playState, requestedBy) {
    return stateHelpers.isPlayOwner(playState, requestedBy);
  }

  scheduleTransientTimer(playState, callback, delayMs) {
    return timerManager.scheduleTransientTimer(playState, callback, delayMs);
  }
  clearPlayTimers(playState) {
    timerManager.clearPlayTimers(playState);
  }
  getPlayRemainingTimeMs(playState) {
    return stateHelpers.getPlayRemainingTimeMs(playState);
  }
  restoreRoundStartTime(playState) {
    stateHelpers.restoreRoundStartTime(playState);
  }

  async persistPlayResumed(playId, playState) {
    try {
      playState.playDoc.status = 'in-progress';
      playState.playDoc.pausedAt = null;
      playState.playDoc.remainingTime = null;
      await playState.playDoc.save();
      await recalculateSessionStatusFromPlays(playState.playDoc.sessionId);
    } catch (err) {
      logger.error(`Error persistiendo reanudación para ${playId}: ${err.message}`);
    }
  }

  /**
   * Reanuda una partida pausada.
   *
   * Reanuda el desafío actual y rearma el timer con el tiempo restante.
   *
   * @param {string} playId - ID de la partida a reanudar
   */
  resumePlay(playId) {
    return this.resumePlayInternal(playId);
  }

  /**
   * Confirma que el tablero de memoria está visible en el frontend.
   * Inicia el timer de la partida de memoria.
   */
  async confirmBoardReady(playId) {
    const playState = this.activePlays.get(playId);
    if (!playState || !playState.awaitingBoardReady) {
      return;
    }

    // Si la partida se pausó en la ventana entre "entrar a playing" y confirmar
    // board_ready, NO arrancamos el timer ahora: quedaría corriendo con la
    // partida pausada y, al reanudar, no se re-armaría (remainingTime es null) →
    // partida sin timeout. Marcamos que board_ready llegó durante la pausa para
    // re-arrancarlo al reanudar (`resumePlayInternal`), con el alumno ya viendo
    // el tablero. `awaitingBoardReady` se mantiene true.
    if (playState.paused || playState.playDoc?.status === 'paused') {
      playState._boardReadyDuringPause = true;
      return;
    }

    // Secuencia (F-03): arrancar la memorización de la ronda 1 AHORA que el
    // alumno ha pulsado EMPEZAR y ve el tablero — no en el bootstrap. Así recibe
    // los segundos completos de memorización. El challenge ya quedó preparado en
    // `sendNextRound`.
    if (this.isSequencePlay(playState)) {
      playState.awaitingBoardReady = false;
      sequenceFlow.startSequenceMemorizingPhase(this, playId);
      logger.info('Memorización de Secuencia iniciada tras board_ready', { playId });
      return;
    }

    if (!this.isMemoryPlay(playState)) {
      return;
    }

    playState.awaitingBoardReady = false;
    playState.playEndsAt = Date.now() + playState.playDurationMs;
    this.scheduleMemoryPlayTimeout(playId, playState, playState.playDurationMs);

    // Re-emitir estado del tablero para que el cliente reciba ya un
    // `remainingTimeMs > 0` y active `memoryTimerArmed`. Sin esto, el primer
    // `memory_turn_state` (emitido al `new_round`) viajaba con
    // `remainingTimeMs = null` (porque playEndsAt aún no estaba seteado);
    // los `memory_turn_state` siguientes solo se emiten al levantar cartas,
    // así que la barra del cliente no podía empezar a decrementar hasta
    // que el alumno tocaba la primera carta (QA 26/04/2026).
    this.emitMemoryTurnState(playId, playState, { phase: 'round_start' });

    logger.info('Timer de memoria iniciado tras board_ready', {
      playId,
      durationMs: playState.playDurationMs
    });
  }

  /**
   * Reanuda la fase correcta de una partida de Secuencia tras una pausa, según
   * `strategyState.phase`:
   *  - `memorizing`: reprograma la transición de memorización con lo restante.
   *  - `reproducing`: rearma el `roundTimer` con el tiempo restante (+ grace).
   *  - `completed`: reprograma el avance entre rondas — sin esto la partida
   *    quedaba colgada en 'completed' (scans rechazados como 'not_reproducing' y
   *    la última ronda sin llegar a `endPlay`).
   *
   * @private
   * @param {string} playId
   * @param {Object} playState
   * @param {number|null} remainingTimeMs
   */
  _resumeSequencePhaseOnResume(playId, playState, remainingTimeMs) {
    const phase = playState.strategyState?.phase;
    if (phase === 'memorizing') {
      sequenceFlow.resumeMemorizingPhase(this, playId);
    } else if (
      phase === 'reproducing' &&
      typeof remainingTimeMs === 'number' &&
      remainingTimeMs > 0
    ) {
      playState.roundTimer = setTimeout(() => {
        sequenceFlow.handleSequenceRoundTimeout(this, playId);
      }, remainingTimeMs + ROUND_GRACE_PERIOD_MS);
    } else if (phase === 'completed') {
      sequenceFlow.resumeFeedbackPhase(this, playId);
    }
  }

  /**
   * Tras reanudar una partida de Memoria, oculta un posible grupo NO resuelto
   * (mismatch) cuyo timer transitorio de ocultado se canceló al pausar. Sin
   * esto las cartas no emparejadas quedaban boca arriba y el siguiente toque se
   * evaluaba como un grupo de 3 (fallo espurio). Un acierto vacía `selectedUids`
   * al instante, así que `length >= groupSize` solo ocurre en un fallo pendiente
   * de ocultar; el primer flip de una pareja deja length 1 y no se toca.
   *
   * @private
   * @param {Object} playState
   */
  _concealPendingMismatchOnResume(playState) {
    const groupSize =
      Number(playState.sessionDoc?.mechanicId?.rules?.behavior?.matchingGroupSize) || 2;
    const pendingSelection = playState.strategyState?.selectedUids || [];
    if (
      pendingSelection.length >= groupSize &&
      typeof playState.mechanicStrategy?.concealSelected === 'function'
    ) {
      playState.mechanicStrategy.concealSelected(playState.strategyState, pendingSelection);
    }
  }

  /**
   * Reanuda una partida pausada (impl).
   * Reinicia el timer desde el tiempo restante y mantiene el desafío actual.
   *
   * @private
   * @param {string} playId
   * @param {Object} [options]
   * @param {string} [options.requestedBy] - userId del profesor (opcional, para control de permisos)
   * @returns {Promise<{ remainingTimeMs: number | null }>} tiempo restante rearmado en ms
   */
  async resumePlayInternal(playId, options = {}) {
    return Sentry.startSpan(
      {
        name: 'gameplay.resumePlay',
        op: 'gameplay.pauseResume',
        attributes: {
          'play.id': playId,
          'user.id': options?.requestedBy?.toString()
        }
      },
      () =>
        this.executeWithPlayLock(playId, 'resume_play', async () => {
          const playState = this.activePlays.get(playId);
          if (!playState) {
            return { remainingTimeMs: null };
          }

          // Control de permisos (si nos pasan el profesor)
          if (!this.isPlayOwner(playState, options.requestedBy)) {
            this.io.to(`play_${playId}`).emit('error', {
              code: 'FORBIDDEN',
              message: 'No autorizado para reanudar esta partida'
            });
            return { remainingTimeMs: null };
          }

          if (!playState.paused && playState.playDoc.status !== 'paused') {
            return { remainingTimeMs: null };
          }

          // Cancelar timers residuales
          this.clearPlayTimers(playState);

          const remainingTimeMs = this.getPlayRemainingTimeMs(playState);

          // Restaurar el roundStartTime para que el cálculo timeElapsed NO incluya la pausa
          this.restoreRoundStartTime(playState);

          // Marcar como reanudada
          playState.paused = false;
          playState.pausedAt = null;
          playState.remainingTimeMs = null;
          const wasPausedDuringFeedback = playState.pausedDuringFeedback || false;
          playState.pausedDuringFeedback = false;
          playState.awaitingResponse = !wasPausedDuringFeedback;

          // Capturamos si board_ready seguía PENDIENTE antes de reanudar (el
          // re-trigger de `_boardReadyDuringPause` de abajo llama a
          // confirmBoardReady, que pone awaitingBoardReady=false). Sirve para que
          // el bloque de resume de Secuencia NO reanude la memorización cuando
          // ésta NUNCA arrancó (board_ready diferido por pausa): de eso se encarga
          // el re-trigger. Sin esto habría un doble `scheduleMemorizingTransition`.
          const wasAwaitingBoardReady = Boolean(playState.awaitingBoardReady);

          if (
            this.isMemoryPlay(playState) &&
            typeof remainingTimeMs === 'number' &&
            remainingTimeMs > 0
          ) {
            playState.playEndsAt = Date.now() + remainingTimeMs;
            this.scheduleMemoryPlayTimeout(playId, playState, remainingTimeMs);
          }

          // Si board_ready llegó DURANTE la pausa, se aplazó (confirmBoardReady no
          // arranca timers en pausa). Ya reanudada (paused=false), lo re-disparamos
          // para arrancar el timer con el alumno viendo el tablero — si no, la
          // partida quedaba sin timeout. `awaitingBoardReady` sigue true.
          if (playState._boardReadyDuringPause && playState.awaitingBoardReady) {
            playState._boardReadyDuringPause = false;
            await this.confirmBoardReady(playId);
          }

          // Persistir en BD
          await this.persistPlayResumed(playId, playState);

          // Reenviar desafío actual (útil si el cliente recargó)
          if (playState.currentChallenge) {
            this.io.to(`play_${playId}`).emit('play_resumed', {
              playId,
              currentRound: playState.playDoc.currentRound,
              remainingTimeMs,
              challenge: { displayData: playState.currentChallenge.displayData }
            });
          } else {
            this.io.to(`play_${playId}`).emit('play_resumed', {
              playId,
              currentRound: playState.playDoc.currentRound,
              remainingTimeMs
            });
          }

          if (this.isMemoryPlay(playState)) {
            this._concealPendingMismatchOnResume(playState);
            this.emitMemoryTurnState(playId, playState, { phase: 'resumed' });
          }

          // Rearmar timer con el tiempo restante (si aplica). Excluye Memoria (su
          // timer es global y se rearma arriba) y Secuencia (gestión propia).
          if (
            !this.isMemoryPlay(playState) &&
            !this.isSequencePlay(playState) &&
            !wasPausedDuringFeedback &&
            playState.currentChallenge &&
            typeof remainingTimeMs === 'number' &&
            remainingTimeMs > 0
          ) {
            // Grace period también al reanudar tras pausa (PROP-79/ADR-089).
            playState.roundTimer = setTimeout(() => {
              this.handleTimeout(playId);
            }, remainingTimeMs + ROUND_GRACE_PERIOD_MS);
          }

          // Secuencia: reanuda la fase correcta (memorizing / reproducing /
          // completed) según `strategyState.phase`. SOLO si la fase ya había
          // arrancado (board_ready confirmado): si board_ready estaba pendiente,
          // la memorización nunca empezó y la reanuda el re-trigger de
          // `_boardReadyDuringPause` (o board_ready post-resume) — evitamos así un
          // doble scheduleMemorizingTransition y el caso NaN→reproducing.
          if (this.isSequencePlay(playState) && !wasAwaitingBoardReady) {
            this._resumeSequencePhaseOnResume(playId, playState, remainingTimeMs);
          }

          // Si la pausa ocurrió durante el delay entre rondas, avanzar a la siguiente
          // (no aplica a Memoria ni a Secuencia, que tienen su propio flujo).
          if (
            wasPausedDuringFeedback &&
            !this.isMemoryPlay(playState) &&
            !this.isSequencePlay(playState)
          ) {
            await this.sendNextRound(playId);
          }

          logger.info(`Partida ${playId} reanudada`, { playId, remainingTimeMs });
          return { remainingTimeMs };
        })
    );
  }

  /**
   * Detiene el motor de juego y limpia todos los recursos.
   * Debe ser llamado durante el shutdown del servidor.
   *
   * @async
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info('Iniciando shutdown del GameEngine...');

    // Detener el cleanup timer
    this.stopCleanupTimer();
    this.stopLockHeartbeatTimer();

    // Finalizar todas las partidas activas
    const activePlayIds = Array.from(this.activePlays.keys());

    logger.info(`Finalizando ${activePlayIds.length} partidas activas...`);

    await this.processInBatches(activePlayIds, async playId => {
      await this.endPlay(playId);
    });

    // (D10-004) Limpieza de Maps cuyo contenido podría haber quedado zombie
    // por errores síncronos en `executeWithPlayLock` (Promise rechazada
    // antes de llegar al `.finally()`). El shutdown es el último recurso
    // para soltar memoria si ocurrió esa race; en operación normal estos
    // Maps ya quedan vacíos tras `endPlay` de cada partida.
    this.playLocks.clear();
    cardNotInPlayCounters.clear();

    logger.info('GameEngine detenido correctamente', {
      metrics: this.metrics
    });
  }

  /**
   * Obtiene métricas del motor de juego.
   *
   * @returns {Object} Métricas actuales
   */
  getMetrics() {
    return {
      ...this.metrics,
      activePlays: this.activePlays.size,
      cardMappings: this.cardUidToPlayId.size,
      timestamp: new Date().toISOString()
    };
  }

  // ============================================================================
  // SINCRONIZACIÓN CON REDIS
  // ============================================================================

  /**
   * Sincroniza el estado de una partida activa con Redis.
   * Almacena solo datos serializables (no timers ni funciones).
   *
   * @async
   * @param {string} playId - ID de la partida
   * @param {Object} playState - Estado de la partida
   * @returns {Promise<void>}
   */
  async syncPlayToRedis(playId, playState) {
    try {
      // Serializar solo datos necesarios (no timers)
      const redisState = {
        playDocId: playState.playDoc._id.toString(),
        sessionDocId: playState.sessionDoc._id.toString(),
        currentRound: playState.playDoc.currentRound,
        score: playState.playDoc.score,
        status: playState.playDoc.status,
        paused: playState.paused || false,
        pausedAt: playState.pausedAt ? playState.pausedAt.toISOString() : null,
        remainingTimeMs: playState.remainingTimeMs || null,
        awaitingResponse: playState.awaitingResponse || false,
        createdAt: playState.createdAt,
        currentChallenge: playState.currentChallenge || null
      };

      await redisService.hset(
        redisService.NAMESPACES.PLAY,
        playId,
        redisState,
        DISTRIBUTED_LOCK_TTL_SECONDS
      );

      logger.debug(`Partida ${playId} sincronizada con Redis`);
    } catch (error) {
      logger.error(`Error al sincronizar partida ${playId} con Redis:`, { error: error.message });
    }
  }

  /**
   * Persiste el estado de la partida en MongoDB si se cumplen los umbrales de checkpoint.
   * Los checkpoints reducen la ventana de pérdida de datos ante un crash del servidor:
   * sin ellos, el progreso completo entre startPlay() y endPlay() vive solo en memoria.
   *
   * @private
   * @async
   * @param {string} playId - ID de la partida
   * @param {Object} playState - Estado de la partida
   * @returns {Promise<void>}
   */
  async checkpointPlayIfNeeded(playId, playState) {
    try {
      const now = Date.now();
      const eventCount = playState.playDoc.metrics?.totalAttempts || 0;
      const eventsDelta = eventCount - playState.lastCheckpointEventCount;
      const timeDelta = now - playState.lastCheckpointAt;

      if (eventsDelta < CHECKPOINT_EVENT_THRESHOLD && timeDelta < CHECKPOINT_INTERVAL_MS) {
        return;
      }

      await playState.playDoc.save();
      await this.syncPlayToRedis(playId, playState);

      playState.lastCheckpointEventCount = eventCount;
      playState.lastCheckpointAt = now;

      this.metrics.checkpointExecuted++;

      logger.debug(`Checkpoint de partida ${playId}`, {
        playId,
        eventsDelta,
        timeDelta: `${(timeDelta / 1000).toFixed(1)}s`,
        score: playState.playDoc.score,
        currentRound: playState.playDoc.currentRound
      });
    } catch (error) {
      logger.warn(`Error en checkpoint de partida ${playId} (no crítico):`, {
        playId,
        error: error.message
      });
    }
  }

  // ── Delegados a recovery.js ──────────────────────────────────────────
  async recoverActivePlays() {
    return recovery.recoverActivePlays(this);
  }
  async recoverOrphanedPlaysFromDB() {
    return recovery.recoverOrphanedPlaysFromDB(this);
  }
  async recoverPlayFromRedis(playId) {
    return recovery.recoverPlayFromRedis(this, playId);
  }
  async markPlayAbandonedIfNeeded(playId, playDoc) {
    return recovery.markPlayAbandonedIfNeeded(this, playId, playDoc);
  }
  async cleanupSessionCardMappings(sessionDocId, playId) {
    return recovery.cleanupSessionCardMappings(this, sessionDocId, playId);
  }
}

module.exports = GameEngine;
module.exports.CARD_NOT_IN_PLAY_LOG_WINDOW_MS = CARD_NOT_IN_PLAY_LOG_WINDOW_MS;
module.exports.LOCK_CONTENTION_ALERT_THRESHOLD = LOCK_CONTENTION_ALERT_THRESHOLD;
module.exports.resetCardNotInPlayCountersForTests = resetCardNotInPlayCountersForTests;
module.exports.peekCardNotInPlayCountersForTests = peekCardNotInPlayCountersForTests;
