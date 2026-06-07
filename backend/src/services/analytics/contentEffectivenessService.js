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

// Sub-agregaciones para el informe `format=detailed` del docente; se acotan a
// 7 s para que MongoDB aborte antes que el `Promise.race` (8 s) de
// `reportDataService`, evitando queries zombie.
const REPORT_AGGREGATE_TIMEOUT_MS = 7000;

// ══════════════════════════════════════════════════════════════════════
// E12 — Efectividad de contenido por contexto/mecánica (y cross matrix)
// ══════════════════════════════════════════════════════════════════════

/**
 * Stages comunes a todas las variantes: lookup de la sesión, filtro de
 * `teacherId` + plays completadas dentro del rango temporal.
 *
 * @private
 * @param {string} teacherId
 * @param {Date} startDate
 * @returns {Array} Stages del pipeline ($lookup sessions + $unwind + $match)
 */
const buildBaseStages = async (teacherId, startDate) => {
  // (B1) Prefiltramos por las sesiones del profesor (helper cacheado, devuelve
  // ObjectId) y hacemos el `$match` ANTES del `$lookup`. Antes el pipeline hacía
  // `$lookup` sobre TODA la colección game_plays y filtraba `session.createdBy`
  // después — coste O(total_plays). Ahora el primer stage usa el índice de
  // game_plays.sessionId y reduce a las plays del profesor. Mismo patrón A.3 ya
  // aplicado en analyticsService. La staleness del caché (300s) la cubre la
  // invalidación de gameSessionService al crear/archivar/eliminar sesiones.
  const { getTeacherSessionIds } = require('../analyticsService');
  const teacherSessionIds = await getTeacherSessionIds(teacherId);

  return [
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
    { $unwind: '$session' }
  ];
};

/**
 * Bloque de agregaciones reutilizado por las tres variantes de groupBy.
 * Calcula avgScore, avgAccuracy, totalPlays, uniqueStudents, avgCompletionTime
 * y empuja `scoreDates` para el slope del improvement rate.
 *
 * @private
 * @returns {Object} Sub-objeto de campos para el `$group` stage
 */
