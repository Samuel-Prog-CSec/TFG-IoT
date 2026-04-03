/**
 * @fileoverview Servicio de análisis de efectividad de contenido.
 * Evalúa qué contextos/mecánicas producen mejor aprendizaje,
 * identifica tarjetas problemáticas y calcula curvas de aprendizaje.
 *
 * Ver Analytics_Design_Rationale.md § 2.4 para fundamentación pedagógica.
 *
 * @module services/analytics/contentEffectivenessService
 */

const gamePlayRepository = require('../../repositories/gamePlayRepository');
const { toObjectId, getStartDate, linearRegression, enrichMetric } = require('./analyticsHelpers');

// ══════════════════════════════════════════════════════════════════════
// E12 — Efectividad de contenido por contexto/mecánica
// ══════════════════════════════════════════════════════════════════════

/**
 * Analiza qué contextos o mecánicas producen mejor aprendizaje.
 *
 * @param {string} teacherId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @param {string} [options.groupBy='context']
 * @returns {Promise<Object>} { items, groupBy }
 */
async function getContentEffectiveness(teacherId, { timeRange = '30d', groupBy = 'context' } = {}) {
  const startDate = getStartDate(timeRange);
  const lookupCollection = groupBy === 'context' ? 'game_contexts' : 'game_mechanics';
  const lookupField = groupBy === 'context' ? 'session.contextId' : 'session.mechanicId';

  const pipeline = [
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
      $match: {
        'session.createdBy': toObjectId(teacherId),
        status: 'completed',
        completedAt: { $gte: startDate }
      }
    },
    {
      $lookup: {
        from: lookupCollection,
        localField: lookupField,
        foreignField: '_id',
        as: 'entity'
      }
    },
    { $unwind: '$entity' },
    {
      $group: {
        _id: { entityId: '$entity._id', entityName: '$entity.name' },
        avgScore: { $avg: '$score' },
        avgAccuracy: {
          $avg: {
            $cond: [
              { $gt: ['$metrics.totalAttempts', 0] },
              {
                $multiply: [
                  { $divide: ['$metrics.correctAttempts', '$metrics.totalAttempts'] },
                  100
                ]
              },
              0
            ]
          }
        },
        totalPlays: { $sum: 1 },
        uniqueStudents: { $addToSet: '$playerId' },
        avgCompletionTime: { $avg: '$metrics.completionTime' },
        // Para calcular improvement rate: guardar scores con fecha
        scoreDates: {
          $push: {
            score: '$score',
            date: '$completedAt'
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        name: '$_id.entityName',
        id: '$_id.entityId',
        avgScore: { $round: ['$avgScore', 1] },
        avgAccuracy: { $round: ['$avgAccuracy', 1] },
        totalPlays: 1,
        uniqueStudents: { $size: '$uniqueStudents' },
        avgCompletionTime: { $round: ['$avgCompletionTime', 0] },
        scoreDates: 1
      }
    },
    { $sort: { avgScore: -1 } }
  ];

  const results = await gamePlayRepository.aggregate(pipeline);

  // Calcular improvement rate y learning efficiency para cada item
  const items = results.map(r => {
    // Improvement rate: pendiente de scores a lo largo del tiempo
    const sortedScores = r.scoreDates
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((sd, i) => ({ x: i, y: sd.score }));

    const { slope } = linearRegression(sortedScores);

    let learningEfficiency;
    if (slope > 1) {
      learningEfficiency = 'high';
    } else if (slope > 0) {
      learningEfficiency = 'medium';
    } else {
      learningEfficiency = 'low';
    }

    // Enriquecer con RAG e interpretación (framework BI)
    const scoreEnriched = enrichMetric('score', r.avgScore);
    const learningEnriched = enrichMetric('learningRate', slope);

    return {
      name: r.name,
      id: r.id.toString(),
      avgScore: r.avgScore,
      avgAccuracy: r.avgAccuracy,
      totalPlays: r.totalPlays,
      uniqueStudents: r.uniqueStudents,
      avgCompletionTime: r.avgCompletionTime,
      improvementRate: Math.round(slope * 100) / 100,
      learningEfficiency,
      scoreRag: scoreEnriched.rag,
      learningRag: learningEnriched.rag,
      interpretation: learningEnriched.interpretation
    };
  });

  return { items, groupBy };
}

// ══════════════════════════════════════════════════════════════════════
// E13 — Tarjetas con dificultad alta
// ══════════════════════════════════════════════════════════════════════

/**
 * Identifica tarjetas RFID con tasa de error por encima de un umbral.
 *
 * @param {string} teacherId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @param {string} [options.contextId]
 * @param {number} [options.threshold=40]
 * @returns {Promise<Object>} { flaggedCards, totalCardsAnalyzed, cardsAboveThreshold }
 */
async function getCardDifficulty(teacherId, { timeRange = '30d', contextId, threshold = 40 } = {}) {
  const startDate = getStartDate(timeRange);

  const matchStage = {
    'session.createdBy': toObjectId(teacherId),
    status: 'completed',
    completedAt: { $gte: startDate }
  };

  if (contextId) {
    matchStage['session.contextId'] = toObjectId(contextId);
  }

  const pipeline = [
    {
      $lookup: {
        from: 'game_sessions',
        localField: 'sessionId',
        foreignField: '_id',
        as: 'session'
      }
    },
    { $unwind: '$session' },
    { $match: matchStage },
    {
      $lookup: {
        from: 'game_contexts',
        localField: 'session.contextId',
        foreignField: '_id',
        as: 'context'
      }
    },
    { $unwind: { path: '$context', preserveNullAndEmptyArrays: true } },
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
        uniqueStudents: { $addToSet: '$playerId' },
        contextName: { $first: '$context.name' },
        sampleExpectedValue: { $first: '$events.expectedValue' }
      }
    },
    {
      $addFields: {
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
        difficultyIndex: {
          $round: [{ $divide: [{ $add: ['$errorCount', '$timeoutCount'] }, '$totalAttempts'] }, 2]
        },
        studentsAttempted: { $size: '$uniqueStudents' }
      }
    },
    { $sort: { errorRate: -1 } }
  ];

  const allCards = await gamePlayRepository.aggregate(pipeline);

  const flaggedCards = allCards
    .filter(c => c.errorRate >= threshold && c.studentsAttempted >= 3)
    .map(c => {
      const cardEnriched = enrichMetric('cardErrorRate', c.errorRate);
      return {
        cardUid: c._id,
        assignedValue: c.sampleExpectedValue || 'Desconocido',
        contextName: c.contextName || 'Sin contexto',
        errorRate: c.errorRate,
        difficultyIndex: c.difficultyIndex,
        studentsAttempted: c.studentsAttempted,
        rag: cardEnriched.rag,
        interpretation: cardEnriched.interpretation
      };
    });

  return {
    flaggedCards,
    totalCardsAnalyzed: allCards.length,
    cardsAboveThreshold: flaggedCards.length
  };
}

