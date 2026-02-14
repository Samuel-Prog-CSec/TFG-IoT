/**
 * @fileoverview Seeder de partidas individuales (GamePlay).
 * Crea partidas de ejemplo con eventos y métricas para testing.
 * @module seeders/06-gameplays
 */

const GamePlay = require('../src/models/GamePlay');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

/**
 * Genera eventos coherentes para una partida simulando diferentes perfiles de estudiante.
 * @param {number} numberOfRounds - Número de rondas
 * @param {Object} config - Configuración de la sesión
 * @param {string} studentProfile - Perfil del alumno ('high_performer', 'struggling', 'improving', 'average')
 * @returns {Object} Objeto con eventos y métricas
 */
function generatePlayEvents(numberOfRounds, config, cardMappings, studentProfile = 'average') {
  const events = [];
  let score = 0;
  let correctAttempts = 0;
  let errorAttempts = 0;
  let timeoutAttempts = 0;
  const responseTimes = [];

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
    let successProb = 0.78;
    let timeoutProb = 0.06;
    let avgSpeed = 4000;

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

    const mappingIndex = (round - 1) % cardMappings.length;
    const expectedMapping = cardMappings[mappingIndex];
    const errorMapping = cardMappings[(mappingIndex + 1) % cardMappings.length] || expectedMapping;

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
      cardUid:
        eventType === 'timeout'
          ? undefined
          : eventType === 'error'
            ? errorMapping.uid
            : expectedMapping.uid,
      expectedValue: expectedMapping.assignedValue,
      actualValue:
        eventType === 'correct' ? expectedMapping.assignedValue : errorMapping.assignedValue,
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

  const completedSessions = sessions.filter(s => s.status === 'completed');
  const sessionsByTeacher = completedSessions.reduce((acc, session) => {
    const teacherId = session.createdBy.toString();
    if (!acc[teacherId]) {
      acc[teacherId] = [];
    }
    acc[teacherId].push(session);
    return acc;
  }, {});

  const profiles = ['high_performer', 'average', 'struggling', 'improving', 'average'];

  students.forEach((student, index) => {
    const teacherId = (student.assignedTeacher || student.createdBy || '').toString();
    const teacherSessions = sessionsByTeacher[teacherId] || [];
    if (teacherSessions.length === 0) {
      return;
    }

    const playsCount = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < playsCount; i++) {
      const session = teacherSessions[(index + i) % teacherSessions.length];
      const numberOfRounds = session.config.numberOfRounds;
      const profile = profiles[(index + i) % profiles.length];
      const playData = generatePlayEvents(
        numberOfRounds,
        session.config,
        session.cardMappings,
        profile
      );

      const sessionStart = session.startedAt || new Date();
      const timeShift = sessionStart.getTime() - playData.events[0].timestamp.getTime();
      playData.events.forEach(e => {
        e.timestamp = new Date(e.timestamp.getTime() + timeShift);
      });

      const completedAt = new Date(
        playData.events[playData.events.length - 1].timestamp.getTime() + 1000
      );

      gamePlays.push({
        sessionId: session._id,
        playerId: student._id,
        score: playData.score,
        currentRound: numberOfRounds + 1,
        events: playData.events,
        metrics: playData.metrics,
        status: 'completed',
        startedAt: playData.events[0].timestamp,
        completedAt
      });
    }
  });

  return gamePlays;
}

function aggregateStudentMetrics(gamePlays) {
  const metricsByStudent = new Map();

  gamePlays.forEach(play => {
    const studentId = play.playerId.toString();
    const entry = metricsByStudent.get(studentId) || {
      totalGamesPlayed: 0,
      totalScore: 0,
      bestScore: 0,
      totalCorrectAnswers: 0,
      totalErrors: 0,
      totalResponseTime: 0,
      totalResponses: 0,
      lastPlayedAt: null
    };

    entry.totalGamesPlayed += 1;
    entry.totalScore += play.score;
    entry.bestScore = Math.max(entry.bestScore, play.score);
    entry.totalCorrectAnswers += play.metrics.correctAttempts;
    entry.totalErrors += play.metrics.errorAttempts;
    const responses = play.metrics.correctAttempts + play.metrics.errorAttempts;
    entry.totalResponses += responses;
    entry.totalResponseTime += play.metrics.averageResponseTime * responses;

    if (!entry.lastPlayedAt || play.completedAt > entry.lastPlayedAt) {
      entry.lastPlayedAt = play.completedAt;
    }

    metricsByStudent.set(studentId, entry);
  });

  return metricsByStudent;
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

    const metricsByStudent = aggregateStudentMetrics(gamePlays);
    const updatePromises = [];

    metricsByStudent.forEach((metrics, studentId) => {
      const averageScore = metrics.totalGamesPlayed
        ? Math.round(metrics.totalScore / metrics.totalGamesPlayed)
        : 0;
      const averageResponseTime = metrics.totalResponses
        ? Math.round(metrics.totalResponseTime / metrics.totalResponses)
        : 0;

      updatePromises.push(
        User.updateOne(
          { _id: studentId },
          {
            $set: {
              'studentMetrics.totalGamesPlayed': metrics.totalGamesPlayed,
              'studentMetrics.totalScore': metrics.totalScore,
              'studentMetrics.averageScore': averageScore,
              'studentMetrics.bestScore': metrics.bestScore,
              'studentMetrics.totalCorrectAnswers': metrics.totalCorrectAnswers,
              'studentMetrics.totalErrors': metrics.totalErrors,
              'studentMetrics.averageResponseTime': averageResponseTime,
              'studentMetrics.lastPlayedAt': metrics.lastPlayedAt
            }
          }
        )
      );
    });

    await Promise.all(updatePromises);

    // Contar por estado
    const byStatus = gamePlays.reduce((acc, gp) => {
      acc[gp.status] = (acc[gp.status] || 0) + 1;
      return acc;
    }, {});

    logger.info('Partidas (GamePlays) seeded exitosamente');
    logger.info(`- ${gamePlays.length} partidas totales`);
    Object.entries(byStatus).forEach(([status, count]) => {
      logger.info(`- ${count} partidas en estado "${status}"`);
    });

    return gamePlays;
  } catch (error) {
    logger.error('Error en seedGamePlays:', error);
    throw error;
  }
}

module.exports = seedGamePlays;
