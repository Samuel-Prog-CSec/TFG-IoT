/**
 * @fileoverview Seeder de partidas individuales (GamePlay).
 * Genera partidas con eventos y métricas realistas para alimentar 30 endpoints de analytics.
 *
 * Mejoras sobre versión anterior:
 * - Rango temporal: 60 días (antes: 10 días)
 * - Partidas por alumno: 8-15 (antes: 2-5)
 * - Estados: completed + abandoned (antes: solo completed)
 * - Re-intentos: misma sesión jugada múltiples veces
 * - Patrones temporales: variabilidad entre días
 * - Fatiga simulada: tiempos crecientes en rondas finales
 *
 * Ver backend/docs/Analytics_Design_Rationale.md para contexto de BI.
 * @module seeders/07-gameplays
 */

const GamePlay = require('../src/models/GamePlay');
const GameSession = require('../src/models/GameSession');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

// ══════════════════════════════════════════════════════════════════════
// Perfiles de estudiante con soporte para evolución temporal
// ══════════════════════════════════════════════════════════════════════

/**
 * Perfiles de estudiante extendidos para analytics avanzados.
 * Cada perfil define cómo varía el rendimiento en el tiempo.
 */
const STUDENT_PROFILES = {
  high_performer: {
    label: 'Alto rendimiento estable',
    baseSuccessProb: 0.92,
    timeoutProb: 0.02,
    avgSpeed: 2500,
    // Tendencia: estable, ligera mejora
    improvementPerGame: 0.005,
    fatigueMultiplier: 1.15,
    abandonProbability: 0.02
  },
  improving: {
    label: 'Mejorando progresivamente',
    baseSuccessProb: 0.45,
    timeoutProb: 0.12,
    avgSpeed: 6500,
    // Tendencia: mejora clara
    improvementPerGame: 0.04,
    fatigueMultiplier: 1.3,
    abandonProbability: 0.08
  },
  declining: {
    label: 'Rendimiento en descenso',
    baseSuccessProb: 0.75,
    timeoutProb: 0.05,
    avgSpeed: 3500,
    // Tendencia: empeora
    improvementPerGame: -0.025,
    fatigueMultiplier: 1.4,
    abandonProbability: 0.12
  },
  plateau: {
    label: 'Estancado',
    baseSuccessProb: 0.65,
    timeoutProb: 0.06,
    avgSpeed: 4500,
    // Tendencia: estable sin mejora
    improvementPerGame: 0.002,
    fatigueMultiplier: 1.2,
    abandonProbability: 0.05
  },
  struggling: {
    label: 'Con dificultades',
    baseSuccessProb: 0.35,
    timeoutProb: 0.18,
    avgSpeed: 8000,
    // Tendencia: ligera mejora pero lenta
    improvementPerGame: 0.015,
    fatigueMultiplier: 1.5,
    abandonProbability: 0.15
  },
  average: {
    label: 'Rendimiento medio',
    baseSuccessProb: 0.72,
    timeoutProb: 0.06,
    avgSpeed: 4000,
    // Tendencia: mejora moderada
    improvementPerGame: 0.02,
    fatigueMultiplier: 1.25,
    abandonProbability: 0.06
  }
};

const PROFILE_NAMES = Object.keys(STUDENT_PROFILES);

// ══════════════════════════════════════════════════════════════════════
// Funciones de generación de eventos
// ══════════════════════════════════════════════════════════════════════

/**
 * Genera la configuración de rendimiento para una ronda específica,
 * considerando el perfil del alumno, su progresión y la fatiga.
 *
 * @param {Object} profile - Perfil STUDENT_PROFILES[key]
 * @param {number} gameNumber - Número de partida (para progresión temporal)
 * @param {number} round - Ronda actual
 * @param {number} numberOfRounds - Total de rondas
 * @returns {Object} { successProb, timeoutProb, avgSpeed }
 */
