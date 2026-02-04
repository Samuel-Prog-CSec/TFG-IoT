/**
 * @fileoverview Seeder de partidas individuales (GamePlay).
 * Crea partidas de ejemplo con eventos y métricas para testing.
 * @module seeders/06-gameplays
 */

const GamePlay = require('../src/models/GamePlay');
const logger = require('../src/utils/logger');

/**
 * Genera eventos coherentes para una partida simulando diferentes perfiles de estudiante.
 * @param {number} numberOfRounds - Número de rondas
 * @param {Object} config - Configuración de la sesión
 * @param {string} studentProfile - Perfil del alumno ('high_performer', 'struggling', 'improving', 'average')
 * @returns {Object} Objeto con eventos y métricas
 */
function generatePlayEvents(numberOfRounds, config, studentProfile = 'average') {
  const events = [];
  let score = 0;
  let correctAttempts = 0;
  let errorAttempts = 0;
  let timeoutAttempts = 0;
  const responseTimes = [];

  // Aleatorizar un poco el inicio para que no sean todas iguales
  const jitter = Math.floor(Math.random() * 60000);
  const startTime = Date.now() - numberOfRounds * 20000 - jitter;

  for (let round = 1; round <= numberOfRounds; round++) {
    const roundStartTime = startTime + (round - 1) * 15000;

    // Evento: round_start
    events.push({
      timestamp: new Date(roundStartTime),
      eventType: 'round_start',
      roundNumber: round
    });

    // Definir probabilidades según el perfil
    let successProb = 0.7; // Default average
    let timeoutProb = 0.05;
    let avgSpeed = 4000; // ms

    if (studentProfile === 'high_performer') {
      successProb = 0.95;
      timeoutProb = 0.01;
      avgSpeed = 2500;
    } else if (studentProfile === 'struggling') {
      successProb = 0.4;
      timeoutProb = 0.15;
      avgSpeed = 8000;
    } else if (studentProfile === 'improving') {
      // Empieza flojo, acaba fuerte
      const progress = round / numberOfRounds;
      successProb = 0.3 + progress * 0.6; // 0.3 -> 0.9
      timeoutProb = 0.2 - progress * 0.15; // 0.2 -> 0.05
      avgSpeed = 8000 - progress * 4000; // 8s -> 4s
    }

    const random = Math.random();
    let eventType;
    let pointsAwarded = 0;
    let timeElapsed;

    // Simular variabilidad en el tiempo de respuesta
    const speedJitter = Math.random() * 2000 - 1000;
    const finalSpeed = Math.max(1000, avgSpeed + speedJitter);

    if (random < successProb) {
      // Correcto
      eventType = 'correct';
      pointsAwarded = config.pointsPerCorrect;
      timeElapsed = Math.min(finalSpeed, config.timeLimit * 1000);
      correctAttempts++;
    } else if (random < 1 - timeoutProb) {
      // Error
      eventType = 'error';
      pointsAwarded = config.penaltyPerError;
      timeElapsed = Math.min(finalSpeed + 1000, config.timeLimit * 1000);
      errorAttempts++;
    } else {
      // Timeout
      eventType = 'timeout';
      pointsAwarded = 0;
      timeElapsed = config.timeLimit * 1000;
      timeoutAttempts++;
    }

    score += pointsAwarded;
    if (eventType !== 'timeout') {
      responseTimes.push(timeElapsed);
    }

    // Evento: resultado de la ronda
    events.push({
      timestamp: new Date(roundStartTime + timeElapsed),
      eventType,
      cardUid: 'AA' + Math.floor(Math.random() * 10000),
      expectedValue: 'Valor ' + round,
      actualValue: eventType === 'correct' ? 'Valor ' + round : 'Error',
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
  const averageResponseTime =
    responseTimes.length > 0
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
      completionTime: numberOfRounds * 15000 // Estimado
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
  const playableSessions = sessions.filter(s => s.status === 'active' || s.status === 'completed');

  playableSessions.forEach((session, sessionIndex) => {
    // Asignar 2-3 alumnos aleatorios a cada sesión
    const numPlayers = Math.floor(Math.random() * 2) + 2;
    const selectedStudents = students.sort(() => 0.5 - Math.random()).slice(0, numPlayers);

    selectedStudents.forEach((student, studentIndex) => {
      const numberOfRounds = session.config.numberOfRounds;

      // Asignar perfil basado indirectamente en el ID para consistencia (o random simple)
      const profiles = ['high_performer', 'average', 'struggling', 'improving', 'average'];
      // Usar un hash simple del ID o índice
      const profileIndex = (studentIndex + sessionIndex) % profiles.length;
      const profile = profiles[profileIndex];

      const playData = generatePlayEvents(numberOfRounds, session.config, profile);

      // Determinar estado de la partida
      let status;
      let completedAt = null;

      if (session.status === 'completed') {
        status = 'completed';
        completedAt = session.endedAt;
        // Ajustar timestamp de eventos para coincidir con la sesión histórica
        if (session.startedAt) {
          const timeShift = session.startedAt.getTime() - playData.events[0].timestamp.getTime();
          playData.events.forEach(e => {
            e.timestamp = new Date(e.timestamp.getTime() + timeShift);
          });
        }
      } else if (session.status === 'active' && studentIndex === 0) {
        // Primera partida: en progreso
        status = 'in-progress';
        playData.events = playData.events.slice(0, Math.floor(playData.events.length / 2));
      } else if (session.status === 'active') {
        // Otras en active: ya terminaron (simulando que terminaron hace poco)
        status = 'completed';
        completedAt = new Date();
      } else {
        // Paused/Created -> no deberían tener plays, pero por si acaso
        status = 'abandoned';
      }

      if (status !== 'abandoned') {
        gamePlays.push({
          sessionId: session._id,
          playerId: student._id,
          score: status === 'in-progress' ? Math.floor(playData.score * 0.5) : playData.score,
          currentRound:
            status === 'in-progress' ? Math.ceil(numberOfRounds / 2) : numberOfRounds + 1,
          events: playData.events,
          metrics:
            status === 'in-progress'
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
          startedAt: playData.events[0].timestamp,
          completedAt
        });
      }
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
