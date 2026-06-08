/**
 * @fileoverview Servicio de trayectoria de aprendizaje del estudiante.
 * Proporciona análisis longitudinal: progresión temporal, velocidad de mejora,
 * detección de mesetas y evolución por contexto/mecánica.
 *
 * Ver Analytics_Design_Rationale.md § 2.1 para fundamentación pedagógica.
 *
 * @module services/analytics/studentTrajectoryService
 */

const gamePlayRepository = require('../../repositories/gamePlayRepository');
const {
  toObjectId,
  getStartDate,
  linearRegression,
  classifyTrend,
  enrichMetric
} = require('./analyticsHelpers');

// Puntuación normalizada a % (score/maxScore×100) para que la trayectoria y la
// evolución por contexto/mecánica sean comparables entre mecánicas con distinto
// techo de puntos (ver analyticsService.SCORE_PERCENT_EXPR).
const SCORE_PERCENT_EXPR = {
  $cond: [{ $gt: ['$maxScore', 0] }, { $multiply: [{ $divide: ['$score', '$maxScore'] }, 100] }, 0]
};

// Margen de 1 s sobre `reportDataService.REPORT_TIMEOUT_MS=8000` para que
// MongoDB aborte por `maxTimeMS` antes de que el Promise.race rechace la
// promesa, evitando queries zombie en el pool. Aplica a los aggregates de
// trayectoria invocados desde el flujo de informes.
const REPORT_AGGREGATE_TIMEOUT_MS = 7000;

// ══════════════════════════════════════════════════════════════════════
// E01 — Trayectoria de aprendizaje
// ══════════════════════════════════════════════════════════════════════

/**
 * Calcula la granularidad por defecto según el timeRange.
 * @param {string} timeRange
 * @returns {string}
 */
const defaultGranularity = timeRange => {
  if (timeRange === '7d') {
    return 'daily';
  }
  if (timeRange === '30d') {
    return 'weekly';
  }
  return 'monthly';
};

/**
 * Devuelve el formato $dateToString según la granularidad.
 * @param {string} granularity
 * @returns {string}
 */
const dateFormat = granularity => {
  if (granularity === 'daily') {
    return '%Y-%m-%d';
  }
  if (granularity === 'weekly') {
    return '%G-W%V';
  }
  return '%Y-%m';
};

/**
 * Obtiene la trayectoria de aprendizaje de un estudiante con tendencia calculada.
 *
 * @param {string} studentId - ID del estudiante
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @param {string} [options.granularity] - 'daily', 'weekly', 'monthly'
 * @returns {Promise<Object>} { dataPoints, trend, timeRange, granularity }
 */
async function getStudentTrajectory(studentId, { timeRange = '30d', granularity } = {}) {
  const gran = granularity || defaultGranularity(timeRange);
  const startDate = getStartDate(timeRange);

  const pipeline = [
    {
      $match: {
        playerId: toObjectId(studentId),
        status: 'completed',
        completedAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat(gran), date: '$completedAt' } },
        avgScore: { $avg: SCORE_PERCENT_EXPR },
        accuracy: {
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
        gamesPlayed: { $sum: 1 },
        avgResponseTime: { $avg: '$metrics.averageResponseTime' }
      }
    },
    { $sort: { _id: 1 } }
  ];

  const results = await gamePlayRepository.aggregate(pipeline, {
    maxTimeMS: REPORT_AGGREGATE_TIMEOUT_MS
  });

  const dataPoints = results.map(r => ({
    period: r._id,
    avgScore: Math.round(r.avgScore * 10) / 10,
    accuracy: Math.round(r.accuracy * 10) / 10,
    gamesPlayed: r.gamesPlayed,
    avgResponseTime: Math.round(r.avgResponseTime || 0)
  }));

  // Serie de PROMEDIO DE CLASE alineada con los MISMOS buckets de fecha, para el
  // overlay "Promedio clase" del TrajectoryChart. Antes el front pasaba
  // `summary.classProgressComparison`, un campo que el backend nunca emitía → el
  // overlay (línea + leyenda) jamás se dibujaba. Ahora se calcula aquí, sobre las
  // partidas completadas de los alumnos del MISMO profesor (excluyendo a los sin
  // consentimiento, Art. 21 RGPD), con el mismo formato de fecha que la trayectoria.
  let classDataPoints = [];
  if (dataPoints.length > 0) {
    const userRepository = require('../../repositories/userRepository');
    // Lazy require: analyticsService ya depende de este módulo (evita ciclo).
    const { getTeacherSessionIds, getAnalyticsExcludedPlayerIds } = require('../analyticsService');
    const studentDoc = await userRepository.findById(studentId, { select: 'createdBy' });
    if (studentDoc?.createdBy) {
      const teacherId = studentDoc.createdBy.toString();
      const [teacherSessionIds, excludedIds] = await Promise.all([
        getTeacherSessionIds(teacherId),
        getAnalyticsExcludedPlayerIds(teacherId)
      ]);
      const classResults = await gamePlayRepository.aggregate(
        [
          {
            $match: {
              sessionId: { $in: teacherSessionIds },
              status: 'completed',
              completedAt: { $gte: startDate },
              ...(excludedIds.length > 0 && { playerId: { $nin: excludedIds } })
            }
          },
          {
            $group: {
              _id: { $dateToString: { format: dateFormat(gran), date: '$completedAt' } },
              avgScore: { $avg: SCORE_PERCENT_EXPR }
            }
          }
        ],
        { maxTimeMS: REPORT_AGGREGATE_TIMEOUT_MS }
      );
      const classByPeriod = new Map(
        classResults.map(r => [r._id, Math.round(r.avgScore * 10) / 10])
      );
      // Alineado por índice con `dataPoints` (mismo bucket de fecha).
      classDataPoints = dataPoints.map(dp => ({
        period: dp.period,
        avgScore: classByPeriod.has(dp.period) ? classByPeriod.get(dp.period) : null
      }));
    }
  }

  // Calcular tendencia con regresión lineal
  const points = dataPoints.map((dp, i) => ({ x: i, y: dp.avgScore }));
  const { slope } = linearRegression(points);
  const { direction, confidence } = classifyTrend(slope, points.length);

  // Enriquecer con RAG e interpretación (framework BI)
  const slopeRounded = Math.round(slope * 100) / 100;
  const trendEnriched = enrichMetric('trendSlope', slopeRounded);
  const latestScore = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].avgScore : 0;
  const scoreEnriched = enrichMetric('score', latestScore);

  return {
    dataPoints,
    classDataPoints,
    trend: {
      direction,
      slope: slopeRounded,
      confidence,
      rag: trendEnriched.rag,
      interpretation: trendEnriched.interpretation
    },
    latestScoreRag: scoreEnriched.rag,
    timeRange,
    granularity: gran
  };
}

