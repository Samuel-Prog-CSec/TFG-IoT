/**
 * @fileoverview Servicio para análisis de datos y estadísticas de juego.
 * Encapsula la lógica de agregación de MongoDB para transformar datos crudos en insights.
 */

const mongoose = require('mongoose');
const gamePlayRepository = require('../repositories/gamePlayRepository');

/**
 * Obtiene la evolución del rendimiento de un estudiante a lo largo del tiempo.
 * Agrupa las partidas por fecha (día o semana) y calcula promedios.
 *
 * @param {string} studentId - ID del estudiante
 * @param {string} timeRange - Rango de tiempo ('7d' o '30d')
 * @returns {Promise<Array>} Array de puntos de datos para gráficos
 */
async function getStudentProgress(studentId, timeRange = '30d') {
  const now = new Date();
  const past = new Date();

  if (timeRange === '7d') {
    past.setDate(now.getDate() - 7);
  } else {
    past.setDate(now.getDate() - 30);
  }

  const pipeline = [
    {
      $match: {
        playerId: new mongoose.Types.ObjectId(studentId),
        status: 'completed',
        completedAt: { $gte: past, $lte: now }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
        score: { $avg: '$score' },
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
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        date: '$_id',
        score: { $round: ['$score', 1] },
        accuracy: { $round: ['$accuracy', 1] },
        count: 1,
        _id: 0
      }
    }
  ];

  return await gamePlayRepository.aggregate(pipeline);
}

/**
 * Analiza las dificultades del estudiante desglosadas por mecánica y contexto.
 * Ayuda a identificar "dónde" falla más el alumno.
 *
 * @param {string} studentId - ID del estudiante
 * @returns {Promise<Object>} Objeto con análisis de dificultades
 */
async function getStudentDifficulties(studentId) {
  // Unimos con GameSession para saber mecánica y contexto
  const pipeline = [
    {
      $match: {
        playerId: new mongoose.Types.ObjectId(studentId),
        status: 'completed'
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
          context: '$context.name',
          mechanic: '$mechanic.name'
        },
        totalAttempts: { $sum: '$metrics.totalAttempts' },
        errorAttempts: { $sum: '$metrics.errorAttempts' },
        timeoutAttempts: { $sum: '$metrics.timeoutAttempts' }
      }
    },
    {
      $project: {
        context: '$_id.context',
        mechanic: '$_id.mechanic',
        errorRate: {
          $cond: [
            { $gt: ['$totalAttempts', 0] },
            {
              $multiply: [
                { $divide: [{ $add: ['$errorAttempts', '$timeoutAttempts'] }, '$totalAttempts'] },
                100
              ]
            },
            0
          ]
        },
        totalAttempts: 1
      }
    },
    { $sort: { errorRate: -1 } } // Los más difíciles primero
  ];

  return await gamePlayRepository.aggregate(pipeline);
}

/**
 * Obtiene un resumen global de la clase del profesor.
 * KPIs principales: Estudiantes en riesgo, media de clase, actividad hoy.
 *
 * @param {string} teacherId - ID del profesor
 * @returns {Promise<Object>} KPIs calculados
 */
