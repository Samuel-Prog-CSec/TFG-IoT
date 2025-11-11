/**
 * @fileoverview Motor de juego stateful que gestiona todas las partidas activas.
 * Maneja el ciclo de vida completo de las partidas, validación de respuestas y comunicación en tiempo real.
 * @module services/gameEngine
 */

const logger = require('../utils/logger');
const GamePlay = require('../models/GamePlay');
const GameSession = require('../models/GameSession');

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

    /**
     * Almacén en memoria del estado de todas las partidas activas.
     * Mapea un playId (String) con el objeto de estado completo de esa partida.
     *
     * @type {Map<string, Object>}
     * @property {Object} playDoc - Documento Mongoose de GamePlay
     * @property {Object} sessionDoc - Documento Mongoose de GameSession
     * @property {Object|null} currentChallenge - Desafío actual que debe resolver el jugador
     * @property {NodeJS.Timeout|null} roundTimer - Manejador del setTimeout para el límite de tiempo
     * @property {boolean} awaitingResponse - Indica si se está esperando una respuesta del jugador
     * @property {number} roundStartTime - Timestamp de inicio de la ronda actual
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
  }

  // ============================================================================
  // CICLO DE VIDA DE LA PARTIDA
  // ============================================================================

  /**
   * Inicia una nueva partida en el sistema.
   *
   * Este método:
   * 1. Bloquea las tarjetas RFID para esta partida (evita duplicados)
   * 2. Crea el estado inicial en memoria
   * 3. Envía el primer desafío al jugador
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

    // 1. Bloquear las tarjetas para este juego
    // Esto previene que la misma tarjeta se use en dos juegos a la vez
    for (const mapping of sessionDoc.cardMappings) {
      if (this.cardUidToPlayId.has(mapping.uid)) {
        // La tarjeta ya está en otro juego activo
        logger.error(`Error al iniciar ${playId}: Tarjeta ${mapping.uid} ya en uso.`);
        this.io.to(`play_${playId}`).emit('error', { message: `La tarjeta ${mapping.alias || mapping.uid} ya está en otro juego.` });
        return;
      }
    }
    // Si todas las tarjetas están libres, las reservamos
    for (const mapping of sessionDoc.cardMappings) {
      this.cardUidToPlayId.set(mapping.uid, playId);
    }

    // 2. Crear el estado en memoria
    const playState = {
      playDoc,
      sessionDoc,
      currentChallenge: null,
      roundTimer: null,
      awaitingResponse: false
    };

    // 3. Almacenar el estado
    this.activePlays.set(playId, playState);
    logger.info(`Partida ${playId} iniciada. ${sessionDoc.cardMappings.length} tarjetas bloqueadas.`);

    // 4. Enviar la primera ronda
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
   *
   * @async
   * @param {string} playId - ID de la partida a finalizar
   * @returns {Promise<void>}
   * @emits game_over - Con puntuación final y métricas
   */
  async endPlay(playId) {
    const playState = this.activePlays.get(playId);
    if (!playState) return;

    logger.info(`Finalizando partida ${playId}...`);

    // 1. Limpiar timers pendientes
    if (playState.roundTimer) {
      clearTimeout(playState.roundTimer);
    }

    // 2. Guardar el estado final en la BD
    try {
      await playState.playDoc.complete(); // Llama al método .complete() del modelo
      logger.info(`Partida ${playId} guardada en BD con score: ${playState.playDoc.score}`);
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
    }
    // Borrar la partida de la memoria activa
    this.activePlays.delete(playId);

    logger.info(`Partida ${playId} finalizada y limpiada de memoria.`);
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
    if (!playState) return;

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

    logger.debug(`Ronda ${playDoc.currentRound} iniciada para ${playId}. Esperando tarjeta ${challengeMapping.uid}`);

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
    if (!playState || !playState.awaitingResponse) {
      // El juego existe, pero no está esperando una respuesta
      // (ej. escaneo demasiado rápido, o entre rondas)
      logger.debug(`Tarjeta ${uid} escaneada para ${playId}, pero no se esperaba respuesta.`);
      return;
    }

    // 3. Encontrar el mapping de la tarjeta escaneada
    const scannedCardMapping = playState.sessionDoc.cardMappings.find(m => m.uid === uid);
    if (!scannedCardMapping) {
      // Esto NO debería ocurrir si el Map está sincronizado correctamente
      logger.error(`Error CRÍTICO: ${uid} mapeado a ${playId} pero no encontrado en sessionDoc.`);
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

    logger.info(`Partida: ${playId} | Ronda: ${playDoc.currentRound} | ${eventType} (${symbol}${pointsAwarded} pts)`);

    // 5. Pasar a la siguiente ronda (tras un breve delay para feedback)
    playDoc.currentRound++;
    setTimeout(() => {
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
    setTimeout(() => {
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
    if (!playState) return null;

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
    // TODO: Implementar lógica de pausa
    // - Limpiar timer
    // - Setear estado 'awaitingResponse = false'
    // - Guardar estado en BD????
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
    // TODO: Implementar lógica de reanudar
    // - Llamar a sendNextRound
  }
}

module.exports = GameEngine;