// ══════════════════════════════════════════════════════════════════════
// E02 — Velocidad de mejora
// ══════════════════════════════════════════════════════════════════════

/**
 * Calcula la velocidad de mejora del estudiante en ventanas temporales.
 *
 * @param {string} studentId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @param {number} [options.windowDays=7]
 * @returns {Promise<Object>} { windows, overallVelocity, accelerating }
 */
async function getStudentVelocity(studentId, { timeRange = '30d', windowDays = 7 } = {}) {
  const startDate = getStartDate(timeRange);

  const pipeline = [
    {
      $match: {
        playerId: toObjectId(studentId),
        status: 'completed',
        completedAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
        avgScore: { $avg: SCORE_PERCENT_EXPR }
      }
    },
    { $sort: { _id: 1 } }
  ];

  const dailyData = await gamePlayRepository.aggregate(pipeline);

  if (dailyData.length < 2) {
    return { windows: [], overallVelocity: 0, accelerating: false };
  }

  // Agrupar en ventanas de windowDays
  const windows = [];
  let windowStart = 0;

  while (windowStart < dailyData.length) {
    const windowEnd = Math.min(windowStart + windowDays, dailyData.length);
    const windowSlice = dailyData.slice(windowStart, windowEnd);

    const avgScore = windowSlice.reduce((sum, d) => sum + d.avgScore, 0) / windowSlice.length;

    windows.push({
      periodStart: windowSlice[0]._id,
      periodEnd: windowSlice[windowSlice.length - 1]._id,
      avgScore: Math.round(avgScore * 10) / 10,
      velocityChange: 0
    });

    windowStart = windowEnd;
  }

  // Calcular cambio de velocidad entre ventanas consecutivas
  for (let i = 1; i < windows.length; i++) {
    windows[i].velocityChange =
      Math.round((windows[i].avgScore - windows[i - 1].avgScore) * 10) / 10;
  }

  // Velocidad global: pendiente de los promedios de ventana
  const points = windows.map((w, i) => ({ x: i, y: w.avgScore }));
  const { slope } = linearRegression(points);

  // ¿Está acelerando? Comparar pendiente primera mitad vs segunda mitad
  const mid = Math.floor(windows.length / 2);
  const firstHalf = windows.slice(0, mid).map((w, i) => ({ x: i, y: w.avgScore }));
  const secondHalf = windows.slice(mid).map((w, i) => ({ x: i, y: w.avgScore }));
  const slopeFirst = linearRegression(firstHalf).slope;
  const slopeSecond = linearRegression(secondHalf).slope;

  return {
    windows,
    overallVelocity: Math.round(slope * 100) / 100,
    accelerating: slopeSecond > slopeFirst + 0.1
  };
}

