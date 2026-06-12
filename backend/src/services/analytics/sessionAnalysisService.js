/**
 * @fileoverview Servicio de análisis profundo de sesiones de juego.
 * Desglose ronda-a-ronda, análisis de tarjetas, detección de fatiga
 * y momentos de dificultad.
 *
 * Ver Analytics_Design_Rationale.md § 2.2 para fundamentación pedagógica.
 *
 * @module services/analytics/sessionAnalysisService
 */

const gamePlayRepository = require('../../repositories/gamePlayRepository');
const userRepository = require('../../repositories/userRepository');
const { toObjectId, getStartDate, enrichMetric } = require('./analyticsHelpers');

// ══════════════════════════════════════════════════════════════════════
// E05 — Desglose por rondas de una partida
// ══════════════════════════════════════════════════════════════════════

/**
 * Obtiene el desglose ronda-a-ronda de una partida con indicador de fatiga.
 * Los datos se extraen del array events[] del GamePlay (no requiere aggregation).
 *
 * @param {string} gameplayId - ID del GamePlay
 * @returns {Promise<Object>} { gameplayId, totalRounds, rounds, fatigueIndicator }
 */
async function getGameplayRounds(gameplayId) {
  const gameplay = await gamePlayRepository.findById(gameplayId, {
    select: 'events currentRound score metrics status'
  });

  if (!gameplay) {
    const { NotFoundError } = require('../../utils/errors');
    throw new NotFoundError('Partida no encontrada');
  }

  // Agrupar eventos por ronda
  const roundsMap = {};
  for (const event of gameplay.events) {
    const rn = event.roundNumber;
    if (!roundsMap[rn]) {
      roundsMap[rn] = { events: [], scoreChange: 0 };
    }

    roundsMap[rn].events.push({
      eventType: event.eventType,
      timeElapsed: event.timeElapsed || 0,
      cardUid: event.cardUid || null,
      pointsAwarded: event.pointsAwarded || 0
    });

    if (typeof event.pointsAwarded === 'number') {
      roundsMap[rn].scoreChange += event.pointsAwarded;
    }
  }

  // Construir array de rondas
  const roundNumbers = Object.keys(roundsMap)
    .map(Number)
    .sort((a, b) => a - b);

  const answerTypes = new Set(['correct', 'error', 'timeout']);

  const rounds = roundNumbers.map(rn => {
    const round = roundsMap[rn];
    const answerEvents = round.events.filter(e => answerTypes.has(e.eventType));
    const responseTimes = answerEvents.filter(e => e.timeElapsed > 0).map(e => e.timeElapsed);
    const lastAnswer = answerEvents[answerEvents.length - 1];

    return {
      roundNumber: rn,
      events: round.events,
      result: lastAnswer?.eventType || 'unknown',
      responseTime:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : 0,
      scoreChange: round.scoreChange
    };
  });

  // Calcular indicador de fatiga
  const roundsWithTime = rounds.filter(r => r.responseTime > 0);
  const fatigueIndicator = {
    detected: false,
    avgTimeFirstHalf: 0,
    avgTimeSecondHalf: 0,
    slowdownPercent: 0
  };

  if (roundsWithTime.length >= 4) {
    const mid = Math.floor(roundsWithTime.length / 2);
    const firstHalf = roundsWithTime.slice(0, mid);
    const secondHalf = roundsWithTime.slice(mid);

    const avgFirst = firstHalf.reduce((s, r) => s + r.responseTime, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, r) => s + r.responseTime, 0) / secondHalf.length;

    fatigueIndicator.avgTimeFirstHalf = Math.round(avgFirst);
    fatigueIndicator.avgTimeSecondHalf = Math.round(avgSecond);

    if (avgFirst > 0) {
      const slowdown = ((avgSecond - avgFirst) / avgFirst) * 100;
      fatigueIndicator.slowdownPercent = Math.round(slowdown * 10) / 10;
      fatigueIndicator.detected = slowdown > 20;
    }
  }

  // Enriquecer fatiga con RAG e interpretación (framework BI)
  const fatigueEnriched = enrichMetric('fatigueSlowdown', fatigueIndicator.slowdownPercent);
  fatigueIndicator.rag = fatigueEnriched.rag;
  fatigueIndicator.interpretation = fatigueEnriched.interpretation;

  return {
    gameplayId,
    totalRounds: rounds.length,
    rounds,
    fatigueIndicator
  };
}