async function getClassroomSummary(teacherId) {
  // Excluir estudiantes sin consentimiento de analytics (Art. 21 RGPD)
  const excludedIds = await getAnalyticsExcludedPlayerIds(teacherId);
  const teacherOid = new mongoose.Types.ObjectId(teacherId);

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
        'session.createdBy': teacherOid,
        ...(excludedIds.length > 0 && { playerId: { $nin: excludedIds } })
      }
    },
    {
      $facet: {
        // Promedio global y tendencia
        globalStats: [
          {
            $group: {
              _id: null,
              avgScore: { $avg: '$score' },
              totalGames: { $sum: 1 }
            }
          }
        ],
        // Actividad de hoy
        todayActivity: [
          {
            $match: {
              completedAt: {
                $gte: new Date(new Date().setHours(0, 0, 0, 0)),
                $lt: new Date(new Date().setHours(23, 59, 59, 999))
              }
            }
          },
          { $count: 'count' }
        ]
      }
    }
  ];

  // Riesgo: alineado con el listado de Mis Alumnos (BUG-4 QA pre-release v0.5.0).
  // El listado clasifica a los alumnos por `studentMetrics.averageScore`
  // (lifetime). Antes el KPI usaba la media reciente de partidas, lo que
  // producía discrepancias entre el contador (9) y la cuenta de filas con badge
  // EN RIESGO (8). Ahora ambas vistas leen la misma fuente.
  const [results, studentsInRisk] = await Promise.all([
    gamePlayRepository.aggregate(pipeline),
    userRepository.count({
      createdBy: teacherOid,
      role: 'student',
      status: 'active',
      ...ANALYTICS_CONSENT_FILTER,
      'studentMetrics.averageScore': { $gte: 0, $lt: 50 }
    })
  ]);

  const data = results[0];

  return {
    studentsInRisk,
    averageScore: data.globalStats[0] ? Math.round(data.globalStats[0].avgScore) : 0,
    totalGames: data.globalStats[0] ? data.globalStats[0].totalGames : 0,
    gamesToday: data.todayActivity[0] ? data.todayActivity[0].count : 0
  };
}

/**
 * Compara el rendimiento del estudiante con la media general de la clase
 * para un periodo de tiempo.
 *
 * @param {string} teacherId - ID del profesor (para contexto de clase)
 * @param {string} timeRange - '7d' o '30d'
 */
async function getClassroomComparison(teacherId, timeRange = '7d') {
  const today = new Date();
  const startDate = new Date(today);
  const rangeDays = timeRange === '30d' ? 30 : 7;
  startDate.setDate(today.getDate() - rangeDays);

  // Excluir estudiantes sin consentimiento de analytics (Art. 21 RGPD)
  const excludedIds = await getAnalyticsExcludedPlayerIds(teacherId);

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
        'session.createdBy': new mongoose.Types.ObjectId(teacherId),
        status: 'completed',
        completedAt: { $gte: startDate },
        ...(excludedIds.length > 0 && { playerId: { $nin: excludedIds } })
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
        classAverage: { $avg: '$score' },
        score: { $avg: '$score' },
        playCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ];

  const aggregated = await gamePlayRepository.aggregate(pipeline);

  // PROP-26: rellenar dias faltantes del rango con null para que el chart
  // de tendencia muestre exactamente N puntos (UX honesta — el rango
  // elegido por el usuario es contractual). El frontend usa
  // connectNulls={false} para visualizar los gaps como huecos visibles.
  const byDate = new Map(aggregated.map(item => [item._id, item]));
  const result = [];
  for (let i = rangeDays; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    const existing = byDate.get(key);
    if (existing) {
      result.push(existing);
    } else {
      result.push({ _id: key, classAverage: null, score: null, playCount: 0 });
    }
  }
  return result;
}

/**
 * Analiza las dificultades globales de la clase (contexto/mecánica).
 * @param {string} teacherId
 */
async function getClassroomDifficulties(teacherId) {
  // Excluir estudiantes sin consentimiento de analytics (Art. 21 RGPD)
  const excludedIds = await getAnalyticsExcludedPlayerIds(teacherId);

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
        'session.createdBy': new mongoose.Types.ObjectId(teacherId),
        status: 'completed',
        ...(excludedIds.length > 0 && { playerId: { $nin: excludedIds } })
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
          context: '$context.name',
          mechanic: '$mechanic.name'
        },
        totalAttempts: { $sum: '$metrics.totalAttempts' },
        errorAttempts: { $sum: '$metrics.errorAttempts' },
        timeoutAttempts: { $sum: '$metrics.timeoutAttempts' }
      }
    },
    {
      $project: {
        context: '$_id.context',
        mechanic: '$_id.mechanic',
        errorRate: {
          $cond: [
            { $gt: ['$totalAttempts', 0] },
            {
              $multiply: [
                { $divide: [{ $add: ['$errorAttempts', '$timeoutAttempts'] }, '$totalAttempts'] },
                100
              ]
            },
            0
          ]
        },
        totalAttempts: 1,
        _id: 0
      }
    },
    { $sort: { errorRate: -1 } }
  ];

  return await gamePlayRepository.aggregate(pipeline);
}