// ══════════════════════════════════════════════════════════════════════
// E03 — Detección de mesetas
// ══════════════════════════════════════════════════════════════════════

/**
 * Detecta periodos de estancamiento en el rendimiento del estudiante.
 * Un plateau es un periodo de minDays días donde la desviación estándar del score es < 5.
 *
 * @param {string} studentId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @param {number} [options.minDays=7]
 * @returns {Promise<Object>} { plateaus, currentlyInPlateau }
 */
async function getStudentPlateaus(studentId, { timeRange = '30d', minDays = 7 } = {}) {
  const startDate = getStartDate(timeRange);

  const pipeline = [
    {
      $match: {
        playerId: toObjectId(studentId),
        status: 'completed',
        completedAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
        avgScore: { $avg: SCORE_PERCENT_EXPR },
        gamesPlayed: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ];

  const dailyData = await gamePlayRepository.aggregate(pipeline);

  const plateaus = [];
  const SCORE_VARIATION_THRESHOLD = 5;

  // Ventana deslizante para detectar periodos de baja variación
  for (let start = 0; start <= dailyData.length - minDays; start++) {
    const window = dailyData.slice(start, start + minDays);
    const scores = window.map(d => d.avgScore);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < SCORE_VARIATION_THRESHOLD) {
      const startDate2 = window[0]._id;
      const endDate = window[window.length - 1]._id;

      // Evitar duplicar plateaus solapados: fusionar con el anterior si se solapan
      const lastPlateau = plateaus[plateaus.length - 1];
      if (lastPlateau && lastPlateau.endDate >= startDate2) {
        lastPlateau.endDate = endDate;
        lastPlateau.durationDays =
          Math.floor(
            (new Date(endDate) - new Date(lastPlateau.startDate)) / (1000 * 60 * 60 * 24)
          ) + 1;
        lastPlateau.avgScoreDuringPlateau =
          Math.round(((lastPlateau.avgScoreDuringPlateau + mean) / 2) * 10) / 10;
      } else {
        plateaus.push({
          startDate: startDate2,
          endDate,
          durationDays: minDays,
          avgScoreDuringPlateau: Math.round(mean * 10) / 10,
          gamesPlayed: window.reduce((sum, d) => sum + d.gamesPlayed, 0)
        });
      }
    }
  }

  // ¿Está actualmente en plateau?
  const lastDays = dailyData.slice(-minDays);
  let currentlyInPlateau = false;
  if (lastDays.length >= minDays) {
    const scores = lastDays.map(d => d.avgScore);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
    currentlyInPlateau = Math.sqrt(variance) < SCORE_VARIATION_THRESHOLD;
  }

  return { plateaus, currentlyInPlateau };
}

// ══════════════════════════════════════════════════════════════════════
// E04 — Evolución por contexto/mecánica
// ══════════════════════════════════════════════════════════════════════

/**
 * Obtiene la evolución del rendimiento desglosada por contexto o mecánica.
 *
 * @param {string} studentId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @param {string} [options.groupBy='context'] - 'context' o 'mechanic'
 * @returns {Promise<Object>} { series, groupBy, timeRange }
 */
async function getStudentEvolution(studentId, { timeRange = '30d', groupBy = 'context' } = {}) {
  const startDate = getStartDate(timeRange);

  const lookupCollection = groupBy === 'context' ? 'game_contexts' : 'game_mechanics';
  const lookupField = groupBy === 'context' ? 'session.contextId' : 'session.mechanicId';

  const pipeline = [
    {
      $match: {
        playerId: toObjectId(studentId),
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
    {
      $lookup: {
        from: lookupCollection,
        localField: lookupField,
        foreignField: '_id',
        as: 'groupEntity'
      }
    },
    { $unwind: '$groupEntity' },
    {
      $group: {
        _id: {
          entityId: '$groupEntity._id',
          entityName: '$groupEntity.name',
          week: { $dateToString: { format: '%G-W%V', date: '$completedAt' } }
        },
        avgScore: { $avg: SCORE_PERCENT_EXPR },
        gamesPlayed: { $sum: 1 }
      }
    },
    { $sort: { '_id.week': 1 } },
    {
      $group: {
        _id: { entityId: '$_id.entityId', entityName: '$_id.entityName' },
        dataPoints: {
          $push: {
            date: '$_id.week',
            avgScore: { $round: ['$avgScore', 1] },
            gamesPlayed: '$gamesPlayed'
          }
        }
      }
    }
  ];

  const results = await gamePlayRepository.aggregate(pipeline);

  const series = results.map(r => ({
    name: r._id.entityName,
    id: r._id.entityId.toString(),
    dataPoints: r.dataPoints
  }));

  return { series, groupBy, timeRange };
}

module.exports = {
  getStudentTrajectory,
  getStudentVelocity,
  getStudentPlateaus,
  getStudentEvolution
};
