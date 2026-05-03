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
const { cacheInvalidateNamespace } = require('../../utils/cacheHelper');
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

    return this.executeWithPlayLock(playId, 'startPlay', async () => {
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
        logger.warn(`Partida ${playId} ya estaba iniciada en memoria (idempotencia start_play)`);
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

      const distributedReservation = await this.reserveDistributedCardMappings(playId, sessionDoc);
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
      if (!mechanicName) {
        throw new Error('No se pudo resolver el nombre de la mecánica de juego.');
      }

      // Validar boardLayout para sesiones de memoria antes de construir el estado
      ensureMemoryBoardLayoutIsComplete({
        mechanic: sessionDoc.mechanicId,
        boardLayout: sessionDoc.boardLayout,
        cardMappings: sessionDoc.cardMappings
      });

      // Validar sequencePlan para sesiones Secuencia antes de iniciar.
      if (mechanicName === 'sequence') {
        const plan = Array.isArray(sessionDoc.sequencePlan) ? sessionDoc.sequencePlan : [];
        const expectedRounds = Number(sessionDoc.config?.numberOfRounds || 0);
        if (plan.length === 0 || plan.length !== expectedRounds) {
          this.io.to(`play_${playId}`).emit('error', {
            message: 'La sesión de Secuencia no tiene un plan válido. Reconfigúrala antes de jugar.'
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
    }); // fin executeWithPlayLock
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
  async endPlay(playId, { abandoned = false } = {}) {
    const playState = this.activePlays.get(playId);
    if (!playState) {
      return;
    }

    logger.info(
      `Finalizando partida ${playId}${abandoned ? ' (abandonada por inactividad)' : ''}...`
    );

    // 1. Limpiar timers pendientes
    if (playState.roundTimer) {
      clearTimeout(playState.roundTimer);
    }
    if (playState.nextRoundTimer) {
      clearTimeout(playState.nextRoundTimer);
    }
    if (playState.playTimer) {
      clearTimeout(playState.playTimer);
    }

    // 2. Guardar el estado final en la BD
    try {
      const playDuration = Date.now() - playState.createdAt;

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
        // Para Secuencia, persistimos las métricas específicas en el GamePlay
        // ANTES de complete() para que queden incluidas en cualquier agregación
        // posterior de analytics.
        if (playState.mechanicName === 'sequence') {
          const summary = sequenceFlow.buildSequenceFinalSummary(playState);
          if (!playState.playDoc.metrics) {
            playState.playDoc.metrics = {};
          }
          Object.assign(playState.playDoc.metrics, summary);
          playState.playDoc.markModified('metrics');
        }

        // Partida completada normalmente
        await playState.playDoc.complete();

        // Actualizar métricas del alumno con todos los datos
        // Solo si el tutor no ha ejercido el derecho de oposición a analytics (Art. 21 RGPD)
        const player = await userRepository.findById(playState.playDoc.playerId);
        if (player) {
          if (player.hasConsentFor('performance_analytics')) {
            const sequenceMetrics =
              playState.mechanicName === 'sequence'
                ? sequenceFlow.buildSequenceFinalSummary(playState)
                : null;
            await player.updateStudentMetrics({
              score: playState.playDoc.score,
              correctAttempts: playState.playDoc.metrics.correctAttempts,
              errorAttempts: playState.playDoc.metrics.errorAttempts,
              timeoutAttempts: playState.playDoc.metrics.timeoutAttempts,
              averageResponseTime: playState.playDoc.metrics.averageResponseTime,
              maxSequenceLengthAchieved: sequenceMetrics?.maxSequenceLengthAchieved
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

      // Invalidar cache de analytics para garantizar frescura en el dashboard del profesor
      // inmediatamente después de completar/abandonar la partida. Fire-and-forget.
      cacheInvalidateNamespace('cache:analytics').catch(err => {
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
    // Para Secuencia, calculamos métricas específicas (sequencesCompleted,
    // maxSequenceLengthAchieved, etc.) y las mergeamos en el payload sin
    // mutar el documento persistido para no contaminar otras agregaciones.
    const finalMetrics = playState.playDoc.metrics?.toObject
      ? playState.playDoc.metrics.toObject()
      : { ...(playState.playDoc.metrics || {}) };
    const mode =
      playState.mechanicName === 'memory'
        ? 'memory'
        : playState.mechanicName === 'sequence'
          ? 'sequence'
          : 'association';

    if (mode === 'sequence') {
      Object.assign(finalMetrics, sequenceFlow.buildSequenceFinalSummary(playState));
    }

    this.io.to(`play_${playId}`).emit('game_over', {
      finalScore: playState.playDoc.score,
      metrics: finalMetrics,
      mode,
      abandoned
    });

    // 4. Limpiar la memoria
    // Liberar las tarjetas
    const cardUids = [];
    for (const mapping of playState.sessionDoc.cardMappings) {
      this.cardUidToPlayId.delete(mapping.uid);
      cardUids.push(mapping.uid);
    }

    // También limpiar de Redis (solo si seguimos siendo owner del lock)
    await this.releaseDistributedCardMappings(playId, cardUids);

    // Borrar la partida de la memoria activa
    this.activePlays.delete(playId);

    // Limpiar de Redis
    await redisService.del(redisService.NAMESPACES.PLAY, playId);

    // Liberar el lock distribuido de idempotencia. El TTL de 60s lo expiraría
    // solo de todas formas, pero liberar explícitamente evita el caso "abort
    // silencioso" si el cliente intenta reiniciar la misma partida justo tras
    // un endPlay rápido (p. ej. F5 durante el finalize). Silenciamos el fallo
    // porque el TTL es nuestra red de seguridad.
    try {
      await redisService.del(redisService.NAMESPACES.PLAY_INIT_LOCK, playId);
    } catch (err) {
      logger.warn('endPlay: fallo al liberar lock play:init (TTL lo expirará)', {
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
        newScore: playState.playDoc.score
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
      remainingTimeMs: this.getMemoryRemainingTimeMs(playState)
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

      // Ignorar escaneos si la partida está pausada
      if (playState?.paused || playState?.playDoc?.status === 'paused') {
        this.metrics.ignoredCardScans++;
        logger.debug(`Tarjeta ${uid} ignorada: partida ${playId} en pausa.`);
        this.io
          .to(`play_${playId}`)
          .emit('scan_ignored', { uid, reason: SCAN_IGNORED_REASONS.PLAY_PAUSED });
        return;
      }

      if (!playState?.awaitingResponse) {
        this.metrics.scanRaceDiscarded++;
        this.metrics.ignoredCardScans++;
        // El juego existe, pero no está esperando una respuesta
        // (ej. escaneo demasiado rápido, o entre rondas)
        logger.debug(`Tarjeta ${uid} escaneada para ${playId}, pero no se esperaba respuesta.`);
        this.io
          .to(`play_${playId}`)
          .emit('scan_ignored', { uid, reason: SCAN_IGNORED_REASONS.NOT_AWAITING });
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

    // 1. Validar la respuesta
    const isCorrect = scannedCard.uid === currentChallenge.uid;

    let pointsAwarded = 0;
    let eventType;

    if (isCorrect) {
      pointsAwarded = sessionDoc.config.pointsPerCorrect;
      eventType = 'correct';
    } else {
      pointsAwarded = sessionDoc.config.penaltyPerError;
      eventType = 'error';
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
      newScore: playDoc.score
    });

    logger.info(
      `Partida: ${playId} | Ronda: ${playDoc.currentRound} | ${eventType} (${symbol}${pointsAwarded} pts)`
    );

    this.metrics.totalRoundResponses++;
    this.metrics.averageRoundResponseTimeMs =
      (this.metrics.averageRoundResponseTimeMs * (this.metrics.totalRoundResponses - 1) +
        timeElapsed) /
      this.metrics.totalRoundResponses;

    // 5. Pasar a la siguiente ronda (tras un breve delay para feedback)
    playState.nextRoundTimer = setTimeout(() => {
      this.advanceToNextRound(playId);
    }, 4000); // Delay de 4s para que el jugador vea el resultado
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
        newScore: playDoc.score
      });

      // 5. Pasar a la siguiente ronda
      playState.nextRoundTimer = setTimeout(() => {
        this.advanceToNextRound(playId);
      }, 2000); // Delay reducido para timeouts
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
    return this.executeWithPlayLock(playId, 'pause_play', async () => {
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
    });
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
    if (!playState || !this.isMemoryPlay(playState) || !playState.awaitingBoardReady) {
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
    return this.executeWithPlayLock(playId, 'resume_play', async () => {
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

      if (
        this.isMemoryPlay(playState) &&
        typeof remainingTimeMs === 'number' &&
        remainingTimeMs > 0
      ) {
        playState.playEndsAt = Date.now() + remainingTimeMs;
        this.scheduleMemoryPlayTimeout(playId, playState, remainingTimeMs);
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

      // Secuencia: si pausamos en memorizing, reanudamos esa fase con el
      // tiempo restante; si pausamos en reproducing, rearmamos el roundTimer.
      if (this.isSequencePlay(playState)) {
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
        }
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
    });
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