// ══════════════════════════════════════════════════════════════════════
// Nuevos endpoints de analytics (T-601)
// ══════════════════════════════════════════════════════════════════════

const userRepository = require('../repositories/userRepository');
const { pseudonymize } = require('../utils/pseudonymize');
const { cacheGet } = require('../utils/cacheHelper');

/**
 * Filtro de consentimiento para analytics.
 * Solo incluye estudiantes con consentimiento activo de performance_analytics.
 * Art. 21 RGPD — Derecho de oposición al tratamiento con fines de análisis.
 * @private
 */
const ANALYTICS_CONSENT_FILTER = {
  'consent.granted': true,
  'consent.purposes': 'performance_analytics'
};

/**
 * Obtiene los IDs de estudiantes que NO tienen consentimiento de analytics activo.
 * Usado para excluir sus partidas de aggregaciones GamePlay ($nin).
 * Art. 21 RGPD — Derecho de oposición al tratamiento con fines de análisis.
 *
 * @param {string} teacherId - ID del profesor
 * @returns {Promise<Array<import('mongoose').Types.ObjectId>>} IDs a excluir
 * @private
 */
async function getAnalyticsExcludedPlayerIds(teacherId) {
  return cacheGet(
    'cache:analytics',
    `excluded:${teacherId}`,
    async () => {
      const excluded = await userRepository.find(
        {
          createdBy: new mongoose.Types.ObjectId(teacherId),
          role: 'student',
          $or: [
            { 'consent.granted': { $ne: true } },
            { 'consent.purposes': { $ne: 'performance_analytics' } }
          ]
        },
        { select: '_id' }
      );
      return excluded.map(s => s._id);
    },
    60
  ); // TTL 60s — los cambios de consentimiento son infrecuentes
}

/**
 * Rangos de rendimiento para clasificación de estudiantes.
 * @private
 */
const PERFORMANCE_TIERS = [
  { tier: 'risk', label: 'Riesgo (0-49)', min: 0, max: 49 },
  { tier: 'average', label: 'Promedio (50-69)', min: 50, max: 69 },
  { tier: 'good', label: 'Bueno (70-89)', min: 70, max: 89 },
  { tier: 'excellent', label: 'Excelente (90-100)', min: 90, max: 100 }
];

/**
 * Clasifica un score en un tier de rendimiento.
 * @private
 */
const classifyTier = score => {
  if (score === null || score === undefined || score < 0) {
    return 'risk';
  }
  const found = PERFORMANCE_TIERS.find(t => score >= t.min && score <= t.max);
  return found ? found.tier : 'risk';
};

/**
 * Calcula la tasa de precisión.
 * @private
 */
const calcAccuracyRate = (correct, errors) => {
  const total = (correct || 0) + (errors || 0);
  if (total === 0) {
    return 0;
  }
  return Math.round(((correct || 0) / total) * 100 * 10) / 10;
};

/**
 * Lista de estudiantes del profesor con métricas agregadas.
 *
 * @param {string} teacherId - ID del profesor
 * @param {Object} options - Opciones de filtrado y ordenamiento
 * @param {string} [options.sort='name'] - Campo de ordenamiento
 * @param {string} [options.order='asc'] - Dirección de ordenamiento
 * @param {string} [options.tier] - Filtrar por tier de rendimiento
 * @param {string} [options.classroom] - Filtrar por aula
 * @returns {Promise<Array>} Lista de estudiantes con métricas
 */