// ══════════════════════════════════════════════════════════════════════
// E06 — Análisis de tarjetas a nivel de clase
// ══════════════════════════════════════════════════════════════════════

/**
 * Analiza el rendimiento por tarjeta RFID: tasa de error, dificultad, etc.
 *
 * @param {string} teacherId - ID del profesor
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @param {string} [options.contextId] - Filtrar por contexto (opcional)
 * @param {number} [options.limit=20]
 * @returns {Promise<Object>} { cards, timeRange }
 */
async function getCardAnalysis(teacherId, { timeRange = '30d', contextId, limit = 20 } = {}) {
  const startDate = getStartDate(timeRange);

  // (B2) Prefiltro por sesiones del profesor ANTES del $lookup: el $match por
  // sessionId usa el índice de game_plays y evita el $lookup sobre TODA la
  // colección, especialmente caro aquí por el posterior `$unwind '$events'` que
  // amplifica cada play. Mismo patrón A.3 que analyticsService.
  const { getTeacherSessionIds } = require('../analyticsService');
  const teacherSessionIds = await getTeacherSessionIds(teacherId);

  const pipeline = [
    {
      $match: {
        sessionId: { $in: teacherSessionIds },
        status: 'completed',
        completedAt: { $gte: startDate }
      }
    },
    {
      $lookup: {
        from: 'game_sessions',
        localField: 'sessionId',
        foreignField: '_id',
        as: 'session'
      }
    },
    { $unwind: '$session' },
    // Filtro por contexto (requiere el doc de sesión, post-lookup).
    ...(contextId ? [{ $match: { 'session.contextId': toObjectId(contextId) } }] : []),
    { $unwind: '$events' },
    {
      $match: {
        'events.eventType': { $in: ['correct', 'error', 'timeout'] },
        'events.cardUid': { $ne: null }
      }
    },
    {
      $group: {
        _id: '$events.cardUid',
        totalAttempts: { $sum: 1 },
        errorCount: {
          $sum: { $cond: [{ $eq: ['$events.eventType', 'error'] }, 1, 0] }
        },
        timeoutCount: {
          $sum: { $cond: [{ $eq: ['$events.eventType', 'timeout'] }, 1, 0] }
        },
        correctCount: {
          $sum: { $cond: [{ $eq: ['$events.eventType', 'correct'] }, 1, 0] }
        },
        avgResponseTime: { $avg: '$events.timeElapsed' },
        uniqueStudents: { $addToSet: '$playerId' },
        // Capturar expectedValue para saber qué representa esta tarjeta
        sampleExpectedValue: { $first: '$events.expectedValue' }
      }
    },
    {
      $project: {
        cardUid: '$_id',
        _id: 0,
        totalAttempts: 1,
        errorCount: 1,
        timeoutCount: 1,
        correctCount: 1,
        errorRate: {
          $round: [
            {
              $multiply: [
                { $divide: [{ $add: ['$errorCount', '$timeoutCount'] }, '$totalAttempts'] },
                100
              ]
            },
            1
          ]
        },
        avgResponseTime: { $round: ['$avgResponseTime', 0] },
        uniqueStudentsAttempted: { $size: '$uniqueStudents' },
        difficultyIndex: {
          $round: [{ $divide: [{ $add: ['$errorCount', '$timeoutCount'] }, '$totalAttempts'] }, 2]
        },
        assignedValue: '$sampleExpectedValue'
      }
    },
    { $sort: { errorRate: -1 } },
    { $limit: limit }
  ];

  const cards = await gamePlayRepository.aggregate(pipeline);

  return { cards, timeRange };
}

