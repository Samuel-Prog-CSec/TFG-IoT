/**
 * @fileoverview Motor de juego stateful optimizado con gestión avanzada de partidas.
 * Maneja el ciclo de vida completo con rooms de Socket.IO, limits y cleanup automático.
 * Persiste estado en Redis para recuperación tras reinicio del servidor.
 * @module services/gameEngine
 */

const logger = require('../utils/logger').child({ component: 'gameEngine' });
const gamePlayRepository = require('../repositories/gamePlayRepository');
const gameSessionRepository = require('../repositories/gameSessionRepository');
const redisService = require('./redisService');
const { recalculateSessionStatusFromPlays } = require('./sessionStatusService');
const { getMechanicStrategy } = require('../strategies/mechanics');

// Constantes de configuración
// Umbral de alerta (soft limit) - no bloquea, solo emite warnings
const ACTIVE_PLAYS_WARNING_THRESHOLD =
  Number.parseInt(process.env.ACTIVE_PLAYS_WARNING_THRESHOLD, 10) || 1000;
const PLAY_TIMEOUT_MS = Number.parseInt(process.env.PLAY_TIMEOUT_MS, 10) || 3600000; // 1 hora
const CLEANUP_INTERVAL_MS = 300000; // 5 minutos
const PROCESS_BATCH_SIZE = Number.parseInt(process.env.GAME_ENGINE_BATCH_SIZE, 10) || 20;
const PERSIST_ROUND_START_EVENTS = process.env.PERSIST_ROUND_START_EVENTS === 'true';
const DISTRIBUTED_LOCK_TTL_SECONDS =
  Number.parseInt(process.env.GAME_ENGINE_LOCK_TTL_SECONDS, 10) || 90;
const LOCK_HEARTBEAT_INTERVAL_MS =
  Number.parseInt(process.env.GAME_ENGINE_LOCK_HEARTBEAT_MS, 10) || 30000;
