const logger = require('../utils/logger');
const GamePlay = require('../models/GamePlay');
const GameSession = require('../models/GameSession');

/**
 * GameEngine (stateful service)
 *
 * Gestiona el estado de TODAS las partidas activas.
 * Es un servicio "stateful" que vive en el servidor.
 * Se instancia UNA VEZ en server.js y se le inyecta `io`.
 */
class GameEngine {
  constructor(io) {
    this.io = io;

    /**
     * Almacén de estado en memoria.
     * Mapea un playId (String) con el estado de esa partida.
     * @type {Map<string, Object>}
     */
    this.activePlays = new Map();

    /**
     * EL MAPA MÁGICO (Búsqueda Inversa O(1))
     * Mapea un card UID (String) con el playId (String) al que pertenece.
     * Esto elimina la necesidad de iterar activePlays en cada escaneo.
     * @type {Map<string, string>}
     */
    this.cardUidToPlayId = new Map();
  }

  // --- 1. CICLO DE VIDA DE LA PARTIDA ---

  /**
   * Inicia una nueva partida.
   * Este método es llamado desde server.js (en el evento socket 'start_play').
   * @param {Object} playDoc - El documento Mongoose de GamePlay.
   * @param {Object} sessionDoc - El documento Mongoose de GameSession.
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
      playDoc,                // El documento Mongoose de la partida
      sessionDoc,             // La configuración de la sesión
      currentChallenge: null,
      roundTimer: null,       // Manejador para el setTimeout
      awaitingResponse: false
    };

    // 3. Almacenar el estado
    this.activePlays.set(playId, playState);
    logger.info(`Partida ${playId} iniciada. ${sessionDoc.cardMappings.length} tarjetas bloqueadas.`);

    // 4. Enviar la primera ronda
    await this.sendNextRound(playId);
  }

  /**
   * Finaliza una partida.
   * Guarda el estado final en la BD y limpia la memoria.
   * @param {string} playId - El ID de la partida a finalizar.
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

  // --- 2. LÓGICA DEL JUEGO ---

  /**
   * Envía el siguiente desafío (o finaliza el juego).
   * @param {string} playId - El ID de la partida.
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
    // TODO: Esto debe abstraerse cuando haya más mecánicas
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
        // 'displayData' es el objeto que definimos
        // (ej. { "type": "image", "src": "/img/france_flag.jpg" })
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

  // --- 3. MANEJO DE ENTRADAS ---

  /**
   * Manejador central para todos los escaneos de RFID.
   * Este método es llamado desde server.js (en rfidService.on('rfid_event')).
   * @param {string} uid - El UID de la tarjeta escaneada.
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
      // Esto no debería pasar NUNCA si cardUidToPlayId está sincronizado
      logger.error(`Error CRÍTICO: ${uid} mapeado a ${playId} pero no encontrado en sessionDoc.`);
      return;
    }

    // 4. Respuesta recibida -> limpiar el timer
    clearTimeout(playState.roundTimer);
    playState.roundTimer = null;
    playState.awaitingResponse = false;

    // 5. Procesar la respuesta
    await this.processResponse(playId, playState, scannedCardMapping);
  }

  /**
   * Procesa la respuesta de un jugador (escaneo).
   * @param {string} playId - El ID de la partida.
   * @param {Object} playState - El estado actual de la partida.
   * @param {Object} scannedCard - El mapping de la tarjeta escaneada.
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
        value: scannedCard.assignedValue,
        // ¿Enviar el 'alias' de la tarjeta física para feedback?
        // alias: (await Card.findById(scannedCard.cardId)).alias
      },
      pointsAwarded,
      newScore: playDoc.score
    });

    logger.info(`Partida: ${playId} | Ronda: ${playDoc.currentRound} | ${eventType} (${symbol}${pointsAwarded} pts)`);

    // 5. Pasar a la siguiente ronda (tras un breve delay)
    playDoc.currentRound++; // Incrementar la ronda
    setTimeout(() => {
      this.sendNextRound(playId);
    }, 4000); // Delay de 4s para que el jugador vea el resultado
  }

  /**
   * Maneja el caso en que el timer de la ronda se agota.
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
    }, 2000);
  }

  // --- 4. UTILIDADES ---

  getPlayState(playId) {
    // No devolver el estado interno (con los Mongoose docs)
    const playState = this.activePlays.get(playId);
    if (!playState) return null;

    return {
      playId: playState.playDoc._id.toString(),
      currentRound: playState.playDoc.currentRound,
      score: playState.playDoc.score,
      maxRounds: playState.sessionDoc.config.numberOfRounds
    };
  }

  pausePlay(playId) {
    // TODO: Implementar lógica de pausa
    // - Limpiar timer
    // - Setear estado 'awaitingResponse = false'
    // - Guardar estado en BD????
  }

  resumePlay(playId) {
    // TODO: Implementar lógica de reanudar
    // - Llamar a sendNextRound
  }
}

module.exports = GameEngine;