// ══════════════════════════════════════════════════════════════════════
// E14 — Curvas de aprendizaje por contenido
// ══════════════════════════════════════════════════════════════════════

/**
 * Calcula curvas de aprendizaje: ¿mejoran los scores con la repetición?
 *
 * @param {string} teacherId
 * @param {Object} options
 * @param {string} [options.timeRange='90d']
 * @param {string} [options.contextId]
 * @param {string} [options.mechanicId]
 * @returns {Promise<Object>} { curves }
 */
async function getLearningCurves(teacherId, { timeRange = '90d', contextId, mechanicId } = {}) {
  const startDate = getStartDate(timeRange);

  const sessionMatch = { 'session.createdBy': toObjectId(teacherId) };
  if (contextId) {
    sessionMatch['session.contextId'] = toObjectId(contextId);
  }
  if (mechanicId) {
    sessionMatch['session.mechanicId'] = toObjectId(mechanicId);
  }

  const pipeline = [
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
      $match: {
        ...sessionMatch,
        status: 'completed',
        completedAt: { $gte: startDate }
      }
    },
    {
      $lookup: {
        from: 'game_contexts',
        localField: 'session.contextId',
        foreignField: '_id',
        as: 'context'
      }
    },
    { $unwind: { path: '$context', preserveNullAndEmptyArrays: true } },
    { $sort: { playerId: 1, 'context._id': 1, completedAt: 1 } },
    {
      $group: {
        _id: { playerId: '$playerId', contextId: '$context._id', contextName: '$context.name' },
        plays: { $push: { score: '$score', date: '$completedAt' } }
      }
    }
  ];

  const playerContextPlays = await gamePlayRepository.aggregate(pipeline);

  // Agrupar por contexto y calcular score promedio por número de intento
  const contextMap = {};

  for (const pcp of playerContextPlays) {
    const contextId2 = pcp._id.contextId?.toString() || 'unknown';
    const contextName = pcp._id.contextName || 'Desconocido';

    if (!contextMap[contextId2]) {
      contextMap[contextId2] = { name: contextName, id: contextId2, playNumberScores: {} };
    }

    // Numerar partidas secuencialmente para este alumno+contexto
    pcp.plays.forEach((play, index) => {
      const playNumber = index + 1;
      if (!contextMap[contextId2].playNumberScores[playNumber]) {
        contextMap[contextId2].playNumberScores[playNumber] = [];
      }
      contextMap[contextId2].playNumberScores[playNumber].push(play.score);
    });
  }

  // Construir curvas
  const curves = Object.values(contextMap).map(ctx => {
    const dataPoints = Object.entries(ctx.playNumberScores)
      .map(([pn, scores]) => ({
        playNumber: parseInt(pn, 10),
        avgScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
        sampleSize: scores.length
      }))
      .filter(dp => dp.sampleSize >= 2) // Necesitamos al menos 2 alumnos para ser significativo
      .sort((a, b) => a.playNumber - b.playNumber);

    // Calcular learning rate
    const points = dataPoints.map(dp => ({ x: dp.playNumber, y: dp.avgScore }));
    const { slope } = linearRegression(points);

    // Detectar punto de plateau
    let plateauAt = null;
    for (let i = 1; i < dataPoints.length; i++) {
      const improvement = dataPoints[i].avgScore - dataPoints[i - 1].avgScore;
      if (improvement < 1 && i >= 3) {
        plateauAt = dataPoints[i].playNumber;
        break;
      }
    }

    return {
      name: ctx.name,
      id: ctx.id,
      dataPoints,
      learningRate: Math.round(slope * 100) / 100,
      plateauAt
    };
  });

  return { curves };
}

module.exports = {
  getContentEffectiveness,
  getCardDifficulty,
  getLearningCurves
};
