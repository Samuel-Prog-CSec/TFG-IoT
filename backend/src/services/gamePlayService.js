/**
 * @fileoverview Servicio de lógica de negocio para GamePlay.
 * Extrae la lógica compleja de gamePlayController para mantener controllers delgados.
 * Principio Single Responsibility: Maneja únicamente la lógica de partidas.
 * @module services/gamePlayService
 */

const gamePlayRepository = require('../repositories/gamePlayRepository');
const gameSessionRepository = require('../repositories/gameSessionRepository');
const userRepository = require('../repositories/userRepository');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger').child({ component: 'gamePlayService' });

/**
 * Valida que una sesión de juego esté disponible para crear partidas.
 *
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<Object>} Sesión validada
 * @throws {NotFoundError} Si la sesión no existe
 * @throws {ValidationError} Si la sesión no está activa
 */
async function validateGameSession(sessionId) {
  const session = await gameSessionRepository.findById(sessionId);

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  if (!session.isActive()) {
    throw new ValidationError('La sesión no está activa');
  }

  return session;
}

/**
 * Valida que un jugador pueda participar en la partida.
 *
 * @param {string} playerId - ID del jugador
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<Object>} Jugador validado
 * @throws {NotFoundError} Si el jugador no existe
 * @throws {ValidationError} Si el jugador no es estudiante o ya tiene partida activa
 */
async function validatePlayer(playerId, sessionId) {
  const player = await userRepository.findById(playerId);

  if (!player) {
    throw new NotFoundError('Jugador');
  }

  if (player.role !== 'student') {
    throw new ValidationError('Solo los estudiantes pueden jugar partidas');
  }

  // Verificar partida activa existente
  const existingPlay = await gamePlayRepository.findOne({
    sessionId,
    playerId,
    status: { $in: ['in-progress', 'paused'] }
  });

  if (existingPlay) {
    throw new ValidationError('El jugador ya tiene una partida activa en esta sesión');
  }

  return player;
}

/**
 * Crea una nueva partida para un estudiante en una sesión específica.
 * Incluye validaciones de permisos y estado de sesión.
 *
 * @param {Object} params - Parámetros de creación
 * @param {string} params.sessionId - ID de la sesión
 * @param {string} params.playerId - ID del estudiante
 * @param {string} params.creatorId - ID del profesor que crea la partida
 * @returns {Promise<Object>} Partida creada con populate
 * @throws {ForbiddenError} Si el creador no es el dueño de la sesión
 */
async function createPlay({ sessionId, playerId, creatorId }) {
  // Validar sesión
  const session = await validateGameSession(sessionId);

  // Verificar permisos: solo el creador de la sesión
  if (session.createdBy.toString() !== creatorId.toString()) {
    throw new ForbiddenError('No tienes permiso para crear partidas en esta sesión');
  }

  // Validar jugador
  await validatePlayer(playerId, sessionId);

  // Crear partida
  const play = await gamePlayRepository.create({
    sessionId,
    playerId,
    status: 'in-progress',
    score: 0,
    currentRound: 1
  });

  // Populate para respuesta completa
  await play.populate([
    { path: 'sessionId', select: 'mechanicId contextId config difficulty' },
    { path: 'playerId', select: 'name profile' }
  ]);

  logger.info('Partida creada via service', {
    playId: play._id,
    sessionId,
    playerId,
    createdBy: creatorId
  });

  return play;
}

/**
 * Añade un evento a una partida en progreso.
 * Actualiza métricas automáticamente según el tipo de evento.
 *
 * @param {string} playId - ID de la partida
 * @param {Object} eventData - Datos del evento
 * @param {string} eventData.eventType - Tipo de evento (card_scanned, correct, error, timeout, round_start, round_end)
 * @param {string} [eventData.cardUid] - UID de la tarjeta escaneada
 * @param {string} [eventData.expectedValue] - Valor esperado
 * @param {string} [eventData.actualValue] - Valor recibido
 * @param {number} [eventData.pointsAwarded] - Puntos otorgados
 * @param {number} [eventData.timeElapsed] - Tiempo transcurrido en ms
 * @param {number} [eventData.roundNumber] - Número de ronda
 * @returns {Promise<Object>} Partida actualizada
 * @throws {NotFoundError} Si la partida no existe
 * @throws {ValidationError} Si la partida no está en progreso
 */
