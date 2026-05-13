/**
 * @fileoverview Servicio de lógica de negocio para GamePlay.
 * Extrae la lógica compleja de gamePlayController para mantener controllers delgados.
 * Principio Single Responsibility: Maneja únicamente la lógica de partidas.
 * @module services/gamePlayService
 */

const gamePlayRepository = require('../repositories/gamePlayRepository');
const gameSessionRepository = require('../repositories/gameSessionRepository');
const userRepository = require('../repositories/userRepository');
const { recalculateSessionStatusFromPlays } = require('./sessionStatusService');
const notificationService = require('./notificationService');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger').child({ component: 'gamePlayService' });

/**
 * Valida que una sesión de juego esté disponible para crear partidas.
 *
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<Object>} Sesión validada
 * @throws {NotFoundError} Si la sesión no existe
 *
 * QA 2026-05-06 (ADR-113): aceptamos también `status === 'completed'`. Una
 * sesión "completada" no es una sesión cerrada — significa que todas las
 * plays previas terminaron y nadie está jugando ahora mismo. Permitir una
 * nueva play en ese estado es el caso de uso real de "Jugar de Nuevo": el
 * `recalculateSessionStatusFromPlays` la pondrá de vuelta en `'active'` al
 * insertar la play. Antes esta validación rechazaba con "La sesión no
 * está activa" y bloqueaba el botón Jugar de Nuevo en GameOver.
 */