async function getClassroomStudents(
  teacherId,
  { sort = 'name', order = 'asc', tier, classroom } = {}
) {
  const filter = {
    createdBy: new mongoose.Types.ObjectId(teacherId),
    role: 'student',
    status: 'active',
    ...ANALYTICS_CONSENT_FILTER
  };

  if (classroom) {
    filter['profile.classroom'] = classroom;
  }

  const students = await userRepository.find(filter, {
    select: 'name profile.avatar profile.classroom profile.age studentMetrics status'
  });

  let mapped = students.map(student => {
    const metrics = student.studentMetrics || {};
    const accuracyRate = calcAccuracyRate(metrics.totalCorrectAnswers, metrics.totalErrors);
    const studentTier = classifyTier(metrics.averageScore);

    return {
      id: student._id.toString(),
      pseudoId: pseudonymize(student._id),
      name: student.name,
      avatar: student.profile?.avatar || null,
      classroom: student.profile?.classroom || null,
      age: student.profile?.age || null,
      status: student.status,
      tier: studentTier,
      accuracyRate,
      studentMetrics: {
        totalGamesPlayed: metrics.totalGamesPlayed || 0,
        totalScore: metrics.totalScore || 0,
        // Redondeo a 1 decimal para evitar floats con cola larga (p. ej.
        // `42.722222...`) en la UI tras agregaciones de Mongo (QA 26/04/2026).
        averageScore: Number.isFinite(metrics.averageScore)
          ? Math.round(metrics.averageScore * 10) / 10
          : 0,
        bestScore: metrics.bestScore || 0,
        totalCorrectAnswers: metrics.totalCorrectAnswers || 0,
        totalErrors: metrics.totalErrors || 0,
        averageResponseTime: metrics.averageResponseTime || 0,
        lastPlayedAt: metrics.lastPlayedAt || null
      }
    };
  });

  // Filtrar por tier si se especifica
  if (tier) {
    mapped = mapped.filter(s => s.tier === tier);
  }

  // Ordenar
  const dir = order === 'desc' ? -1 : 1;

  mapped.sort((a, b) => {
    let valA, valB;

    if (sort === 'name') {
      valA = (a.name || '').toLowerCase();
      valB = (b.name || '').toLowerCase();
      if (valA < valB) {
        return -1 * dir;
      }
      if (valA > valB) {
        return 1 * dir;
      }
      return 0;
    }
    if (sort === 'score') {
      valA = a.studentMetrics.averageScore;
      valB = b.studentMetrics.averageScore;
    } else if (sort === 'lastPlayed') {
      valA = a.studentMetrics.lastPlayedAt ? new Date(a.studentMetrics.lastPlayedAt).getTime() : 0;
      valB = b.studentMetrics.lastPlayedAt ? new Date(b.studentMetrics.lastPlayedAt).getTime() : 0;
    } else if (sort === 'accuracy') {
      valA = a.accuracyRate;
      valB = b.accuracyRate;
    } else {
      valA = 0;
      valB = 0;
    }
    return (valA - valB) * dir;
  });

  return mapped;
}

/**
 * Distribución de rendimiento en 4 rangos.
 *
 * @param {string} teacherId - ID del profesor
 * @returns {Promise<Array>} Distribución con count y porcentaje por rango
 */
async function getClassroomDistribution(teacherId) {
  const students = await userRepository.find(
    {
      createdBy: new mongoose.Types.ObjectId(teacherId),
      role: 'student',
      status: 'active',
      ...ANALYTICS_CONSENT_FILTER
    },
    { select: 'studentMetrics.averageScore' }
  );

  const totalStudents = students.length;
  const distribution = PERFORMANCE_TIERS.map(({ tier, label, min, max }) => {
    const count = students.filter(s => {
      const score = s.studentMetrics?.averageScore ?? 0;
      return score >= min && score <= max;
    }).length;

    return {
      range: `${min}-${max}`,
      tier,
      label,
      count,
      percentage: totalStudents > 0 ? Math.round((count / totalStudents) * 100 * 10) / 10 : 0
    };
  });

  return { distribution, totalStudents };
}

/**
 * Calcula la fecha de inicio según el timeRange.
 * @private
 */
const getDateRange = (timeRange = '7d') => {
  const days = timeRange === '30d' ? 30 : 7;
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(now.getDate() - days);
  const previousStart = new Date(currentStart);
  previousStart.setDate(currentStart.getDate() - days);
  return { now, currentStart, previousStart, days };
};

/**
 * Trends calculados comparando períodos (actual vs anterior).
 *
 * @param {string} teacherId - ID del profesor
 * @param {string} [timeRange='7d'] - Rango temporal
 * @returns {Promise<Object>} KPIs con valores actuales, anteriores y cambio porcentual
 */