// ══════════════════════════════════════════════════════════════════════
// E07 — Momentos de dificultad (errores consecutivos)
// ══════════════════════════════════════════════════════════════════════

/**
 * Detecta momentos de dificultad (errores/timeouts consecutivos) de un estudiante.
 *
 * @param {string} studentId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @param {number} [options.minConsecutiveErrors=2]
 * @returns {Promise<Object>} { moments, totalStruggles, avgStruggleLength }
 */
async function getStudentStruggles(
  studentId,
  { timeRange = '30d', minConsecutiveErrors = 2 } = {}
) {
  const startDate = getStartDate(timeRange);

  const pipeline = [
    {
      $match: {
        playerId: toObjectId(studentId),
        status: 'completed',
        completedAt: { $gte: startDate }
      }
    },
    { $sort: { completedAt: -1 } },
    { $limit: 20 },
    {
      $lookup: {
        from: 'game_sessions',
        localField: 'sessionId',
        foreignField: '_id',
        as: 'session'
      }
    },
    { $unwind: '$session' },
    {
      $lookup: {
        from: 'game_contexts',
        localField: 'session.contextId',
        foreignField: '_id',
        as: 'context'
      }
    },
    { $unwind: { path: '$context', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'game_mechanics',
        localField: 'session.mechanicId',
        foreignField: '_id',
        as: 'mechanic'
      }
    },
    { $unwind: { path: '$mechanic', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        events: 1,
        completedAt: 1,
        contextName: '$context.name',
        mechanicName: '$mechanic.name'
      }
    }
  ];

  const gameplays = await gamePlayRepository.aggregate(pipeline);
  const errorTypes = new Set(['error', 'timeout']);
  const moments = [];

  for (const gp of gameplays) {
    let consecutiveErrors = 0;
    let startRound = null;

    for (const event of gp.events) {
      if (errorTypes.has(event.eventType)) {
        if (consecutiveErrors === 0) {
          startRound = event.roundNumber;
        }
        consecutiveErrors++;
      } else if (event.eventType === 'correct') {
        if (consecutiveErrors >= minConsecutiveErrors) {
          moments.push({
            gameplayId: gp._id.toString(),
            date: gp.completedAt,
            startRound,
            endRound: event.roundNumber - 1,
            consecutiveErrors,
            contextName: gp.contextName || 'Desconocido',
            mechanicName: gp.mechanicName || 'Desconocida'
          });
        }
        consecutiveErrors = 0;
        startRound = null;
      }
    }

    // Verificar si la partida terminó en racha de errores
    if (consecutiveErrors >= minConsecutiveErrors) {
      const lastEvent = gp.events[gp.events.length - 1];
      moments.push({
        gameplayId: gp._id.toString(),
        date: gp.completedAt,
        startRound,
        endRound: lastEvent?.roundNumber || startRound,
        consecutiveErrors,
        contextName: gp.contextName || 'Desconocido',
        mechanicName: gp.mechanicName || 'Desconocida'
      });
    }
  }

  const totalStruggles = moments.length;
  const avgStruggleLength =
    totalStruggles > 0
      ? Math.round(
          (moments.reduce((sum, m) => sum + m.consecutiveErrors, 0) / totalStruggles) * 10
        ) / 10
      : 0;

  return { moments, totalStruggles, avgStruggleLength };
}

// ══════════════════════════════════════════════════════════════════════
// E08 — Indicadores de fatiga agregados de clase
// ══════════════════════════════════════════════════════════════════════

/**
 * Obtiene indicadores de fatiga agregados para toda la clase.
 *
 * @param {string} teacherId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @returns {Promise<Object>} { summary, byStudent }
 */