function getProfileConfig(profile, gameNumber, round, numberOfRounds) {
  // Progresión temporal: el alumno mejora/empeora con cada partida
  const progression = Math.min(gameNumber * profile.improvementPerGame, 0.3);
  const successProb = Math.max(0.1, Math.min(0.98, profile.baseSuccessProb + progression));
  const timeoutProb = Math.max(0.01, profile.timeoutProb - progression * 0.3);

  // Fatiga: los tiempos aumentan en las rondas finales
  const roundProgress = round / numberOfRounds;
  const fatigueEffect =
    roundProgress > 0.5 ? 1 + (roundProgress - 0.5) * (profile.fatigueMultiplier - 1) * 2 : 1;

  const avgSpeed = profile.avgSpeed * fatigueEffect;

  return { successProb, timeoutProb, avgSpeed };
}

function resolveRoundResult({ random, successProb, timeoutProb, finalSpeed, config }) {
  if (random < successProb) {
    return {
      eventType: 'correct',
      pointsAwarded: config.pointsPerCorrect,
      timeElapsed: Math.min(finalSpeed, config.timeLimit * 1000),
      counters: { correctAttempts: 1, errorAttempts: 0, timeoutAttempts: 0 }
    };
  }

  if (random < 1 - timeoutProb) {
    return {
      eventType: 'error',
      pointsAwarded: config.penaltyPerError,
      timeElapsed: Math.min(finalSpeed + 1000, config.timeLimit * 1000),
      counters: { correctAttempts: 0, errorAttempts: 1, timeoutAttempts: 0 }
    };
  }

  return {
    eventType: 'timeout',
    pointsAwarded: 0,
    timeElapsed: config.timeLimit * 1000,
    counters: { correctAttempts: 0, errorAttempts: 0, timeoutAttempts: 1 }
  };
}

function resolveCardUid(eventType, expectedMapping, errorMapping) {
  if (eventType === 'error') {
    return errorMapping.uid;
  }
  if (eventType === 'correct') {
    return expectedMapping.uid;
  }
  return undefined;
}

function resolveActualValue(eventType, expectedMapping, errorMapping) {
  if (eventType === 'correct') {
    return expectedMapping.assignedValue;
  }
  return errorMapping.assignedValue;
}

function buildRoundEvents({
  roundStartTime,
  round,
  eventType,
  expectedMapping,
  errorMapping,
  pointsAwarded,
  timeElapsed,
  isMemory
}) {
  // Replica fielmente lo que emite GameEngine:
  // 1. round_start al iniciar ronda (GameEngine.js:982)
  // 2. En memory, card_scanned antes del outcome del par resuelto (GameEngine.js:769-777)
  // 3. correct | error | timeout con advanceRound (GameEngine.js:793, 1175-1178, 1271)
  // NO emite round_end: el enum lo contempla pero el engine nunca lo invoca.
  const events = [
    {
      timestamp: new Date(roundStartTime),
      eventType: 'round_start',
      roundNumber: round
    }
  ];

  if (isMemory && eventType !== 'timeout') {
    // En memory, el first_pick se registra como card_scanned sin puntos
    // antes de resolverse el par. timeout no genera first_pick.
    const firstPickElapsed = Math.max(0, Math.floor(timeElapsed / 2));
    events.push({
      timestamp: new Date(roundStartTime + firstPickElapsed),
      eventType: 'card_scanned',
      cardUid: expectedMapping.uid,
      expectedValue: expectedMapping.assignedValue,
      actualValue: expectedMapping.assignedValue,
      pointsAwarded: 0,
      timeElapsed: firstPickElapsed,
      roundNumber: round
    });
  }

  events.push({
    timestamp: new Date(roundStartTime + timeElapsed),
    eventType,
    cardUid: resolveCardUid(eventType, expectedMapping, errorMapping),
    expectedValue: expectedMapping.assignedValue,
    actualValue: resolveActualValue(eventType, expectedMapping, errorMapping),
    pointsAwarded,
    timeElapsed,
    roundNumber: round
  });

  return events;
}