async function validateGameSession(sessionId) {
  const session = await gameSessionRepository.findById(sessionId);

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  // Estados aceptables para crear plays: 'created' (primera vez), 'active'
  // (otra play en curso), 'completed' (replay tras terminar las anteriores).
  // Si en el futuro se introduce un estado terminal real (`archived`),
  // hay que rechazarlo explícitamente aquí.
  const ACCEPTABLE_STATUSES = new Set(['created', 'active', 'completed']);
  if (!ACCEPTABLE_STATUSES.has(session.status)) {
    throw new ValidationError('La sesión no admite nuevas partidas');
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

  // Defense in depth: verificar consentimiento activo — Art. 6.1 RGPD (licitud del tratamiento)
  if (!player.consent?.granted) {
    throw new ValidationError(
      'El estudiante no tiene consentimiento parental activo. No puede participar en partidas.'
    );
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

  // Calcular maxScore teórico para integridad de puntuaciones (P19, ADR-114).
  // Cada mecánica tiene su fórmula propia y se detecta por la "huella" de
  // datos que persiste:
  //  - Secuencia: tiene `sequencePlan` con N rondas, cada una de longitud
  //    variable. maxScore = Σ longitud × pointsPerCorrect.
  //  - Memoria: tiene `boardLayout` con todas las cartas en grid 2D.
  //    maxScore = (boardLayout.length / 2) × pointsPerCorrect (asumiendo
  //    parejas; si en futuro se introduce groupSize parametrizable, hay que
  //    propagarlo aquí).
  //  - Asociación / fallback: maxScore = numberOfRounds × pointsPerCorrect.
  //
  // Este maxScore es el techo absoluto del score: pre-validate del modelo
  // GamePlay clampa cualquier $inc que lo supere (defensa ante eventos
  // duplicados).
  const rounds = Number(session.config?.numberOfRounds) || 1;
  const points = Number(session.config?.pointsPerCorrect) || 10;
  const sequencePlan = Array.isArray(session.sequencePlan) ? session.sequencePlan : [];
  const boardLayout = Array.isArray(session.boardLayout) ? session.boardLayout : [];
  const totalSequenceCards = sequencePlan.reduce((acc, r) => acc + (Number(r.length) || 0), 0);

  let maxScore;
  if (totalSequenceCards > 0) {
    // Secuencia
    maxScore = Math.max(1, totalSequenceCards * points);
  } else if (boardLayout.length > 0) {
    // Memoria: parejas presentes en el tablero.
    const MEMORY_GROUP_SIZE = 2;
    const numberOfPairs = Math.max(1, Math.floor(boardLayout.length / MEMORY_GROUP_SIZE));
    maxScore = Math.max(1, numberOfPairs * points);
  } else {
    // Asociación o fallback genérico.
    maxScore = Math.max(1, rounds * points);
  }

  // Crear partida
  const play = await gamePlayRepository.create({
    sessionId,
    playerId,
    status: 'in-progress',
    score: 0,
    maxScore,
    currentRound: 1
  });

  // Populate para respuesta completa (RGPD data minimization: solo campos necesarios del perfil)
  await play.populate([
    { path: 'sessionId', select: 'mechanicId contextId config difficulty' },
    { path: 'playerId', select: 'name profile.classroom profile.age' }
  ]);

  logger.info('Partida creada via service', {
    playId: play._id,
    sessionId,
    playerId,
    createdBy: creatorId
  });

  await recalculateSessionStatusFromPlays(sessionId);

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
  // Solo si el tutor no ha ejercido el derecho de oposición a analytics (Art. 21 RGPD)
  const player = await userRepository.findById(play.playerId._id);
  // Snapshot del rendimiento previo para detectar transición a "en riesgo"
  // tras la actualización de métricas (T-955 trigger: student_at_risk).
  const prevAverage =
    typeof player?.studentMetrics?.averageScore === 'number'
      ? player.studentMetrics.averageScore
      : null;

  if (player.hasConsentFor('performance_analytics')) {
    await player.updateStudentMetrics({
      score: play.score,
      correctAttempts: play.metrics.correctAttempts,
      errorAttempts: play.metrics.errorAttempts,
      timeoutAttempts: play.metrics.timeoutAttempts,
      averageResponseTime: play.metrics.averageResponseTime
    });

    // Tras actualizar la media, comprobar si el alumno acaba de cruzar el
    // umbral 50 hacia abajo. La dedup window 60s del notificationService
    // evita spam si dos partidas seguidas vuelven a cruzar el umbral.
    await notifyStudentAtRiskIfTransition(player._id, prevAverage).catch(err => {
      logger.warn('Trigger notify student_at_risk ignorado', {
        playerId: player._id,
        error: err?.message
      });
    });
  }

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

  await recalculateSessionStatusFromPlays(play.sessionId._id);

  // Notificación al docente que creó la sesión (T-955 trigger: play_completed).
  // Tono conversacional (Microcopy_Style_Guide). El microcopy y los 3 niveles
  // de praise dependen del porcentaje de aciertos canónico (90/70/50 — mismo
  // umbral que calculateStars del frontend, lib/utils.js).
  await notifyTeacherPlayCompleted(play).catch(err => {
    // notify() ya captura sus propios errores; este catch es defensa por si
    // fallara el cálculo de microcopy. Nunca debe bloquear el flujo.
    logger.warn('Trigger notify play_completed ignorado por error', {
      playId: play._id,
      error: err?.message
    });
  });

  return { play, rating };
}

/**
 * Calcula el número de estrellas (0-3) a partir del porcentaje de aciertos.
 * Mismos umbrales que el frontend (lib/utils.js calculateStars).
 *
 * @param {number} score
 * @param {number} pointsPerCorrect
 * @param {number} rounds
 * @returns {number} 0..3
 */
function calculateStarsServerSide(score, pointsPerCorrect, rounds) {
  const safeRounds = Number.isInteger(rounds) && rounds > 0 ? rounds : 1;
  const maxScore = (pointsPerCorrect || 10) * safeRounds;
  const percentage = maxScore > 0 ? (Number(score) / maxScore) * 100 : 0;
  if (percentage >= 90) {
    return 3;
  }
  if (percentage >= 70) {
    return 2;
  }
  if (percentage >= 50) {
    return 1;
  }
  return 0;
}

/**
 * Frase de elogio asociada al número de estrellas conseguidas.
 * Mantener tono docente conversacional, sin tecnicismos.
 *
 * @param {number} stars - 0..3
 * @returns {string}
 */
function getPraiseForStars(stars) {
  if (stars >= 3) {
    return '¡Trabajo redondo!';
  }
  if (stars === 2) {
    return '¡Buen ritmo!';
  }
  if (stars === 1) {
    return 'Sigue así.';
  }
  return 'Toca repasar — vuelve a intentarlo.';
}

/**
 * Detecta la transición a "en riesgo" del alumno (avg score cae bajo 50)
 * y notifica al docente que lo creó. T-955 / student_at_risk.
 *
 * Solo dispara cuando la media previa era >= 50 y la media nueva es < 50.
 * Re-cae a refetch del documento para leer la media recalculada.
 *
 * @param {import('mongoose').Types.ObjectId|string} playerId
 * @param {number|null} prevAverage - Media antes de aplicar la última partida.
 * @returns {Promise<void>}
 */
async function notifyStudentAtRiskIfTransition(playerId, prevAverage) {
  if (prevAverage === null || !Number.isFinite(prevAverage)) {
    return;
  }
  if (prevAverage < 50) {
    return;
  }
  const refreshed = await userRepository.findById(playerId);
  const newAverage = refreshed?.studentMetrics?.averageScore;
  if (typeof newAverage !== 'number' || newAverage >= 50) {
    return;
  }
  const teacherId = refreshed?.createdBy?.toString?.();
  if (!teacherId) {
    return;
  }
  await notificationService.notify({
    userId: teacherId,
    type: 'student_at_risk',
    priority: 'warning',
    title: 'Un alumno necesita refuerzo',
    body: `${refreshed.name || 'Un alumno'} ha bajado su rendimiento al ${Math.round(newAverage)}%. Revisa su progreso.`,
    link: `/students/${refreshed._id}`,
    metadata: {
      studentId: refreshed._id.toString(),
      prevAverage: Math.round(prevAverage),
      newAverage: Math.round(newAverage)
    }
  });
}

/**
 * Dispara la notificación `play_completed` al docente que creó la sesión.
 * No bloquea el flujo de dominio (errores ignorados por notify()).
 *
 * @param {object} play - GamePlay populado con playerId y sessionId.
 * @returns {Promise<void>}
 */
async function notifyTeacherPlayCompleted(play) {
  const teacherId = play?.sessionId?.createdBy?.toString?.();
  if (!teacherId) {
    return;
  }
  const studentName = play.playerId?.name || 'Un alumno';
  const sessionName = play.sessionId?.name || 'una sesión';
  const stars = calculateStarsServerSide(
    play.score,
    play.sessionId.config?.pointsPerCorrect,
    play.sessionId.config?.numberOfRounds
  );
  const praise = getPraiseForStars(stars);
  const starsLabel = stars === 1 ? '1 estrella' : `${stars} estrellas`;

  await notificationService.notify({
    userId: teacherId,
    type: 'play_completed',
    priority: 'info',
    title: `${studentName} ha completado una partida`,
    body: `${sessionName} · ${starsLabel} · ${praise}`,
    link: `/sessions/${play.sessionId._id}`,
    metadata: {
      playId: play._id.toString(),
      sessionId: play.sessionId._id.toString(),
      studentId: play.playerId._id.toString(),
      score: play.score,
      stars
    }
  });
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

/**
 * Calcula estadísticas de partidas agrupadas por sesión, incluyendo:
 *   - `playsCount` y `averageScore` (uso histórico).
 *   - `lastPlayedAt`: fecha de la última partida completada (para PROP-5,
 *     "hace X días" en SessionCard).
 *   - `recentScores`: hasta 7 últimas puntuaciones, ordenadas cronológicamente
 *     ascendente (para sparkline en SessionCard, PROP-5).
 *
 * Devuelve un Map sessionId → stats. Solo considera plays con `status: 'completed'`.
 *
 * @param {Array<string|ObjectId>} sessionIds - IDs de sesiones
 * @returns {Promise<Object>} Mapa sessionId → stats
 */
async function getPlayStatsBySessionIds(sessionIds) {
  if (!sessionIds || sessionIds.length === 0) {
    return {};
  }

  const playStatsAgg = await gamePlayRepository.aggregate([
    { $match: { sessionId: { $in: sessionIds }, status: 'completed' } },
    { $sort: { completedAt: -1 } },
    {
      $group: {
        _id: '$sessionId',
        playsCount: { $sum: 1 },
        averageScore: { $avg: '$score' },
        lastPlayedAt: { $max: '$completedAt' },
        // Toma las primeras 7 entradas tras el sort desc → últimas 7 partidas.
        recentScoresDesc: {
          $push: { score: '$score', completedAt: '$completedAt' }
        }
      }
    },
    {
      $project: {
        playsCount: 1,
        averageScore: 1,
        lastPlayedAt: 1,
        // Limitar a 7 elementos y revertir para orden cronológico ascendente.
        recentScores: {
          $reverseArray: { $slice: ['$recentScoresDesc', 7] }
        }
      }
    }
  ]);

  const statsMap = {};
  for (const stat of playStatsAgg) {
    statsMap[stat._id.toString()] = {
      playsCount: stat.playsCount,
      averageScore: Math.round(stat.averageScore ?? 0),
      lastPlayedAt: stat.lastPlayedAt || null,
      recentScores: (stat.recentScores || []).map(s => ({
        score: Math.round(s.score ?? 0),
        completedAt: s.completedAt
      }))
    };
  }
  return statsMap;
}

/**
 * Verifica si una sesión tiene partidas activas (in-progress o paused).
 *
 * @param {string|ObjectId} sessionId - ID de la sesión
 * @returns {Promise<number>} Número de partidas activas
 */
async function countActivePlays(sessionId) {
  return gamePlayRepository.count({
    sessionId,
    status: { $in: ['in-progress', 'paused'] }
  });
}

module.exports = {
  createPlay,
  addEventToPlay,
  completePlay,
  getPlayerStats,
  getPlayStatsBySessionIds,
  countActivePlays,
  validateGameSession,
  validatePlayer,
  calculateRating
};