async function getClassroomTrends(teacherId, timeRange = '7d') {
  const { now, currentStart, previousStart } = getDateRange(timeRange);
  const teacherOid = new mongoose.Types.ObjectId(teacherId);

  // Excluir estudiantes sin consentimiento de analytics (Art. 21 RGPD)
  const excludedIds = await getAnalyticsExcludedPlayerIds(teacherId);

  // Pipeline para obtener stats de ambos períodos en un solo query
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
        'session.createdBy': teacherOid,
        status: 'completed',
        completedAt: { $gte: previousStart, $lte: now },
        ...(excludedIds.length > 0 && { playerId: { $nin: excludedIds } })
      }
    },
    {
      $facet: {
        current: [
          { $match: { completedAt: { $gte: currentStart } } },
          {
            $group: {
              _id: null,
              avgScore: { $avg: '$score' },
              totalGames: { $sum: 1 },
              uniquePlayers: { $addToSet: '$playerId' },
              avgResponseTime: { $avg: '$metrics.averageResponseTime' },
              totalCorrect: { $sum: '$metrics.correctAttempts' },
              totalAttempts: { $sum: '$metrics.totalAttempts' }
            }
          }
        ],
        previous: [
          { $match: { completedAt: { $gte: previousStart, $lt: currentStart } } },
          {
            $group: {
              _id: null,
              avgScore: { $avg: '$score' },
              totalGames: { $sum: 1 },
              uniquePlayers: { $addToSet: '$playerId' },
              avgResponseTime: { $avg: '$metrics.averageResponseTime' },
              totalCorrect: { $sum: '$metrics.correctAttempts' },
              totalAttempts: { $sum: '$metrics.totalAttempts' }
            }
          }
        ],
        todayGames: [
          {
            $match: {
              completedAt: {
                $gte: new Date(new Date().setHours(0, 0, 0, 0)),
                $lt: new Date(new Date().setHours(23, 59, 59, 999))
              }
            }
          },
          { $count: 'count' }
        ]
      }
    }
  ];

  const [result] = await gamePlayRepository.aggregate(pipeline);

  const curr = result.current[0] || {};
  const prev = result.previous[0] || {};
  const gamesToday = result.todayGames[0]?.count || 0;

  // Estudiantes en riesgo (score < 50) — desde User model
  // Solo estudiantes con consentimiento de analytics activo (Art. 21 RGPD)
  const riskStudents = await userRepository.count({
    createdBy: teacherOid,
    role: 'student',
    status: 'active',
    ...ANALYTICS_CONSENT_FILTER,
    'studentMetrics.averageScore': { $lt: 50, $gt: 0 }
  });

  const calcChange = (current, previous) => {
    if (!previous || previous === 0) {
      return { change: current || 0, changePercent: 0 };
    }
    const change = (current || 0) - previous;
    const changePercent = Math.round((change / previous) * 100 * 10) / 10;
    return { change: Math.round(change * 10) / 10, changePercent };
  };

  const currAccuracy =
    curr.totalAttempts > 0
      ? Math.round((curr.totalCorrect / curr.totalAttempts) * 100 * 10) / 10
      : 0;
  const prevAccuracy =
    prev.totalAttempts > 0
      ? Math.round((prev.totalCorrect / prev.totalAttempts) * 100 * 10) / 10
      : 0;

  return {
    kpis: [
      {
        name: 'studentsInRisk',
        label: 'Estudiantes en riesgo',
        current: riskStudents,
        ...calcChange(riskStudents, riskStudents) // No hay dato previo para este KPI
      },
      {
        name: 'averageScore',
        label: 'Puntuación media',
        current: Math.round((curr.avgScore || 0) * 10) / 10,
        previous: Math.round((prev.avgScore || 0) * 10) / 10,
        ...calcChange(curr.avgScore, prev.avgScore)
      },
      {
        name: 'gamesToday',
        label: 'Partidas hoy',
        current: gamesToday,
        previous: null,
        change: gamesToday,
        changePercent: 0
      },
      {
        name: 'totalGames',
        label: 'Total partidas',
        current: curr.totalGames || 0,
        previous: prev.totalGames || 0,
        ...calcChange(curr.totalGames, prev.totalGames)
      },
      {
        name: 'averageAccuracy',
        label: 'Precisión media',
        current: currAccuracy,
        previous: prevAccuracy,
        ...calcChange(currAccuracy, prevAccuracy)
      },
      {
        name: 'averageResponseTime',
        label: 'Tiempo medio de respuesta (ms)',
        current: Math.round(curr.avgResponseTime || 0),
        previous: Math.round(prev.avgResponseTime || 0),
        ...calcChange(curr.avgResponseTime, prev.avgResponseTime)
      }
    ],
    timeRange,
    periodStart: currentStart.toISOString(),
    periodEnd: now.toISOString()
  };
}

