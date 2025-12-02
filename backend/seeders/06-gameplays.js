/**
 * @fileoverview Seeder de partidas individuales (GamePlay).
 * Crea partidas de ejemplo con eventos y métricas para testing.
 * @module seeders/06-gameplays
 */

const GamePlay = require('../src/models/GamePlay');
const logger = require('../src/utils/logger');

/**
 * Genera eventos coherentes para una partida.
 * @param {number} numberOfRounds - Número de rondas
 * @param {Object} config - Configuración de la sesión
 * @returns {Object} Objeto con eventos y métricas
 */
function generatePlayEvents(numberOfRounds, config) {
  const events = [];
  let score = 0;
  let correctAttempts = 0;
  let errorAttempts = 0;
  let timeoutAttempts = 0;
  const responseTimes = [];

  const startTime = Date.now() - (numberOfRounds * 20000); // Simular que empezó hace un rato

  for (let round = 1; round <= numberOfRounds; round++) {
    const roundStartTime = startTime + ((round - 1) * 15000);

    // Evento: round_start
    events.push({
      timestamp: new Date(roundStartTime),
      eventType: 'round_start',
      roundNumber: round
    });

    // Simular resultado de la ronda (70% probabilidad de acierto)
    const random = Math.random();
    let eventType;
    let pointsAwarded = 0;
    let timeElapsed;

    if (random < 0.7) {
      // Respuesta correcta
      eventType = 'correct';
      pointsAwarded = config.pointsPerCorrect;
      timeElapsed = Math.floor(2000 + Math.random() * 8000); // 2-10 segundos
      correctAttempts++;
    } else if (random < 0.9) {
      // Error
      eventType = 'error';
      pointsAwarded = config.penaltyPerError;
      timeElapsed = Math.floor(1000 + Math.random() * 5000); // 1-6 segundos
      errorAttempts++;
    } else {
      // Timeout
      eventType = 'timeout';
      pointsAwarded = 0;
      timeElapsed = config.timeLimit * 1000;
      timeoutAttempts++;
    }

    score += pointsAwarded;
    if (timeElapsed < config.timeLimit * 1000) {
      responseTimes.push(timeElapsed);
    }

    // Evento: resultado de la ronda
    events.push({
      timestamp: new Date(roundStartTime + timeElapsed),
      eventType,
      cardUid: 'AA000001', // UID de ejemplo
      expectedValue: 'Valor esperado',
      actualValue: eventType === 'correct' ? 'Valor esperado' : 'Otro valor',
      pointsAwarded,
      timeElapsed,
      roundNumber: round
    });

    // Evento: round_end
    events.push({
      timestamp: new Date(roundStartTime + timeElapsed + 500),
      eventType: 'round_end',
      roundNumber: round
    });
  }

  // Calcular métricas
  const averageResponseTime = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : 0;

  return {
    events,
    score: Math.max(0, score),
    metrics: {
      totalAttempts: numberOfRounds,
      correctAttempts,
      errorAttempts,
      timeoutAttempts,
      averageResponseTime,
      completionTime: numberOfRounds * 15000
    }
  };
}

/**
 * Genera partidas para las sesiones activas.
 * @param {Array} sessions - Sesiones creadas
 * @param {Array} students - Alumnos creados
 * @returns {Array} Array de datos de partidas
 */
function generateGamePlaysData(sessions, students) {
  const gamePlays = [];

  // Filtrar sesiones activas o completadas
  const playableSessions = sessions.filter(s =>
    s.status === 'active' || s.status === 'completed'
  );

  playableSessions.forEach((session, sessionIndex) => {
    // Asignar 2-3 alumnos aleatorios a cada sesión
    const numPlayers = Math.floor(Math.random() * 2) + 2;
    const selectedStudents = students
      .sort(() => 0.5 - Math.random())
      .slice(0, numPlayers);

    selectedStudents.forEach((student, studentIndex) => {
      const numberOfRounds = session.config.numberOfRounds;
      const playData = generatePlayEvents(numberOfRounds, session.config);

      // Determinar estado de la partida
      let status;
      let completedAt = null;

      if (session.status === 'completed') {
        status = 'completed';
        completedAt = session.endedAt;
      } else if (studentIndex === 0) {
        // Primera partida: en progreso
        status = 'in-progress';
        playData.events = playData.events.slice(0, Math.floor(playData.events.length / 2));
      } else {
        // Resto: completadas
        status = 'completed';
        completedAt = new Date();
      }

      gamePlays.push({
        sessionId: session._id,
        playerId: student._id,
        score: status === 'in-progress' ? Math.floor(playData.score / 2) : playData.score,
        currentRound: status === 'in-progress'
          ? Math.ceil(numberOfRounds / 2)
          : numberOfRounds + 1,
        events: playData.events,
        metrics: status === 'in-progress'
          ? {
              totalAttempts: Math.floor(playData.metrics.totalAttempts / 2),
              correctAttempts: Math.floor(playData.metrics.correctAttempts / 2),
              errorAttempts: Math.floor(playData.metrics.errorAttempts / 2),
              timeoutAttempts: Math.floor(playData.metrics.timeoutAttempts / 2),
              averageResponseTime: playData.metrics.averageResponseTime,
              completionTime: 0
            }
          : playData.metrics,
        status,
        startedAt: session.startedAt || new Date(Date.now() - 30 * 60 * 1000),
        completedAt
      });
    });
  });

  return gamePlays;
}

/**
 * Ejecuta el seeder de partidas.
 * @param {Array} sessions - Sesiones creadas
 * @param {Array} students - Alumnos creados
 * @returns {Promise<Array>} Array de partidas creadas
 */
async function seedGamePlays(sessions, students) {
  try {
    const gamePlaysData = generateGamePlaysData(sessions, students);
    const gamePlays = await GamePlay.insertMany(gamePlaysData);

    // Contar por estado
    const byStatus = gamePlays.reduce((acc, gp) => {
      acc[gp.status] = (acc[gp.status] || 0) + 1;
      return acc;
    }, {});

    logger.info('✅ Partidas (GamePlays) seeded exitosamente');
    logger.info(`   - ${gamePlays.length} partidas totales`);
    Object.entries(byStatus).forEach(([status, count]) => {
      logger.info(`   - ${count} partidas en estado "${status}"`);
    });

    return gamePlays;
  } catch (error) {
    logger.error('❌ Error en seedGamePlays:', error);
    throw error;
  }
}

module.exports = seedGamePlays;