/**
 * Genera eventos para una partida.
 *
 * @param {number} numberOfRounds - Rondas de la sesión
 * @param {Object} config - Configuración de la sesión
 * @param {Array} cardMappings - Mapeos de tarjetas
 * @param {Object} profile - Perfil STUDENT_PROFILES[key]
 * @param {number} gameNumber - Número de partida (para progresión)
 * @param {boolean} willAbandon - Si la partida será abandonada
 * @param {boolean} isMemory - Si la sesión es mecánica memory (para emitir card_scanned)
 * @returns {Object} { events, score, metrics, roundsPlayed }
 */
function generatePlayEvents(
  numberOfRounds,
  config,
  cardMappings,
  profile,
  gameNumber,
  willAbandon,
  isMemory
) {
  const events = [];
  let score = 0;
  let correctAttempts = 0;
  let errorAttempts = 0;
  let timeoutAttempts = 0;
  const responseTimes = [];

  // Si abandona, jugar solo una parte de las rondas
  const roundsToPlay = willAbandon
    ? Math.max(1, Math.floor(numberOfRounds * (0.3 + Math.random() * 0.4)))
    : numberOfRounds;

  const jitter = (numberOfRounds * 7919 + gameNumber * 1237) % 60000;
  const startTime = Date.now() - numberOfRounds * 20000 - jitter;

  for (let round = 1; round <= roundsToPlay; round++) {
    const roundStartTime = startTime + (round - 1) * 15000;

    const { successProb, timeoutProb, avgSpeed } = getProfileConfig(
      profile,
      gameNumber,
      round,
      numberOfRounds
    );

    const random = Math.random();
    const speedJitter = Math.random() * 2000 - 1000;
    const finalSpeed = Math.max(1000, avgSpeed + speedJitter);

    const mappingIndex = (round - 1) % cardMappings.length;
    const expectedMapping = cardMappings[mappingIndex];
    const errorMapping = cardMappings[(mappingIndex + 1) % cardMappings.length] || expectedMapping;

    const roundResult = resolveRoundResult({
      random,
      successProb,
      timeoutProb,
      finalSpeed,
      config
    });

    const { eventType, pointsAwarded, timeElapsed } = roundResult;
    correctAttempts += roundResult.counters.correctAttempts;
    errorAttempts += roundResult.counters.errorAttempts;
    timeoutAttempts += roundResult.counters.timeoutAttempts;

    score += pointsAwarded;
    responseTimes.push(timeElapsed);

    events.push(
      ...buildRoundEvents({
        roundStartTime,
        round,
        eventType,
        expectedMapping,
        errorMapping,
        pointsAwarded,
        timeElapsed,
        isMemory
      })
    );
  }

  const averageResponseTime =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

  return {
    events,
    score,
    metrics: {
      totalAttempts: roundsToPlay,
      correctAttempts,
      errorAttempts,
      timeoutAttempts,
      averageResponseTime,
      completionTime: 0 // Se recalcula con timestamps reales en generateGamePlaysData
    },
    roundsPlayed: roundsToPlay
  };
}

// ══════════════════════════════════════════════════════════════════════
// Generación de partidas con distribución temporal realista
// ══════════════════════════════════════════════════════════════════════