const MEMORY_DEFAULT_HIDE_DELAY_MS = Number.parseInt(process.env.MEMORY_HIDE_DELAY_MS, 10) || 1200;

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
      lockContention: 0,
      distributedLockLeaseRenewed: 0,
      distributedLockLeaseFailed: 0,
      averagePlayDuration: 0
    };

    // Iniciar cleanup automático de partidas abandonadas
    // En tests lo deshabilitamos para evitar open handles en Jest.
    if (process.env.NODE_ENV !== 'test') {
      this.startCleanupTimer();
      this.startLockHeartbeatTimer();
    }

    logger.info('GameEngine inicializado', {
      activePlaysWarningThreshold: ACTIVE_PLAYS_WARNING_THRESHOLD,
      playTimeoutMs: PLAY_TIMEOUT_MS,
      cleanupIntervalMs: CLEANUP_INTERVAL_MS,
      distributedLockTtlSeconds: DISTRIBUTED_LOCK_TTL_SECONDS,
      lockHeartbeatIntervalMs: LOCK_HEARTBEAT_INTERVAL_MS
    });
  }

  /**
   * Inicia el timer de cleanup para detectar y finalizar partidas abandonadas.
   * Se ejecuta cada CLEANUP_INTERVAL_MS (5 minutos por defecto).
   *
   * @private
   */
  startCleanupTimer() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupAbandonedPlays();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Detecta y limpia partidas que han estado activas por más tiempo del permitido.
   * Previene memory leaks de partidas que nunca finalizaron correctamente.
   *
   * @private
   */
  async cleanupAbandonedPlays() {
    const now = Date.now();
    const abandonedPlays = [];

    for (const [playId, playState] of this.activePlays.entries()) {
      const timeSinceCreation = now - playState.createdAt;

      if (timeSinceCreation > PLAY_TIMEOUT_MS) {
        abandonedPlays.push(playId);
      }
    }

    if (abandonedPlays.length > 0) {
      logger.warn(`Detectadas ${abandonedPlays.length} partidas abandonadas, limpiando...`, {
        playIds: abandonedPlays
      });

      await this.processInBatches(abandonedPlays, async playId => {
        await this.endPlay(playId);
        this.metrics.totalPlaysCancelled++;
      });
    }

    logger.debug('Cleanup ejecutado', {
      activePlays: this.activePlays.size,
      cardMappings: this.cardUidToPlayId.size,
      metrics: this.metrics
    });
  }

  /**
   * Detiene el cleanup timer. Llamado durante el shutdown del servidor.
   * @private
   */
  stopCleanupTimer() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      logger.info('Cleanup timer detenido');
    }
  }

  startLockHeartbeatTimer() {
    this.lockHeartbeatInterval = setInterval(() => {
      this.refreshActivePlayLeases();
    }, LOCK_HEARTBEAT_INTERVAL_MS);
  }

  stopLockHeartbeatTimer() {
    if (this.lockHeartbeatInterval) {
      clearInterval(this.lockHeartbeatInterval);
      logger.info('Lock heartbeat timer detenido');
    }
  }

  async refreshActivePlayLeases() {
    const activeEntries = Array.from(this.activePlays.entries());
    if (activeEntries.length === 0) {
      return;
    }

    await this.processInBatches(activeEntries, async ([playId, playState]) => {
      await this.refreshPlayLease(playId, playState);
    });
  }

  async refreshPlayLease(playId, playState) {
    try {
      const renewedPlayKey = await redisService.expire(
        redisService.NAMESPACES.PLAY,
        playId,
        DISTRIBUTED_LOCK_TTL_SECONDS
      );

      const cardEntries = (playState?.sessionDoc?.cardMappings || []).map(mapping => ({
        id: mapping.uid,
        expectedValue: playId
      }));

      const renewedCards = await redisService.expireManyIfValueMatches(
        redisService.NAMESPACES.CARD,
        cardEntries,
        DISTRIBUTED_LOCK_TTL_SECONDS
      );

      const allCardsRenewed = cardEntries.length === 0 || renewedCards.skippedIds.length === 0;

      if (renewedPlayKey && allCardsRenewed) {
        this.metrics.distributedLockLeaseRenewed++;
      } else {
        this.metrics.distributedLockLeaseFailed++;
      }
    } catch (error) {
      this.metrics.distributedLockLeaseFailed++;
      logger.warn('No se pudo renovar lease distribuido de partida', {
        playId,
        error: error.message
      });
    }
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

    const result = await redisService.setManyIfNotExists(
      redisService.NAMESPACES.CARD,
      cardEntries,
      DISTRIBUTED_LOCK_TTL_SECONDS
    );
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

    await redisService.delManyIfValueMatches(redisService.NAMESPACES.CARD, releaseEntries);
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

    if (this.activePlays.has(playId)) {
      logger.warn(`Partida ${playId} ya estaba iniciada en memoria (idempotencia start_play)`);
      return;
    }

    // 0. Verificar umbral de partidas activas (Monitorización - solo warning)
    if (this.activePlays.size >= ACTIVE_PLAYS_WARNING_THRESHOLD) {
      logger.warn(
        `Umbral de partidas activas alcanzado o superado: ${this.activePlays.size}/${ACTIVE_PLAYS_WARNING_THRESHOLD}`
      );
      // Duda #21: No bloqueamos, solo alertamos
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
    const mechanicName =
      typeof sessionDoc.mechanicId === 'object' && sessionDoc.mechanicId?.name
        ? sessionDoc.mechanicId.name
        : sessionDoc.mechanicId?.toString?.();
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
      createdAt: Date.now() // Para detectar abandonos
    };

    if (playState.mechanicName === 'memory') {
      const playDurationMs =
        Number(playState.mechanicStrategy.getPlayDurationMs(sessionDoc)) ||
        (sessionDoc.config?.timeLimit || 15) * 1000;
      playState.playDurationMs = playDurationMs;
      playState.playEndsAt = Date.now() + playDurationMs;
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
   * 6. Actualiza métricas
   *
   * @async
   * @param {string} playId - ID de la partida a finalizar
   * @returns {Promise<void>}
   * @emits game_over - Con puntuación final y métricas
   */
  async endPlay(playId) {
    const playState = this.activePlays.get(playId);
    if (!playState) {
      return;
    }

    logger.info(`Finalizando partida ${playId}...`);

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

      await playState.playDoc.complete(); // Llama al método .complete() del modelo
      await recalculateSessionStatusFromPlays(playState.playDoc.sessionId);

      logger.info(`Partida ${playId} guardada en BD`, {
        playId,
        score: playState.playDoc.score,
        duration: `${(playDuration / 1000).toFixed(2)}s`
      });

      // Actualizar métricas
      this.metrics.totalPlaysCompleted++;
      this.metrics.averagePlayDuration =
        (this.metrics.averagePlayDuration * (this.metrics.totalPlaysCompleted - 1) + playDuration) /
        this.metrics.totalPlaysCompleted;
    } catch (err) {
      logger.error(`Error al guardar partida final ${playId}: ${err.message}`);
    }

    // 3. Emitir evento final al cliente
    this.io.to(`play_${playId}`).emit('game_over', {
      finalScore: playState.playDoc.score,
      metrics: playState.playDoc.metrics
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

    logger.info(`Partida ${playId} finalizada y limpiada de memoria`, {
      activePlaysRemaining: this.activePlays.size
    });
  }

  // ============================================================================
  // LÓGICA DEL JUEGO
  // ============================================================================

  isMemoryPlay(playState) {
    return playState?.mechanicName === 'memory';
  }

  getMemoryRemainingTimeMs(playState) {
    if (!playState?.playEndsAt) {
      return null;
    }

    return Math.max(0, playState.playEndsAt - Date.now());
  }

  emitMemoryTurnState(playId, playState, extra = {}) {
    const board = playState.mechanicStrategy.buildBoardForClient(playState.strategyState);
    const matchedCount = Number(playState.strategyState?.matchedUids?.length || 0);
    const totalCards = Number(playState.strategyState?.totalCards || board.length || 0);

    this.io.to(`play_${playId}`).emit('memory_turn_state', {
      playId,
      board,
      matchedCount,
      totalCards,
      attempts: Number(playState.strategyState?.attempts || 0),
      remainingTimeMs: this.getMemoryRemainingTimeMs(playState),
      score: playState.playDoc.score,
      ...extra
    });
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

      await playState.playDoc.addEvent({
        eventType: 'card_scanned',
        cardUid: scannedCard.uid,
        expectedValue: scannedCard.assignedValue,
        actualValue: scannedCard.assignedValue,
        pointsAwarded: 0,
        timeElapsed,
        roundNumber: playState.playDoc.currentRound
      });

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

    if (outcome.isCorrect) {
      this.metrics.totalMemoryMatches++;
    }

    this.io.to(`play_${playId}`).emit('validation_result', {
      isCorrect: outcome.isCorrect,
      expected: firstCard?.displayData || null,
      actual: {
        value: secondCard?.assignedValue || scannedCard.assignedValue
      },
      pointsAwarded: Number(outcome.pointsAwarded || 0),
      newScore: playState.playDoc.score,
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
      const hideDelay = Number(outcome.hideAfterMs) || MEMORY_DEFAULT_HIDE_DELAY_MS;
      setTimeout(() => {
        const currentState = this.activePlays.get(playId);
        if (!currentState || !this.isMemoryPlay(currentState)) {
          return;
        }
        currentState.mechanicStrategy.concealSelected(currentState.strategyState, selectedUids);
        this.emitMemoryTurnState(playId, currentState, { phase: 'concealed' });
      }, hideDelay);
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

      this.io.to(`play_${playId}`).emit('new_round', {
        roundNumber: playState.playDoc.currentRound,
        totalRounds: Number(playState.strategyState?.totalGroups || 0),
        challenge: {
          displayData: {
            mode: 'memory_board'
          }
        },
        timeLimit: Math.max(1, Math.ceil((remainingTimeMs || 0) / 1000)),
        score: playState.playDoc.score
      });

      this.emitMemoryTurnState(playId, playState, { phase: 'round_start' });
      this.scheduleMemoryPlayTimeout(playId, playState, remainingTimeMs);
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
      cardId: challengeMapping.cardId,
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

    // 5. Emitir al cliente
    this.io.to(`play_${playId}`).emit('new_round', {
      roundNumber: playDoc.currentRound,
      totalRounds: sessionDoc.config.numberOfRounds,
      challenge: {
        displayData: challengeMapping.displayData
      },
      timeLimit: sessionDoc.config.timeLimit,
      score: playDoc.score
    });

    logger.debug(
      `Ronda ${playDoc.currentRound} iniciada para ${playId}. Esperando tarjeta ${challengeMapping.uid}`
    );

    // 6. Programar el timeout
    playState.roundTimer = setTimeout(() => {
      this.handleTimeout(playId);
    }, sessionDoc.config.timeLimit * 1000);
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
      logger.debug(`Tarjeta ${uid} escaneada, pero no pertenece a ningún juego activo.`);
      return;
    }

    await this.executeWithPlayLock(playId, 'handle_card_scan', async () => {
      // 2. Obtener el estado del juego
      const playState = this.activePlays.get(playId);

      // Ignorar escaneos si la partida está pausada
      if (playState?.paused || playState?.playDoc?.status === 'paused') {
        this.metrics.ignoredCardScans++;
        logger.debug(`Tarjeta ${uid} ignorada: partida ${playId} en pausa.`);
        return;
      }

      if (!playState?.awaitingResponse) {
        this.metrics.scanRaceDiscarded++;
        this.metrics.ignoredCardScans++;
        // El juego existe, pero no está esperando una respuesta
        // (ej. escaneo demasiado rápido, o entre rondas)
        logger.debug(`Tarjeta ${uid} escaneada para ${playId}, pero no se esperaba respuesta.`);
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
        return;
      }

      // 4. Respuesta recibida → limpiar el timer
      if (!this.isMemoryPlay(playState)) {
        clearTimeout(playState.roundTimer);
        playState.roundTimer = null;
        playState.awaitingResponse = false;
      }

      // 5. Procesar la respuesta
      if (this.isMemoryPlay(playState)) {
        await this.processMemoryScan(playId, playState, scannedCardMapping);
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

    // 1. Validar la respuesta
    const isCorrect = scannedCard.uid === currentChallenge.uid;

    let pointsAwarded = 0;
    let eventType;
    const symbol = isCorrect ? '+' : '-';

    if (isCorrect) {
      pointsAwarded = sessionDoc.config.pointsPerCorrect;
      eventType = 'correct';
    } else {
      pointsAwarded = sessionDoc.config.penaltyPerError;
      eventType = 'error';
    }

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

    // 3. Guardar el evento y avanzar ronda en una sola operación atómica
    try {
      await playDoc.addEventAtomic(eventData, { advanceRound: true });
    } catch (err) {
      logger.error(`Error guardando evento en la BD para ${playId}: ${err.message}`);
    }

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

      // 3. Guardar en BD y avanzar ronda en una sola operación atómica
      await playDoc.addEventAtomic(eventData, { advanceRound: true });

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
   * Obtiene el estado actual de una partida.
   * Retorna una versión simplificada sin exponer los documentos Mongoose internos.
   *
   * @param {string} playId - ID de la partida
   * @returns {Object|null} Estado simplificado de la partida, o null si no existe
   * @property {string} playId - ID de la partida
   * @property {number} currentRound - Ronda actual
   * @property {number} score - Puntuación actual
   * @property {number} maxRounds - Total de rondas configuradas
   */
  getPlayState(playId) {
    const playState = this.activePlays.get(playId);
    if (!playState) {
      return null;
    }

    return {
      playId: playState.playDoc._id.toString(),
      currentRound: playState.playDoc.currentRound,
      score: playState.playDoc.score,
      maxRounds: this.isMemoryPlay(playState)
        ? Number(playState.strategyState?.totalGroups || 0)
        : playState.sessionDoc.config.numberOfRounds
    };
  }

  /**
   * Obtiene contexto runtime ampliado para validaciones de seguridad socket.
   * @param {string} playId
   * @returns {{ playId: string, sessionId: string, ownerId: string|null, sensorId: string|null, isPaused: boolean, awaitingResponse: boolean }|null}
   */
  getPlayRuntimeContext(playId) {
    const playState = this.activePlays.get(playId);
    if (!playState) {
      return null;
    }

    return {
      playId: playState.playDoc._id.toString(),
      sessionId: playState.sessionDoc?._id?.toString?.() || null,
      ownerId: playState.sessionDoc?.createdBy?.toString?.() || null,
      sensorId: playState.sessionDoc?.sensorId || null,
      isPaused: Boolean(playState.paused || playState.playDoc?.status === 'paused'),
      awaitingResponse: Boolean(playState.awaitingResponse)
    };
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

      // Control de permisos (si nos pasan el profesor)
      if (options.requestedBy) {
        const ownerId =
          playState.sessionDoc?.createdBy?.toString?.() || playState.sessionDoc?.createdBy;
        if (ownerId && ownerId.toString() !== options.requestedBy.toString()) {
          this.io
            .to(`play_${playId}`)
            .emit('error', { message: 'No autorizado para pausar esta partida' });
          return { remainingTimeMs: null };
        }
      }

      if (playState.paused || playState.playDoc.status === 'paused') {
        return {
          remainingTimeMs: playState.remainingTimeMs ?? playState.playDoc.remainingTime ?? null
        };
      }

      // Cancelar timers activos
      if (playState.roundTimer) {
        clearTimeout(playState.roundTimer);
        playState.roundTimer = null;
      }
      if (playState.nextRoundTimer) {
        clearTimeout(playState.nextRoundTimer);
        playState.nextRoundTimer = null;
      }

      // Calcular tiempo restante de la ronda actual
      let remainingTimeMs = null;
      if (this.isMemoryPlay(playState)) {
        remainingTimeMs = this.getMemoryRemainingTimeMs(playState);
      } else if (
        playState.currentChallenge &&
        playState.roundStartTime &&
        playState.sessionDoc?.config?.timeLimit
      ) {
        const totalMs = playState.sessionDoc.config.timeLimit * 1000;
        const elapsedMs = Math.max(0, Date.now() - playState.roundStartTime);
        playState.roundElapsedBeforePauseMs = Math.min(totalMs, elapsedMs);

        // Solo congelamos la ronda si estábamos esperando respuesta
        if (playState.awaitingResponse) {
          remainingTimeMs = Math.max(0, totalMs - playState.roundElapsedBeforePauseMs);
        }
      }

      // Marcar como pausada y bloquear escaneos
      playState.paused = true;
      playState.pausedAt = Date.now();
      playState.remainingTimeMs = remainingTimeMs;
      playState.awaitingResponse = false;
      if (this.isMemoryPlay(playState)) {
        playState.playEndsAt = null;
      }

      // Persistir en BD
      try {
        playState.playDoc.status = 'paused';
        playState.playDoc.pausedAt = new Date(playState.pausedAt);
        playState.playDoc.remainingTime = remainingTimeMs;
        await playState.playDoc.save();
        await recalculateSessionStatusFromPlays(playState.playDoc.sessionId);
      } catch (err) {
        logger.error(`Error persistiendo pausa para ${playId}: ${err.message}`);
      }

      // Notificar al cliente
      this.io.to(`play_${playId}`).emit('play_paused', {
        playId,
        currentRound: playState.playDoc.currentRound,
        remainingTimeMs
      });

      logger.info(`Partida ${playId} pausada`, { playId, remainingTimeMs });
      return { remainingTimeMs };
    });
  }

  isPlayOwner(playState, requestedBy) {
    if (!requestedBy) {
      return true;
    }

    const ownerId =
      playState.sessionDoc?.createdBy?.toString?.() || playState.sessionDoc?.createdBy;
    if (!ownerId) {
      return true;
    }

    return ownerId.toString() === requestedBy.toString();
  }

  clearPlayTimers(playState) {
    if (playState.roundTimer) {
      clearTimeout(playState.roundTimer);
      playState.roundTimer = null;
    }
    if (playState.nextRoundTimer) {
      clearTimeout(playState.nextRoundTimer);
      playState.nextRoundTimer = null;
    }
    if (playState.playTimer) {
      clearTimeout(playState.playTimer);
      playState.playTimer = null;
    }
  }

  getPlayRemainingTimeMs(playState) {
    return playState.remainingTimeMs ?? playState.playDoc.remainingTime ?? null;
  }

  restoreRoundStartTime(playState) {
    if (playState.currentChallenge && typeof playState.roundElapsedBeforePauseMs === 'number') {
      playState.roundStartTime = Date.now() - playState.roundElapsedBeforePauseMs;
    }
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
        this.io
          .to(`play_${playId}`)
          .emit('error', { message: 'No autorizado para reanudar esta partida' });
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
      playState.awaitingResponse = true;

      if (this.isMemoryPlay(playState)) {
        if (typeof remainingTimeMs === 'number' && remainingTimeMs > 0) {
          playState.playEndsAt = Date.now() + remainingTimeMs;
          this.scheduleMemoryPlayTimeout(playId, playState, remainingTimeMs);
        }
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

      // Rearmar timer con el tiempo restante (si aplica)
      if (
        !this.isMemoryPlay(playState) &&
        playState.currentChallenge &&
        typeof remainingTimeMs === 'number' &&
        remainingTimeMs > 0
      ) {
        playState.roundTimer = setTimeout(() => {
          this.handleTimeout(playId);
        }, remainingTimeMs);
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

    for (const playId of activePlayIds) {
      await this.endPlay(playId);
    }

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
   * Recupera las partidas activas de Redis y las marca como abandonadas.
   * Este método se llama durante el arranque del servidor para limpiar
   * partidas que quedaron huérfanas tras un reinicio.
   *
   * @async
   * @returns {Promise<number>} Número de partidas recuperadas/abandonadas
   */
  async recoverActivePlays() {
    try {
      const playKeys = await redisService.scanByNamespace(redisService.NAMESPACES.PLAY);

      if (playKeys.length === 0) {
        logger.info('No hay partidas activas en Redis para recuperar');
        return 0;
      }

      logger.info(`Recuperando ${playKeys.length} partidas de Redis...`);

      const recoveredResults = [];
      await this.processInBatches(playKeys, async key => {
        const playId = key.replace(`${redisService.NAMESPACES.PLAY}:`, '');
        const recovered = await this.recoverPlayFromRedis(playId);
        recoveredResults.push(recovered);
      });

      const recoveredCount = recoveredResults.filter(Boolean).length;

      logger.info(`Recuperación completada: ${recoveredCount} partidas marcadas como abandonadas`);
      return recoveredCount;
    } catch (error) {
      logger.error('Error durante la recuperación de partidas:', { error: error.message });
      return 0;
    }
  }

  async recoverPlayFromRedis(playId) {
    try {
      const redisState = await redisService.hgetall(redisService.NAMESPACES.PLAY, playId);
      if (!redisState) {
        return false;
      }

      const playDoc = await gamePlayRepository.findById(redisState.playDocId);
      if (!playDoc) {
        logger.warn(`Partida ${playId} en Redis pero no en MongoDB, limpiando...`);
        await redisService.del(redisService.NAMESPACES.PLAY, playId);
        await this.cleanupSessionCardMappings(redisState.sessionDocId, playId);
        return false;
      }

      const wasRecovered = await this.markPlayAbandonedIfNeeded(playId, playDoc);

      await redisService.del(redisService.NAMESPACES.PLAY, playId);
      await this.cleanupSessionCardMappings(redisState.sessionDocId, playId);

      return wasRecovered;
    } catch (err) {
      logger.error(`Error al recuperar partida ${playId}:`, { error: err.message });
      return false;
    }
  }

  async markPlayAbandonedIfNeeded(playId, playDoc) {
    if (playDoc.status !== 'in-progress' && playDoc.status !== 'paused') {
      return false;
    }

    playDoc.status = 'abandoned';
    playDoc.completedAt = new Date();
    playDoc.events.push({
      timestamp: new Date(),
      eventType: 'server_restart',
      roundNumber: playDoc.currentRound,
      pointsAwarded: 0
    });

    await playDoc.save();
    await recalculateSessionStatusFromPlays(playDoc.sessionId);

    logger.info(`Partida ${playId} marcada como abandonada (reinicio del servidor)`);

    if (this.io) {
      this.io.to(`play_${playId}`).emit('play_interrupted', {
        playId,
        reason: 'server_restart',
        message: 'La partida fue interrumpida por un reinicio del servidor.',
        finalScore: playDoc.score
      });
    }

    return true;
  }

  async cleanupSessionCardMappings(sessionDocId, playId = null) {
    if (!sessionDocId) {
      return;
    }

    const sessionDoc = await gameSessionRepository.findById(sessionDocId);
    if (!sessionDoc?.cardMappings) {
      return;
    }

    const cardUids = sessionDoc.cardMappings.map(mapping => mapping.uid);

    if (playId) {
      await this.releaseDistributedCardMappings(playId, cardUids);
      return;
    }

    await redisService.delMany(redisService.NAMESPACES.CARD, cardUids);
  }
}

module.exports = GameEngine;