async function addEventToPlay(playId, eventData) {
  const play = await gamePlayRepository.findById(playId);

  if (!play) {
    throw new NotFoundError('Partida');
  }

  if (!play.isInProgress()) {
    throw new ValidationError('La partida no está en progreso');
  }

  // Usar método del modelo que actualiza métricas automáticamente
  await play.addEvent(eventData);

  logger.info('Evento añadido via service', {
    playId: play._id,
    eventType: eventData.eventType,
    roundNumber: eventData.roundNumber
  });

  return play;
}

/**
 * Completa una partida y actualiza las métricas del estudiante.
 * Calcula rating y actualiza User.studentMetrics.
 *
 * @param {string} playId - ID de la partida
 * @returns {Promise<Object>} Objeto con partida completada y rating
 * @throws {NotFoundError} Si la partida no existe
 * @throws {ValidationError} Si la partida ya no está en progreso
 */
async function completePlay(playId) {
  const play = await gamePlayRepository.findById(playId, {
    populate: [{ path: 'playerId' }, { path: 'sessionId' }]
  });

  if (!play) {
    throw new NotFoundError('Partida');
  }

  if (!play.isInProgress()) {
    throw new ValidationError('La partida ya no está en progreso');
  }

  // Completar partida (método del modelo)
  await play.complete();

  // Actualizar métricas del estudiante
  const player = await userRepository.findById(play.playerId._id);
  await player.updateStudentMetrics({
    score: play.score,
    correctAttempts: play.metrics.correctAttempts,
    errorAttempts: play.metrics.errorAttempts,
    averageResponseTime: play.metrics.averageResponseTime
  });

  // Calcular rating
  const rating = calculateRating(
    play.score,
    play.sessionId.config.pointsPerCorrect,
    play.sessionId.config.numberOfRounds
  );

  logger.info('Partida completada via service', {
    playId: play._id,
    playerId: play.playerId._id,
    finalScore: play.score,
    rating
  });

  return { play, rating };
}

/**
 * Calcula el rating visual (estrellas) basado en la puntuación.
 *
 * @param {number} score - Puntuación final
 * @param {number} maxPointsPerRound - Puntos máximos por ronda
 * @returns {string} Rating en estrellas (⭐⭐⭐⭐⭐ a ⭐)
 */
function calculateRating(score, maxPointsPerRound, rounds) {
  const safeRounds = Number.isInteger(rounds) && rounds > 0 ? rounds : 1;
  const percentage = (score / (maxPointsPerRound * safeRounds)) * 100;

  if (percentage >= 90) {
    return '⭐⭐⭐⭐⭐';
  }
  if (percentage >= 75) {
    return '⭐⭐⭐⭐';
  }
  if (percentage >= 60) {
    return '⭐⭐⭐';
  }
  if (percentage >= 40) {
    return '⭐⭐';
  }
  return '⭐';
}

/**
 * Calcula estadísticas agregadas de un jugador.
 * Puede filtrar por sesión específica o calcular para todas las sesiones.
 *
 * @param {string} playerId - ID del jugador
 * @param {string} [sessionId] - ID de sesión opcional para filtrar
 * @returns {Promise<Object>} Estadísticas calculadas
 */
async function getPlayerStats(playerId, sessionId = null) {
  const filter = { playerId, status: 'completed' };
  if (sessionId) {
    filter.sessionId = sessionId;
  }

  const stats = await gamePlayRepository.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalPlays: { $sum: 1 },
        totalScore: { $sum: '$score' },
        averageScore: { $avg: '$score' },
        bestScore: { $max: '$score' },
        worstScore: { $min: '$score' },
        totalCorrect: { $sum: '$metrics.correctAttempts' },
        totalErrors: { $sum: '$metrics.errorAttempts' },
        averageResponseTime: { $avg: '$metrics.averageResponseTime' },
        totalCompletionTime: { $sum: '$metrics.completionTime' }
      }
    }
  ]);

  const result = stats[0] || {
    totalPlays: 0,
    totalScore: 0,
    averageScore: 0,
    bestScore: 0,
    worstScore: 0,
    totalCorrect: 0,
    totalErrors: 0,
    averageResponseTime: 0,
    totalCompletionTime: 0
  };

  delete result._id;

  // Calcular tasa de acierto
  const accuracyRate =
    result.totalCorrect + result.totalErrors > 0
      ? Number.parseFloat(
          ((result.totalCorrect / (result.totalCorrect + result.totalErrors)) * 100).toFixed(2)
        )
      : 0;

  return {
    playerId,
    sessionId: sessionId || 'all',
    stats: {
      ...result,
      accuracyRate
    }
  };
}

module.exports = {
  createPlay,
  addEventToPlay,
  completePlay,
  getPlayerStats,
  validateGameSession,
  validatePlayer,
  calculateRating
};