/**
 * Resumen completo de un estudiante.
 *
 * @param {string} studentId - ID del estudiante
 * @param {string} [timeRange='30d'] - Rango temporal
 * @returns {Promise<Object>} Resumen con últimas partidas, rendimiento por contexto/mecánica y comparativa
 */
async function getStudentSummary(studentId, timeRange = '30d') {
  const { currentStart } = getDateRange(timeRange);
  const studentOid = new mongoose.Types.ObjectId(studentId);

  // Pipeline con $facet para un solo round-trip
  const pipeline = [
    {
      $match: {
        playerId: studentOid,
        status: 'completed',
        completedAt: { $gte: currentStart }
      }
    },
    {
      $facet: {
        lastGames: [
          { $sort: { completedAt: -1 } },
          { $limit: 10 },
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
              score: 1,
              completedAt: 1,
              accuracy: {
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
              },
              context: '$context.name',
              mechanic: '$mechanic.displayName',
              _id: 0
            }
          }
        ],
        byContext: [
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
            $group: {
              _id: { id: '$context._id', name: '$context.name' },
              avgScore: { $avg: '$score' },
              totalGames: { $sum: 1 },
              totalErrors: { $sum: '$metrics.errorAttempts' },
              totalAttempts: { $sum: '$metrics.totalAttempts' }
            }
          },
          {
            $project: {
              context: '$_id.name',
              avgScore: { $round: ['$avgScore', 1] },
              totalGames: 1,
              errorRate: {
                $cond: [
                  { $gt: ['$totalAttempts', 0] },
                  {
                    $round: [
                      { $multiply: [{ $divide: ['$totalErrors', '$totalAttempts'] }, 100] },
                      1
                    ]
                  },
                  0
                ]
              },
              _id: 0
            }
          },
          { $sort: { totalGames: -1 } }
        ],
        byMechanic: [
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
              from: 'game_mechanics',
              localField: 'session.mechanicId',
              foreignField: '_id',
              as: 'mechanic'
            }
          },
          { $unwind: { path: '$mechanic', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: { id: '$mechanic._id', name: '$mechanic.displayName' },
              avgScore: { $avg: '$score' },
              totalGames: { $sum: 1 }
            }
          },
          {
            $project: {
              mechanic: '$_id.name',
              avgScore: { $round: ['$avgScore', 1] },
              totalGames: 1,
              _id: 0
            }
          },
          { $sort: { totalGames: -1 } }
        ],
        overallStats: [
          {
            $group: {
              _id: null,
              avgScore: { $avg: '$score' },
              totalGames: { $sum: 1 },
              avgResponseTime: { $avg: '$metrics.averageResponseTime' }
            }
          }
        ],
        // Métricas específicas de la mecánica Secuencia. Se agregan los
        // campos persistidos por GameEngine.endPlay (T-921 fase E):
        // sequencesCompleted, maxSequenceLengthAchieved, partialReproductions,
        // averageReproductionTimeMs, hintsUsed, blockedCardsTotal.
        sequenceStats: [
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
              from: 'game_mechanics',
              localField: 'session.mechanicId',
              foreignField: '_id',
              as: 'mechanic'
            }
          },
          { $unwind: { path: '$mechanic', preserveNullAndEmptyArrays: true } },
          { $match: { 'mechanic.name': 'sequence' } },
          {
            $group: {
              _id: null,
              totalGames: { $sum: 1 },
              sequencesCompleted: { $sum: { $ifNull: ['$metrics.sequencesCompleted', 0] } },
              sequencesBlocked: { $sum: { $ifNull: ['$metrics.sequencesBlocked', 0] } },
              sequencesTimedOut: { $sum: { $ifNull: ['$metrics.sequencesTimedOut', 0] } },
              maxSequenceLengthAchieved: {
                $max: { $ifNull: ['$metrics.maxSequenceLengthAchieved', 0] }
              },
              partialReproductions: { $sum: { $ifNull: ['$metrics.partialReproductions', 0] } },
              avgReproductionTimeMs: {
                $avg: { $ifNull: ['$metrics.averageReproductionTimeMs', 0] }
              },
              blockedCardsTotal: { $sum: { $ifNull: ['$metrics.blockedCardsTotal', 0] } },
              hintsUsed: { $sum: { $ifNull: ['$metrics.hintsUsed', 0] } }
            }
          },
          {
            $project: {
              _id: 0,
              totalGames: 1,
              sequencesCompleted: 1,
              sequencesBlocked: 1,
              sequencesTimedOut: 1,
              maxSequenceLengthAchieved: 1,
              partialReproductions: 1,
              averageReproductionTimeMs: { $round: ['$avgReproductionTimeMs', 0] },
              blockedCardsTotal: 1,
              hintsUsed: 1
            }
          }
        ]
      }
    }
  ];

  const [result] = await gamePlayRepository.aggregate(pipeline);
  const overall = result.overallStats[0] || {};
  const sequenceSummary = result.sequenceStats?.[0] || null;

  // Datos del estudiante
  const student = await userRepository.findById(studentId, {
    select: 'name profile studentMetrics createdBy'
  });

  // Comparativa con la clase
  let classAvgScore = 0;
  if (student?.createdBy) {
    const [classStats] = await userRepository.aggregate([
      {
        $match: {
          createdBy: student.createdBy,
          role: 'student',
          status: 'active',
          'studentMetrics.totalGamesPlayed': { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          classAvgScore: { $avg: '$studentMetrics.averageScore' }
        }
      }
    ]);
    classAvgScore = classStats?.classAvgScore || 0;
  }

  return {
    student: student
      ? {
          id: student._id.toString(),
          pseudoId: pseudonymize(student._id),
          name: student.name,
          avatar: student.profile?.avatar || null,
          classroom: student.profile?.classroom || null,
          studentMetrics: student.studentMetrics || {}
        }
      : null,
    lastGames: result.lastGames,
    performanceByContext: result.byContext,
    performanceByMechanic: result.byMechanic,
    overallStats: {
      avgScore: Math.round((overall.avgScore || 0) * 10) / 10,
      totalGames: overall.totalGames || 0,
      avgResponseTime: Math.round(overall.avgResponseTime || 0)
    },
    classComparison: {
      studentAvgScore: student?.studentMetrics?.averageScore || 0,
      classAvgScore: Math.round(classAvgScore * 10) / 10,
      difference:
        Math.round(((student?.studentMetrics?.averageScore || 0) - classAvgScore) * 10) / 10
    },
    // Resumen de la mecánica Secuencia (T-921). null si el alumno no ha
    // jugado ninguna partida de Secuencia en el rango temporal.
    bySequence: sequenceSummary
      ? {
          totalGames: sequenceSummary.totalGames || 0,
          sequencesCompleted: sequenceSummary.sequencesCompleted || 0,
          sequencesBlocked: sequenceSummary.sequencesBlocked || 0,
          sequencesTimedOut: sequenceSummary.sequencesTimedOut || 0,
          maxSequenceLengthAchieved: sequenceSummary.maxSequenceLengthAchieved || 0,
          partialReproductions: sequenceSummary.partialReproductions || 0,
          averageReproductionTimeMs: sequenceSummary.averageReproductionTimeMs || 0,
          blockedCardsTotal: sequenceSummary.blockedCardsTotal || 0,
          hintsUsed: sequenceSummary.hintsUsed || 0
        }
      : null,
    timeRange
  };
}

