/**
 * @fileoverview Motor de juego stateful optimizado con gestión avanzada de partidas.
 * Maneja el ciclo de vida completo con rooms de Socket.IO, limits y cleanup automático.
 * Persiste estado en Redis para recuperación tras reinicio del servidor.
 * @module services/gameEngine
 */

const logger = require('../utils/logger');
const GamePlay = require('../models/GamePlay');
const GameSession = require('../models/GameSession');
const redisService = require('./redisService');

// Constantes de configuración
// Umbral de alerta (soft limit) - no bloquea, solo emite warnings
const ACTIVE_PLAYS_WARNING_THRESHOLD = parseInt(process.env.ACTIVE_PLAYS_WARNING_THRESHOLD) || 1000;
const PLAY_TIMEOUT_MS = parseInt(process.env.PLAY_TIMEOUT_MS) || 3600000; // 1 hora
const CLEANUP_INTERVAL_MS = 300000; // 5 minutos

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
     * Métricas del motor de juego para monitoreo.
     * @type {Object}
     */
    this.metrics = {
      totalPlaysStarted: 0,
      totalPlaysCompleted: 0,
      totalPlaysCancelled: 0,
      totalCardScans: 0,
      averagePlayDuration: 0
    };

    // Iniciar cleanup automático de partidas abandonadas
    // En tests lo deshabilitamos para evitar open handles en Jest.
    if (process.env.NODE_ENV !== 'test') {
      this.startCleanupTimer();
    }

    logger.info('GameEngine inicializado', {
      activePlaysWarningThreshold: ACTIVE_PLAYS_WARNING_THRESHOLD,
      playTimeoutMs: PLAY_TIMEOUT_MS,
      cleanupIntervalMs: CLEANUP_INTERVAL_MS
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

      for (const playId of abandonedPlays) {
        await this.endPlay(playId);
        this.metrics.totalPlaysCancelled++;
      }
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

    // Si todas las tarjetas están libres, las reservamos
    for (const mapping of sessionDoc.cardMappings) {
      this.cardUidToPlayId.set(mapping.uid, playId);
    }

    // 2. Construir índice O(1) para búsqueda rápida de mappings por UID
    const uidToMapping = new Map(sessionDoc.cardMappings.map(m => [m.uid, m]));

    // 3. Crear el estado en memoria
    const playState = {
      playDoc,
      sessionDoc,
      uidToMapping, // Índice O(1): uid → mapping completo
      currentChallenge: null,
      roundTimer: null,
      nextRoundTimer: null,
      awaitingResponse: false,
      paused: false,
      pausedAt: null,
      remainingTimeMs: null,
      roundElapsedBeforePauseMs: 0,
      createdAt: Date.now() // Para detectar abandonos
    };

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

    // 2. Guardar el estado final en la BD
    try {
      const playDuration = Date.now() - playState.createdAt;

      await playState.playDoc.complete(); // Llama al método .complete() del modelo

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
    for (const mapping of playState.sessionDoc.cardMappings) {
      this.cardUidToPlayId.delete(mapping.uid);
      // También limpiar de Redis
      await redisService.del(redisService.NAMESPACES.CARD, mapping.uid);
    }

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

    // 3. Generar el desafío (mecánica de asociación)
    // TODO: Tener en cuenta la dificultad, evitar repeticiones, etc.
    // TODO: Esto debe abstraerse cuando haya más mecánicas (memoria, secuencias, etc.)
    const randomIndex = Math.floor(Math.random() * sessionDoc.cardMappings.length);
    const challengeMapping = sessionDoc.cardMappings[randomIndex];

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

    // 4. Guardar el inicio de la ronda en la BD (evento 'round_start')
    await playDoc.addEvent({
      eventType: 'round_start',
      roundNumber: playDoc.currentRound
    });

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
    // 1. Búsqueda O(1) para encontrar la partida
    const playId = this.cardUidToPlayId.get(uid);
    if (!playId) {
      logger.debug(`Tarjeta ${uid} escaneada, pero no pertenece a ningún juego activo.`);
      return;
    }

    // 2. Obtener el estado del juego
    const playState = this.activePlays.get(playId);

    // Ignorar escaneos si la partida está pausada
    if (playState?.paused || playState?.playDoc?.status === 'paused') {
      logger.debug(`Tarjeta ${uid} ignorada: partida ${playId} en pausa.`);
      return;
    }

    if (!playState || !playState.awaitingResponse) {
      // El juego existe, pero no está esperando una respuesta
      // (ej. escaneo demasiado rápido, o entre rondas)
      logger.debug(`Tarjeta ${uid} escaneada para ${playId}, pero no se esperaba respuesta.`);
      return;
    }

    // 3. Búsqueda O(1) del mapping de la tarjeta escaneada
    const scannedCardMapping = playState.uidToMapping.get(uid);
    if (!scannedCardMapping) {
      // Esto NO debería ocurrir si el índice está sincronizado correctamente
      logger.error(`Error CRÍTICO: ${uid} mapeado a ${playId} pero no encontrado en uidToMapping.`);
      return;
    }

    // 4. Respuesta recibida → limpiar el timer
    clearTimeout(playState.roundTimer);
    playState.roundTimer = null;
    playState.awaitingResponse = false;

    // 5. Procesar la respuesta
    await this.processResponse(playId, playState, scannedCardMapping);
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
    let symbol = isCorrect ? '+' : '-';

    if (isCorrect) {
      pointsAwarded = sessionDoc.config.pointsPerCorrect;
      eventType = 'correct';
      symbol = '+'; // Indica puntos añadidos
    } else {
      pointsAwarded = sessionDoc.config.penaltyPerError;
      eventType = 'error';
      symbol = '-'; // Indica penalización de puntos
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

    // 3. Guardar el evento en la BD
    // .addEvent() actualiza el score y las métricas automáticamente
    try {
      await playDoc.addEvent(eventData);
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

    // 5. Pasar a la siguiente ronda (tras un breve delay para feedback)
    playDoc.currentRound++;
    playState.nextRoundTimer = setTimeout(() => {
      this.sendNextRound(playId);
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
    const playState = this.activePlays.get(playId);
    if (!playState || !playState.awaitingResponse) {
      // La respuesta llegó justo a tiempo, el timer ya fue limpiado
      return;
    }

    // Si está pausada, ignorar (race conditions)
    if (playState.paused || playState.playDoc.status === 'paused') {
      return;
    }

    logger.info(`Partida: ${playId} | Ronda: ${playState.playDoc.currentRound} | TIMEOUT`);

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

    // 3. Guardar en BD
    await playDoc.addEvent(eventData);

    // 4. Emitir al cliente
    this.io.to(`play_${playId}`).emit('validation_result', {
      isCorrect: false,
      timeout: true,
      expected: currentChallenge.displayData,
      pointsAwarded: 0,
      newScore: playDoc.score
    });

    // 5. Pasar a la siguiente ronda
    playDoc.currentRound++;
    playState.nextRoundTimer = setTimeout(() => {
      this.sendNextRound(playId);
    }, 2000); // Delay reducido para timeouts
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
      maxRounds: playState.sessionDoc.config.numberOfRounds
    };
  }

  /**
   * Pausa una partida en curso.
   *
   * TODO: Implementar lógica completa de pausa
   * - Limpiar timer actual
   * - Guardar estado en BD
   * - Emitir evento de pausa al cliente
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
    if (
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

    // Persistir en BD
    try {
      playState.playDoc.status = 'paused';
      playState.playDoc.pausedAt = new Date(playState.pausedAt);
      playState.playDoc.remainingTime = remainingTimeMs;
      await playState.playDoc.save();
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
  }

  /**
   * Reanuda una partida pausada.
   *
   * TODO: Implementar lógica completa de reanudación
   * - Restaurar estado desde BD si es necesario
   * - Reenviar el desafío actual
   * - Reiniciar el timer
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
          .emit('error', { message: 'No autorizado para reanudar esta partida' });
        return { remainingTimeMs: null };
      }
    }

    if (!playState.paused && playState.playDoc.status !== 'paused') {
      return { remainingTimeMs: null };
    }

    // Cancelar timers residuales
    if (playState.roundTimer) {
      clearTimeout(playState.roundTimer);
      playState.roundTimer = null;
    }
    if (playState.nextRoundTimer) {
      clearTimeout(playState.nextRoundTimer);
      playState.nextRoundTimer = null;
    }

    const remainingTimeMs = playState.remainingTimeMs ?? playState.playDoc.remainingTime ?? null;

    // Restaurar el roundStartTime para que el cálculo timeElapsed NO incluya la pausa
    if (playState.currentChallenge && typeof playState.roundElapsedBeforePauseMs === 'number') {
      playState.roundStartTime = Date.now() - playState.roundElapsedBeforePauseMs;
    }

    // Marcar como reanudada
    playState.paused = false;
    playState.pausedAt = null;
    playState.remainingTimeMs = null;
    playState.awaitingResponse = true;

    // Persistir en BD
    try {
      playState.playDoc.status = 'in-progress';
      playState.playDoc.pausedAt = null;
      playState.playDoc.remainingTime = null;
      await playState.playDoc.save();
    } catch (err) {
      logger.error(`Error persistiendo reanudación para ${playId}: ${err.message}`);
    }

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

    // Rearmar timer con el tiempo restante (si aplica)
    if (playState.currentChallenge && typeof remainingTimeMs === 'number' && remainingTimeMs > 0) {
      playState.roundTimer = setTimeout(() => {
        this.handleTimeout(playId);
      }, remainingTimeMs);
    }

    logger.info(`Partida ${playId} reanudada`, { playId, remainingTimeMs });
    return { remainingTimeMs };
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

      await redisService.hset(redisService.NAMESPACES.PLAY, playId, redisState);

      // Almacenar mapeo de tarjetas para búsqueda O(1)
      for (const mapping of playState.sessionDoc.cardMappings) {
        await redisService.set(redisService.NAMESPACES.CARD, mapping.uid, playId);
      }

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

      let recoveredCount = 0;

      for (const key of playKeys) {
        // Extraer playId de la key (formato: play:playId)
        const playId = key.replace(`${redisService.NAMESPACES.PLAY}:`, '');

        try {
          // Obtener estado de Redis
          const redisState = await redisService.hgetall(redisService.NAMESPACES.PLAY, playId);

          if (!redisState) {
            continue;
          }

          // Buscar el documento en MongoDB
          const playDoc = await GamePlay.findById(redisState.playDocId);

          if (!playDoc) {
            logger.warn(`Partida ${playId} en Redis pero no en MongoDB, limpiando...`);
            await redisService.del(redisService.NAMESPACES.PLAY, playId);
            continue;
          }

          // Marcar como abandonada si estaba en progreso
          if (playDoc.status === 'in-progress' || playDoc.status === 'paused') {
            playDoc.status = 'abandoned';
            playDoc.completedAt = new Date();

            // Añadir evento de interrupción
            playDoc.events.push({
              timestamp: new Date(),
              eventType: 'server_restart',
              roundNumber: playDoc.currentRound,
              pointsAwarded: 0
            });

            await playDoc.save();

            logger.info(`Partida ${playId} marcada como abandonada (reinicio del servidor)`);

            // Emitir evento si hay clientes conectados
            if (this.io) {
              this.io.to(`play_${playId}`).emit('play_interrupted', {
                playId,
                reason: 'server_restart',
                message: 'La partida fue interrumpida por un reinicio del servidor.',
                finalScore: playDoc.score
              });
            }

            recoveredCount++;
          }

          // Limpiar de Redis
          await redisService.del(redisService.NAMESPACES.PLAY, playId);

          // Limpiar tarjetas asociadas
          if (redisState.sessionDocId) {
            const sessionDoc = await GameSession.findById(redisState.sessionDocId);
            if (sessionDoc?.cardMappings) {
              for (const mapping of sessionDoc.cardMappings) {
                await redisService.del(redisService.NAMESPACES.CARD, mapping.uid);
              }
            }
          }
        } catch (err) {
          logger.error(`Error al recuperar partida ${playId}:`, { error: err.message });
        }
      }

      logger.info(`Recuperación completada: ${recoveredCount} partidas marcadas como abandonadas`);
      return recoveredCount;
    } catch (error) {
      logger.error('Error durante la recuperación de partidas:', { error: error.message });
      return 0;
    }
  }
}

module.exports = GameEngine;