/**
 * Genera partidas distribuidas temporalmente para analytics avanzados.
 * Cada alumno recibe 8-15 partidas distribuidas en 60 días.
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

  students.forEach((student, index) => {
    const teacherId = (student.createdBy || '').toString();
    const teacherSessions = sessionsByTeacher[teacherId] || [];
    if (teacherSessions.length === 0) {
      return;
    }

    // Asignar perfil determinista: cicla por los 6 perfiles
    const profileName = PROFILE_NAMES[index % PROFILE_NAMES.length];
    const profile = STUDENT_PROFILES[profileName];

    // 8-15 partidas por alumno (determinista, más que antes)
    const playsCount = 8 + (index % 8);

    // Ordenar sesiones por fecha para distribuir partidas temporalmente
    const sortedSessions = [...teacherSessions].sort(
      (a, b) => (a.startedAt || a.createdAt) - (b.startedAt || b.createdAt)
    );

    for (let i = 0; i < playsCount; i++) {
      // Distribuir entre sesiones (con re-intentos — misma sesión jugada varias veces)
      const session = sortedSessions[i % sortedSessions.length];
      const numberOfRounds = session.config.numberOfRounds;

      // Inferir si la sesión usa mecánica memory desde boardLayout (solo memory lo tiene)
      const isMemory = Array.isArray(session.boardLayout) && session.boardLayout.length > 0;

      // Decidir si abandona (según perfil)
      const willAbandon = Math.random() < profile.abandonProbability;

      const playData = generatePlayEvents(
        numberOfRounds,
        session.config,
        session.cardMappings,
        profile,
        i,
        willAbandon,
        isMemory
      );

      // Calcular timestamp: distribuir partidas del alumno a lo largo del tiempo
      // Las últimas 3 partidas de cada alumno se ubican en los últimos 7 días
      // para que las métricas de "Partidas Hoy" y "Alumnos Activos" muestren datos
      const isRecentPlay = i >= playsCount - 3;
      let baseTime;

      if (isRecentPlay) {
        // Partidas recientes: hoy y últimos días (horario escolar 8:00-14:00)
        const daysAgo = playsCount - 1 - i; // 2, 1, 0 (hoy la última)
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - daysAgo);
        recentDate.setHours(9 + ((index * 3 + i) % 5), (index * 11 + i * 13) % 60, 0, 0);
        baseTime = recentDate.getTime();
      } else {
        // Partidas históricas: distribuidas en los últimos 60 días
        const sessionStart = session.startedAt || session.createdAt || new Date();
        const hourOffset = ((index * 3 + i * 7) % 6) * 60 * 60 * 1000;
        const minuteOffset = ((index * 11 + i * 13) % 60) * 60 * 1000;
        baseTime = sessionStart.getTime() + hourOffset + minuteOffset;
      }

      // Ajustar timestamps de eventos relativos a esta base
      const timeShift = baseTime - playData.events[0].timestamp.getTime();
      playData.events.forEach(e => {
        e.timestamp = new Date(e.timestamp.getTime() + timeShift);
      });

      const startedAt = playData.events[0].timestamp;
      const lastEventTime = playData.events[playData.events.length - 1].timestamp.getTime();

      const completedAt = new Date(lastEventTime + 1000);

      // P19: calcular maxScore y clamar score para integridad (nunca > maximo teorico).
      const pointsPerCorrect = Number(session.config?.pointsPerCorrect) || 10;
      const maxScore = Math.max(1, numberOfRounds * pointsPerCorrect);
      const clampedScore = Math.max(0, Math.min(playData.score, maxScore));

      const gamePlay = {
        sessionId: session._id,
        playerId: student._id,
        score: clampedScore,
        maxScore,
        currentRound: willAbandon ? playData.roundsPlayed + 1 : numberOfRounds + 1,
        events: playData.events,
        metrics: {
          ...playData.metrics,
          // Recalcular completionTime desde timestamps reales (como hace GamePlay.complete())
          completionTime: completedAt - startedAt
        },
        status: willAbandon ? 'abandoned' : 'completed',
        startedAt,
        // completedAt se establece tanto para completadas como abandonadas
        // (el modelo GameEngine también lo hace en endPlay para ambos estados)
        completedAt
      };

      gamePlays.push(gamePlay);
    }
  });

  return gamePlays;
}

// ══════════════════════════════════════════════════════════════════════
// Agregación de métricas y ejecución
// ══════════════════════════════════════════════════════════════════════

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
      totalTimeouts: 0,
      totalAbandonedGames: 0,
      totalResponseTime: 0,
      totalResponses: 0,
      lastPlayedAt: null
    };

    if (play.status === 'abandoned') {
      // Las partidas abandonadas solo incrementan el contador de abandonos
      entry.totalAbandonedGames += 1;
    } else if (play.status === 'completed') {
      // Las partidas completadas contribuyen a todas las métricas de rendimiento
      entry.totalGamesPlayed += 1;
      entry.totalScore += play.score;
      entry.bestScore = Math.max(entry.bestScore, play.score);
      entry.totalCorrectAnswers += play.metrics.correctAttempts;
      entry.totalErrors += play.metrics.errorAttempts;
      entry.totalTimeouts += play.metrics.timeoutAttempts;
      const responses = play.metrics.correctAttempts + play.metrics.errorAttempts;
      entry.totalResponses += responses;
      entry.totalResponseTime += play.metrics.averageResponseTime * responses;
    }

    // lastPlayedAt se actualiza con cualquier partida (completada o abandonada)
    const playDate = play.completedAt || play.startedAt;
    if (playDate && (!entry.lastPlayedAt || playDate > entry.lastPlayedAt)) {
      entry.lastPlayedAt = playDate;
    }

    metricsByStudent.set(studentId, entry);
  });

  return metricsByStudent;
}

async function recalculateSessionStatusesFromSeededPlays() {
  const resolveSessionStatus = counters => {
    if (counters.activeOrPausedPlays > 0) {
      return 'active';
    }
    if (counters.totalPlays > 0) {
      return 'completed';
    }
    return 'created';
  };

  const applySessionStatus = (session, nextStatus) => {
    session.status = nextStatus;

    if (nextStatus === 'active') {
      if (!session.startedAt) {
        session.startedAt = new Date();
      }
      session.endedAt = undefined;
      return;
    }

    if (nextStatus === 'completed') {
      if (!session.endedAt) {
        session.endedAt = new Date();
      }
      return;
    }

    session.startedAt = undefined;
    session.endedAt = undefined;
  };

  const sessions = await GameSession.find({}, { _id: 1, status: 1, startedAt: 1, endedAt: 1 });

  for (const session of sessions) {
    const [totalPlays, activeOrPausedPlays] = await Promise.all([
      GamePlay.countDocuments({ sessionId: session._id }),
      GamePlay.countDocuments({
        sessionId: session._id,
        status: { $in: ['in-progress', 'paused'] }
      })
    ]);

    const nextStatus = resolveSessionStatus({ totalPlays, activeOrPausedPlays });

    if (session.status === nextStatus) {
      continue;
    }

    applySessionStatus(session, nextStatus);
    await session.save();
  }
}

/**
 * Ejecuta el seeder de partidas.
 * Idempotente: si ya existen partidas, las devuelve sin regenerarlas ni
 * recalcular métricas/estados (evita duplicados en ejecuciones repetidas).
 * @param {Array} sessions - Sesiones creadas
 * @param {Array} students - Alumnos creados
 * @returns {Promise<Array>} Array de partidas creadas o preexistentes
 */