/**
 * Mapa de calor de actividad (partidas por día de la semana y hora).
 *
 * @param {string} teacherId - ID del profesor
 * @param {string} [timeRange='30d'] - Rango temporal
 * @returns {Promise<Object>} Datos del heatmap
 */
async function getClassroomHeatmap(teacherId, timeRange = '30d') {
  const { currentStart, now } = getDateRange(timeRange);
  const teacherOid = new mongoose.Types.ObjectId(teacherId);

  // Excluir estudiantes sin consentimiento de analytics (Art. 21 RGPD)
  const excludedIds = await getAnalyticsExcludedPlayerIds(teacherId);

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
        'session.createdBy': teacherOid,
        status: 'completed',
        completedAt: { $gte: currentStart, $lte: now },
        ...(excludedIds.length > 0 && { playerId: { $nin: excludedIds } })
      }
    },
    {
      $group: {
        _id: {
          dayOfWeek: { $dayOfWeek: '$completedAt' }, // 1=Domingo ... 7=Sábado
          hour: { $hour: '$completedAt' }
        },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        dayOfWeek: { $subtract: ['$_id.dayOfWeek', 1] }, // 0=Domingo ... 6=Sábado
        hour: '$_id.hour',
        count: 1,
        _id: 0
      }
    },
    { $sort: { dayOfWeek: 1, hour: 1 } }
  ];

  const data = await gamePlayRepository.aggregate(pipeline);
  return { heatmap: data, timeRange };
}