const buildSharedAggregates = () => ({
  avgScore: { $avg: '$score' },
  avgAccuracy: {
    $avg: {
      $cond: [
        { $gt: ['$metrics.totalAttempts', 0] },
        {
          $multiply: [{ $divide: ['$metrics.correctAttempts', '$metrics.totalAttempts'] }, 100]
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
});

/**
 * Construye el pipeline para la vista 1D (groupBy='context' | 'mechanic').
 *
 * @private
 * @param {string} teacherId
 * @param {Date} startDate
 * @param {'context'|'mechanic'} groupBy
 * @returns {Array} Pipeline de agregación completo
 */
const buildSingleDimensionPipeline = async (teacherId, startDate, groupBy) => {
  const lookupCollection = groupBy === 'context' ? 'game_contexts' : 'game_mechanics';
  const lookupField = groupBy === 'context' ? 'session.contextId' : 'session.mechanicId';

  return [
    ...(await buildBaseStages(teacherId, startDate)),
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
        // Preferir displayName (user-facing) con fallback al `name` interno.
        // Alinea la UI con el resto de la app ("Memoria" en vez de "memory").
        _id: {
          entityId: '$entity._id',
          entityName: { $ifNull: ['$entity.displayName', '$entity.name'] }
        },
        ...buildSharedAggregates()
      }
    },
    {
      $project: {
        _id: 0,
        name: '$_id.entityName',
        id: '$_id.entityId',
        // Salvaguarda de integridad: aunque el modelo ahora clampa score <= maxScore
        // (ver ADR-057), las partidas historicas pre-migracion pueden tener > 100.
        // Acotamos defensivamente aqui para que la UI nunca muestre >100%.
        avgScore: { $min: [{ $round: ['$avgScore', 1] }, 100] },
        avgAccuracy: { $min: [{ $round: ['$avgAccuracy', 1] }, 100] },
        totalPlays: 1,
        uniqueStudents: { $size: '$uniqueStudents' },
        avgCompletionTime: { $round: ['$avgCompletionTime', 0] },
        // `$sortArray` (MongoDB 5.2+) emite `scoreDates` ya ordenado por fecha.
        // El JS posterior (`enrichWithLearningMetrics.sortedScores`) mantiene un
        // `.sort()` defensivo pero la regresión lineal recibe el array O(N)
        // ya ordenado, evitando el O(N log N) en el server Node por cada
        // contexto/mecánica que entra en el reporte.
        scoreDates: { $sortArray: { input: '$scoreDates', sortBy: { date: 1 } } }
      }
    },
    { $sort: { avgScore: -1 } }
  ];
};

/**
 * Construye el pipeline para la vista cruzada (groupBy='cross').
 * Hace doble $lookup (contextos + mecánicas) y agrupa por composite key
 * `{ mechanicId, mechanicName, contextId, contextName }`.
 *
 * @private
 * @param {string} teacherId
 * @param {Date} startDate
 * @returns {Array} Pipeline de agregación completo
 */
const buildCrossPipeline = async (teacherId, startDate) => [
  ...(await buildBaseStages(teacherId, startDate)),
  {
    $lookup: {
      from: 'game_contexts',
      localField: 'session.contextId',
      foreignField: '_id',
      as: 'context'
    }
  },
  { $unwind: '$context' },
  {
    $lookup: {
      from: 'game_mechanics',
      localField: 'session.mechanicId',
      foreignField: '_id',
      as: 'mechanic'
    }
  },
  { $unwind: '$mechanic' },
  {
    $group: {
      _id: {
        mechanicId: '$mechanic._id',
        mechanicName: { $ifNull: ['$mechanic.displayName', '$mechanic.name'] },
        contextId: '$context._id',
        contextName: { $ifNull: ['$context.displayName', '$context.name'] }
      },
      ...buildSharedAggregates()
    }
  },
  {
    $project: {
      _id: 0,
      mechanicId: '$_id.mechanicId',
      mechanicName: '$_id.mechanicName',
      contextId: '$_id.contextId',
      contextName: '$_id.contextName',
      // Mismo clamp defensivo que la versión 1D (ver ADR-057).
      avgScore: { $min: [{ $round: ['$avgScore', 1] }, 100] },
      avgAccuracy: { $min: [{ $round: ['$avgAccuracy', 1] }, 100] },
      totalPlays: 1,
      uniqueStudents: { $size: '$uniqueStudents' },
      avgCompletionTime: { $round: ['$avgCompletionTime', 0] },
      // `$sortArray` (MongoDB 5.2+) emite `scoreDates` ya ordenado por fecha,
      // espejo del 1D-pipeline para que `enrichWithLearningMetrics` reciba el
      // array O(N) ordenado en cada celda de la matriz cross.
      scoreDates: { $sortArray: { input: '$scoreDates', sortBy: { date: 1 } } }
    }
  },
  // Orden principal por score desc, secundario por nombre de mecánica asc
  // para que la matriz quede estable cuando hay ties.
  { $sort: { avgScore: -1, mechanicName: 1 } }
];

/**
 * Calcula `improvementRate`, `learningEfficiency`, `scoreRag`, `learningRag`
 * e `interpretation` a partir del `scoreDates` agregado.
 *
 * @private
 * @param {Array<{score:number,date:Date}>} scoreDates
 * @param {number} avgScore
 * @returns {Object} Campos derivados comunes a 1D y cross
 */
const enrichWithLearningMetrics = (scoreDates, avgScore) => {
  // Improvement rate: pendiente de scores a lo largo del tiempo
  const sortedScores = scoreDates
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
  const scoreEnriched = enrichMetric('score', avgScore);
  const learningEnriched = enrichMetric('learningRate', slope);

  return {
    improvementRate: Math.round(slope * 100) / 100,
    learningEfficiency,
    scoreRag: scoreEnriched.rag,
    learningRag: learningEnriched.rag,
    interpretation: learningEnriched.interpretation
  };
};

/**
 * Analiza qué contextos, mecánicas o pares mecánica×contexto producen
 * mejor aprendizaje.
 *
 * @param {string} teacherId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @param {'context'|'mechanic'|'cross'} [options.groupBy='context']
 * @param {boolean} [options.includeEmpty=false] - Sólo aplica a `cross`.
 *   Si es `false` (default), filtra celdas sin partidas (`totalPlays === 0`).
 *   Mongo nunca emite celdas sin plays por la naturaleza del `$group`, pero
 *   la lógica defensiva queda en JS para futuros cambios del pipeline.
 * @returns {Promise<Object>} { items, groupBy }
 */
async function getContentEffectiveness(
  teacherId,
  { timeRange = '30d', groupBy = 'context', includeEmpty = false } = {}
) {
  const startDate = getStartDate(timeRange);

  const pipeline =
    groupBy === 'cross'
      ? await buildCrossPipeline(teacherId, startDate)
      : await buildSingleDimensionPipeline(teacherId, startDate, groupBy);

  const results = await gamePlayRepository.aggregate(pipeline, {
    maxTimeMS: REPORT_AGGREGATE_TIMEOUT_MS
  });

  if (groupBy === 'cross') {
    // Filtrar celdas sin partidas por defecto. `$group` sólo emite combinaciones
    // con al menos una partida, pero mantenemos el filtro como salvaguarda.
    const filtered = includeEmpty ? results : results.filter(r => r.totalPlays > 0);

    const items = filtered.map(r => ({
      mechanicId: r.mechanicId.toString(),
      mechanicName: r.mechanicName,
      contextId: r.contextId.toString(),
      contextName: r.contextName,
      avgScore: r.avgScore,
      avgAccuracy: r.avgAccuracy,
      totalPlays: r.totalPlays,
      uniqueStudents: r.uniqueStudents,
      avgCompletionTime: r.avgCompletionTime,
      ...enrichWithLearningMetrics(r.scoreDates, r.avgScore)
    }));

    return { items, groupBy: 'cross' };
  }

  // Variante 1D (context | mechanic)
  const items = results.map(r => ({
    name: r.name,
    id: r.id.toString(),
    avgScore: r.avgScore,
    avgAccuracy: r.avgAccuracy,
    totalPlays: r.totalPlays,
    uniqueStudents: r.uniqueStudents,
    avgCompletionTime: r.avgCompletionTime,
    ...enrichWithLearningMetrics(r.scoreDates, r.avgScore)
  }));

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

  // (B1) Prefiltro por sesiones del profesor ANTES del $lookup (ver buildBaseStages).
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
    // El filtro por contexto sigue requiriendo el doc de sesión (post-lookup).
    ...(contextId ? [{ $match: { 'session.contextId': toObjectId(contextId) } }] : []),
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

  // (B1) Prefiltro por sesiones del profesor ANTES del $lookup (ver buildBaseStages).
  const { getTeacherSessionIds } = require('../analyticsService');
  const teacherSessionIds = await getTeacherSessionIds(teacherId);

  // El filtro por contexto/mecánica sigue requiriendo el doc de sesión (post-lookup).
  const sessionMatch = {};
  if (contextId) {
    sessionMatch['session.contextId'] = toObjectId(contextId);
  }
  if (mechanicId) {
    sessionMatch['session.mechanicId'] = toObjectId(mechanicId);
  }

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
    ...(Object.keys(sessionMatch).length > 0 ? [{ $match: sessionMatch }] : []),
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
        playNumber: Number.parseInt(pn, 10),
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