async function seedGamePlays(sessions, students) {
  try {
    const existing = await GamePlay.find({});
    if (existing.length > 0) {
      logger.info(`Partidas ya existen (${existing.length}), omitiendo creacion`);
      return existing;
    }

    const gamePlaysData = generateGamePlaysData(sessions, students);
    const gamePlays = await GamePlay.create(gamePlaysData);

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
              'studentMetrics.totalTimeouts': metrics.totalTimeouts,
              'studentMetrics.totalAbandonedGames': metrics.totalAbandonedGames,
              'studentMetrics.averageResponseTime': averageResponseTime,
              'studentMetrics.lastPlayedAt': metrics.lastPlayedAt
            }
          }
        )
      );
    });

    await Promise.all(updatePromises);
    await recalculateSessionStatusesFromSeededPlays();

    // Estadísticas de lo generado
    const byStatus = gamePlays.reduce((acc, gp) => {
      acc[gp.status] = (acc[gp.status] || 0) + 1;
      return acc;
    }, {});

    const uniqueStudents = new Set(gamePlays.map(gp => gp.playerId.toString())).size;
    const uniqueSessions = new Set(gamePlays.map(gp => gp.sessionId.toString())).size;

    logger.info('Partidas (GamePlays) seeded exitosamente');
    logger.info(`- ${gamePlays.length} partidas totales`);
    logger.info(`- ${uniqueStudents} estudiantes con partidas`);
    logger.info(`- ${uniqueSessions} sesiones utilizadas`);
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