/**
 * Top contextos y mecánicas por rendimiento.
 *
 * @param {string} teacherId - ID del profesor
 * @param {string} [timeRange='30d'] - Rango temporal
 * @param {number} [limit=5] - Número de resultados por categoría
 * @returns {Promise<Object>} Rankings de contextos y mecánicas
 */
async function getTopContextsAndMechanics(teacherId, timeRange = '30d', limitParam = 5) {
  const limit = Number(limitParam) || 5;
  const { currentStart, now } = getDateRange(timeRange);
  const teacherOid = new mongoose.Types.ObjectId(teacherId);

  // Excluir estudiantes sin consentimiento de analytics (Art. 21 RGPD)
  const excludedIds = await getAnalyticsExcludedPlayerIds(teacherId);

  const basePipeline = [
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
        'session.createdBy': teacherOid,
        status: 'completed',
        completedAt: { $gte: currentStart, $lte: now },
        ...(excludedIds.length > 0 && { playerId: { $nin: excludedIds } })
      }
    }
  ];

  // Top contextos
  const contextPipeline = [
    ...basePipeline,
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
      $group: {
        _id: { id: '$context._id', name: '$context.name' },
        totalPlays: { $sum: 1 },
        avgScore: { $avg: '$score' },
        uniquePlayers: { $addToSet: '$playerId' }
      }
    },
    {
      $project: {
        name: '$_id.name',
        totalPlays: 1,
        avgScore: { $round: ['$avgScore', 1] },
        uniquePlayers: { $size: '$uniquePlayers' },
        _id: 0
      }
    },
    { $sort: { totalPlays: -1 } },
    { $limit: limit }
  ];

  // Top mecánicas
  const mechanicPipeline = [
    ...basePipeline,
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
      $group: {
        _id: { id: '$mechanic._id', name: '$mechanic.displayName' },
        totalPlays: { $sum: 1 },
        avgScore: { $avg: '$score' },
        uniquePlayers: { $addToSet: '$playerId' }
      }
    },
    {
      $project: {
        name: '$_id.name',
        totalPlays: 1,
        avgScore: { $round: ['$avgScore', 1] },
        uniquePlayers: { $size: '$uniquePlayers' },
        _id: 0
      }
    },
    { $sort: { totalPlays: -1 } },
    { $limit: limit }
  ];

  const [topContexts, topMechanics] = await Promise.all([
    gamePlayRepository.aggregate(contextPipeline),
    gamePlayRepository.aggregate(mechanicPipeline)
  ]);

  return { topContexts, topMechanics, timeRange };
}

module.exports = {
  getStudentProgress,
  getStudentDifficulties,
  getClassroomSummary,
  getClassroomComparison,
  getClassroomDifficulties,
  getClassroomStudents,
  getClassroomDistribution,
  getClassroomTrends,
  getStudentSummary,
  getClassroomHeatmap,
  getTopContextsAndMechanics
};