async function getClassroomFatigue(teacherId, { timeRange = '30d' } = {}) {
  const startDate = getStartDate(timeRange);

  // Obtener estudiantes del profesor
  const students = await userRepository.find(
    { createdBy: toObjectId(teacherId), role: 'student', status: 'active' },
    { select: 'name', lean: true }
  );

  const studentIds = students.map(s => toObjectId(s._id));
  if (studentIds.length === 0) {
    return {
      summary: { averageSlowdownPercent: 0, studentsShowingFatigue: 0, totalStudentsAnalyzed: 0 },
      byStudent: []
    };
  }

  // Obtener partidas completadas con events
  const pipeline = [
    {
      $match: {
        playerId: { $in: studentIds },
        status: 'completed',
        completedAt: { $gte: startDate },
        'events.4': { $exists: true } // Al menos 5 eventos (para dividir en mitades)
      }
    },
    {
      // Filtrar los eventos de respuesta DENTRO de Mongo (mismo predicado que
      // antes se aplicaba en JS) en vez de traer events[] íntegro (rfid_scan,
      // round_start/end…) de todas las partidas de la clase. $filter preserva
      // el orden, requerido por el cálculo de mitades.
      $project: {
        playerId: 1,
        answerEvents: {
          $filter: {
            input: '$events',
            as: 'e',
            cond: {
              $and: [
                { $in: ['$$e.eventType', ['correct', 'error', 'timeout']] },
                { $gt: ['$$e.timeElapsed', 0] }
              ]
            }
          }
        }
      }
    }
  ];

  const gameplays = await gamePlayRepository.aggregate(pipeline);

  // Calcular fatiga por estudiante
  const studentMap = new Map(
    students.map(s => [s._id.toString(), { name: s.name, slowdowns: [] }])
  );

  for (const gp of gameplays) {
    // answerEvents ya viene filtrado desde Mongo ($filter en el pipeline).
    const answerEvents = gp.answerEvents;

    if (answerEvents.length < 4) {
      continue;
    }

    const mid = Math.floor(answerEvents.length / 2);
    const firstHalf = answerEvents.slice(0, mid);
    const secondHalf = answerEvents.slice(mid);

    const avgFirst = firstHalf.reduce((s, e) => s + e.timeElapsed, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, e) => s + e.timeElapsed, 0) / secondHalf.length;

    if (avgFirst > 0) {
      const slowdown = ((avgSecond - avgFirst) / avgFirst) * 100;
      const sid = gp.playerId.toString();
      const entry = studentMap.get(sid);
      if (entry) {
        entry.slowdowns.push(slowdown);
      }
    }
  }

  // Agregar por estudiante
  const byStudent = [];
  let totalSlowdown = 0;
  let studentsWithFatigue = 0;
  let studentsAnalyzed = 0;

  for (const [studentId, data] of studentMap) {
    if (data.slowdowns.length === 0) {
      continue;
    }

    studentsAnalyzed++;
    const avgSlowdown = data.slowdowns.reduce((a, b) => a + b, 0) / data.slowdowns.length;
    totalSlowdown += avgSlowdown;

    if (avgSlowdown > 20) {
      studentsWithFatigue++;
    }

    byStudent.push({
      studentId,
      name: data.name,
      avgSlowdownPercent: Math.round(avgSlowdown * 10) / 10,
      gamesAnalyzed: data.slowdowns.length
    });
  }

  byStudent.sort((a, b) => b.avgSlowdownPercent - a.avgSlowdownPercent);

  return {
    summary: {
      averageSlowdownPercent:
        studentsAnalyzed > 0 ? Math.round((totalSlowdown / studentsAnalyzed) * 10) / 10 : 0,
      studentsShowingFatigue: studentsWithFatigue,
      totalStudentsAnalyzed: studentsAnalyzed
    },
    byStudent
  };
}

module.exports = {
  getGameplayRounds,
  getCardAnalysis,
  getStudentStruggles,
  getClassroomFatigue
};
