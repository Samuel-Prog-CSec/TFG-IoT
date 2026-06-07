/**
 * @fileoverview Servicio de métricas de engagement.
 * Mide la participación, frecuencia, regularidad, tasa de completado,
 * replays voluntarios y patrones de juego.
 *
 * Ver Analytics_Design_Rationale.md § 2.3 para fundamentación pedagógica.
 *
 * @module services/analytics/engagementService
 */

const gamePlayRepository = require('../../repositories/gamePlayRepository');
const userRepository = require('../../repositories/userRepository');
const { toObjectId, getStartDate, enrichMetric } = require('./analyticsHelpers');
const { cacheGet } = require('../../utils/cacheHelper');

// Timeout más corto que `reportDataService.REPORT_TIMEOUT_MS` para que MongoDB
// aborte sub-agregaciones lentas antes de que `Promise.race` rechace; evita
// queries zombie quedándose en el pool tras un timeout HTTP.
const REPORT_AGGREGATE_TIMEOUT_MS = 7000;

// T-907 INT3: TTL 10 min para el cache de engagement individual. El sub-pipeline
// `abandonmentDetails` (2 $lookup anidados sobre GameSession y GameContext) es
// la parte más cara: ~300-800 ms en Atlas M0 cuando el alumno acumula 50+
// partidas. La invalidación llega automáticamente desde
// `GameEngine.endPlay → cacheInvalidateNamespace('cache:analytics')`, por lo
// que el dato del docente refresca tras cada partida terminada — aceptamos
// que entre fin de partida y dashboard del docente haya hasta ~200 ms de
// staleness real al regenerar.
const STUDENT_ENGAGEMENT_TTL_SECONDS = 600;

// Pesos del engagement score (ver Analytics_Design_Rationale.md)
const ENGAGEMENT_WEIGHTS = {
  playFrequency: 0.25,
  regularity: 0.25,
  completionRate: 0.3,
  timeBetweenSessions: 0.1,
  voluntaryReplays: 0.1
};

/**
 * Núcleo PURO del cálculo de engagement: a partir de los datos crudos mínimos
 * por jugador produce los 5 componentes normalizados (0-100) y el score
 * ponderado final.
 *
 * Se extrae para que `computeStudentEngagement` (N+1, una agregación por alumno)
 * y `computeStudentEngagementBatch` (1 agregación para todos) compartan EXACTAMENTE
 * la misma aritmética. Cualquier divergencia de score entre ambos caminos sería
 * un bug en cómo se alimentan los crudos, no en la fórmula — que vive aquí y solo
 * aquí. Mantener byte-idéntico el resultado es requisito de no-regresión del
 * detector `engagement_drop` (ver detectors/engagementDrop.js).
 *
 * @param {Object} raw
 * @param {Object<string,number>} raw.statusMap - Conteo de partidas por status
 *   ({ completed, abandoned, 'in-progress', paused }).
 * @param {number} raw.daysActive - Nº de días distintos con al menos una partida.
 * @param {Array<Date|string>} raw.completedDates - Fechas `completedAt` de las
 *   partidas completadas, ORDENADAS ascendentemente.
 * @param {number} raw.replayCount - Nº de sessionId con >1 partida del jugador.
 * @param {number} raw.days - Ventana en días (30 o 90).
 * @returns {{ components: Object, engagementScore: number }}
 */
function computeEngagementComponents({ statusMap, daysActive, completedDates, replayCount, days }) {
  const completed = statusMap.completed || 0;
  const abandoned = statusMap.abandoned || 0;
  const total = completed + abandoned + (statusMap['in-progress'] || 0) + (statusMap.paused || 0);

  const totalWeeks = Math.max(days / 7, 1);
  const gamesPerWeek = total / totalWeeks;

  // Tiempo medio entre sesiones completadas (días). Misma aritmética que el
  // bucle original sobre `completedDates`.
  let avgDaysBetween = 0;
  if (completedDates.length >= 2) {
    let totalDiffs = 0;
    for (let i = 1; i < completedDates.length; i++) {
      totalDiffs +=
        (new Date(completedDates[i]) - new Date(completedDates[i - 1])) / (1000 * 60 * 60 * 24);
    }
    avgDaysBetween = totalDiffs / (completedDates.length - 1);
  }

  // Normalizar componentes a 0-100
  const components = {
    playFrequency: {
      value: Math.round(gamesPerWeek * 10) / 10,
      unit: 'juegos/semana',
      score: Math.round(Math.min(gamesPerWeek / 5, 1) * 100)
    },
    regularity: {
      value: Math.round((daysActive / days) * 100) / 100,
      description: `${daysActive} de ${days} días activo`,
      score: Math.round((daysActive / Math.min(days, 30)) * 100)
    },
    completionRate: {
      value: total > 0 ? Math.round((completed / total) * 100 * 10) / 10 : 0,
      completed,
      total,
      score: total > 0 ? Math.round((completed / total) * 100) : 0
    },
    avgTimeBetweenSessions: {
      value: Math.round(avgDaysBetween * 10) / 10,
      unit: 'días',
      score: Math.round(Math.max(1 - avgDaysBetween / 7, 0) * 100)
    },
    voluntaryReplays: {
      value: replayCount,
      description: 'Sesiones jugadas múltiples veces',
      score: Math.round(Math.min(replayCount / 3, 1) * 100)
    }
  };

  // Calcular engagement score ponderado
  const engagementScore = Math.round(
    components.playFrequency.score * ENGAGEMENT_WEIGHTS.playFrequency +
      components.regularity.score * ENGAGEMENT_WEIGHTS.regularity +
      components.completionRate.score * ENGAGEMENT_WEIGHTS.completionRate +
      components.avgTimeBetweenSessions.score * ENGAGEMENT_WEIGHTS.timeBetweenSessions +
      components.voluntaryReplays.score * ENGAGEMENT_WEIGHTS.voluntaryReplays
  );

  return { components, engagementScore };
}

// ══════════════════════════════════════════════════════════════════════
// E09 — Engagement individual del estudiante
// ══════════════════════════════════════════════════════════════════════

/**
 * Calcula el engagement score y sus componentes para un estudiante.
 *
 * @param {string} studentId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @returns {Promise<Object>} { engagementScore, components, abandonmentAnalysis }
 */
async function getStudentEngagement(studentId, { timeRange = '30d' } = {}) {
  return cacheGet(
    'cache:analytics',
    `engagement:student:${studentId}:${timeRange}`,
    () => computeStudentEngagement(studentId, timeRange),
    STUDENT_ENGAGEMENT_TTL_SECONDS
  );
}

/**
 * Implementación no cacheada de `getStudentEngagement`. Extraída para que el
 * wrapper de cache sea independiente y un caller que necesite datos frescos
 * pueda llamarla directamente (no usado hoy pero deja la puerta abierta).
 *
 * @param {string} studentId
 * @param {string} timeRange
 * @returns {Promise<Object>}
 */
async function computeStudentEngagement(studentId, timeRange) {
  const startDate = getStartDate(timeRange);
  const days = timeRange === '90d' ? 90 : 30;

  const pipeline = [
    {
      $match: {
        playerId: toObjectId(studentId),
        startedAt: { $gte: startDate }
      }
    },
    {
      $facet: {
        statusCounts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        dailyActivity: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ],
        replays: [
          { $group: { _id: '$sessionId', count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $count: 'replayCount' }
        ],
        completedDates: [
          { $match: { status: 'completed' } },
          { $sort: { completedAt: 1 } },
          { $group: { _id: null, dates: { $push: '$completedAt' } } }
        ],
        abandonmentDetails: [
          { $match: { status: 'abandoned' } },
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
              _id: '$context.name',
              count: { $sum: 1 },
              avgRoundAbandoned: { $avg: '$currentRound' }
            }
          },
          { $sort: { count: -1 } }
        ]
      }
    }
  ];

  const [result] = await gamePlayRepository.aggregate(pipeline, {
    maxTimeMS: REPORT_AGGREGATE_TIMEOUT_MS
  });

  // Extraer datos
  const statusMap = {};
  for (const s of result.statusCounts) {
    statusMap[s._id] = s.count;
  }

  const completed = statusMap.completed || 0;
  const abandoned = statusMap.abandoned || 0;
  const total = completed + abandoned + (statusMap['in-progress'] || 0) + (statusMap.paused || 0);

  const daysActive = result.dailyActivity.length;
  const replayCount = result.replays[0]?.replayCount || 0;
  const completedDates = result.completedDates[0]?.dates || [];

  // Delegamos los 5 componentes + score al núcleo puro compartido con el batch.
  const { components, engagementScore } = computeEngagementComponents({
    statusMap,
    daysActive,
    completedDates,
    replayCount,
    days
  });

  // Análisis de abandono
  const abandonmentAnalysis = {
    abandonedGames: abandoned,
    abandonmentRate: total > 0 ? Math.round((abandoned / total) * 100 * 10) / 10 : 0,
    avgRoundWhenAbandoned: 0,
    commonAbandonmentContexts: result.abandonmentDetails.map(d => ({
      name: d._id || 'Sin contexto',
      count: d.count
    }))
  };

  if (result.abandonmentDetails.length > 0) {
    const totalAvgRound = result.abandonmentDetails.reduce(
      (sum, d) => sum + d.avgRoundAbandoned * d.count,
      0
    );
    const totalAbandoned = result.abandonmentDetails.reduce((sum, d) => sum + d.count, 0);
    abandonmentAnalysis.avgRoundWhenAbandoned =
      totalAbandoned > 0 ? Math.round((totalAvgRound / totalAbandoned) * 10) / 10 : 0;
  }

  // Enriquecer con RAG e interpretación (framework BI)
  const engagementEnriched = enrichMetric('engagementScore', engagementScore);
  const completionEnriched = enrichMetric('completionRate', components.completionRate.value);
  const abandonmentEnriched = enrichMetric('abandonmentRate', abandonmentAnalysis.abandonmentRate);

  return {
    engagementScore,
    rag: engagementEnriched.rag,
    interpretation: engagementEnriched.interpretation,
    components,
    abandonmentAnalysis: {
      ...abandonmentAnalysis,
      rag: abandonmentEnriched.rag,
      interpretation: abandonmentEnriched.interpretation
    },
    completionRag: completionEnriched.rag
  };
}

/**
 * Calcula el `engagementScore` de VARIOS estudiantes para una ventana en UNA
 * sola agregación agrupada por `$playerId`.
 *
 * Motivación (perf): el detector `engagement_drop` necesitaba el score de cada
 * alumno para 30d y 90d. Hacerlo vía `getStudentEngagement` suponía N×2
 * agregaciones con `$facet` + doble `$lookup` (la de 90d nunca está en caché).
 * Este batch reduce cada ventana a 1 agregación.
 *
 * Correctitud (byte-idéntico): el score devuelto es EXACTAMENTE el de
 * `computeStudentEngagement` para el mismo alumno/ventana. Se garantiza por
 * construcción: la agregación trae los MISMOS crudos que el `$facet` individual
 * (conteo por status, días activos distintos, sessionIds para replays y fechas
 * de completado) y el cómputo de los 5 componentes ponderados se delega al
 * mismo núcleo puro `computeEngagementComponents`. No se reutiliza
 * `getClassroomEngagement` a propósito: usa una fórmula simplificada de 3
 * componentes y daría scores distintos.
 *
 * Deliberadamente NO calcula `abandonmentDetails` (el sub-pipeline caro con los
 * 2 `$lookup`): el detector solo consume `engagementScore`, no el análisis de
 * abandono. Omitirlo es la mayor parte del ahorro.
 *
 * @param {Array<string|import('mongoose').Types.ObjectId>} studentIds
 * @param {string} timeRange - '30d' o '90d' (otros valores → ventana de 30d,
 *   igual que `getStartDate`/`computeStudentEngagement`).
 * @returns {Promise<Map<string, number>>} Map studentId(string) → engagementScore.
 *   El Map contiene SIEMPRE todos los `studentIds` solicitados: los alumnos sin
 *   partidas en la ventana reciben el mismo score que produce el cómputo
 *   individual con dataset vacío (componente "tiempo entre sesiones" = 100 ×
 *   0.10 → 10), garantizando byte-identidad también en ese borde.
 */
async function computeStudentEngagementBatch(studentIds, timeRange) {
  const scores = new Map();
  if (!studentIds?.length) {
    return scores;
  }

  const startDate = getStartDate(timeRange);
  const days = timeRange === '90d' ? 90 : 30;
  const playerIds = studentIds.map(toObjectId);

  // Baseline para alumnos sin partidas: idéntico a `computeStudentEngagement`
  // cuando el `$facet` devuelve arrays vacíos (el doc del facet existe siempre).
  // Se calcula una vez y se siembra para cada alumno; los que tengan partidas
  // sobrescriben este valor más abajo.
  const { engagementScore: emptyScore } = computeEngagementComponents({
    statusMap: {},
    daysActive: 0,
    completedDates: [],
    replayCount: 0,
    days
  });
  for (const id of studentIds) {
    scores.set(String(id), emptyScore);
  }

  // Una sola agregación: agrupa por jugador y acumula los crudos mínimos.
  // No usamos $facet ni $lookup — solo $group sobre `gameplays`.
  const pipeline = [
    {
      $match: {
        playerId: { $in: playerIds },
        startedAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$playerId',
        // Conteo por status: empujamos el status crudo y lo contamos en JS,
        // replicando el `$group { _id: '$status' }` del facet individual sin
        // perder ningún valor de status posible.
        statuses: { $push: '$status' },
        // Días activos distintos (= longitud de dailyActivity en el original).
        activeDays: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } } },
        // Todos los sessionId del jugador: replayCount se deriva contando los
        // que aparecen >1 vez (idéntico a replays→match count>1→count).
        sessionIds: { $push: '$sessionId' },
        // Fechas de completado (solo partidas completed) para avgDaysBetween.
        completedDates: {
          $push: {
            $cond: [{ $eq: ['$status', 'completed'] }, '$completedAt', '$$REMOVE']
          }
        }
      }
    }
  ];

  const results = await gamePlayRepository.aggregate(pipeline, {
    maxTimeMS: REPORT_AGGREGATE_TIMEOUT_MS
  });

  for (const r of results) {
    // statusMap idéntico al del cómputo individual.
    const statusMap = {};
    for (const status of r.statuses) {
      statusMap[status] = (statusMap[status] || 0) + 1;
    }

    // replayCount: nº de sessionId con más de una partida.
    const sessionCounts = new Map();
    for (const sid of r.sessionIds) {
      const key = String(sid);
      sessionCounts.set(key, (sessionCounts.get(key) || 0) + 1);
    }
    let replayCount = 0;
    for (const count of sessionCounts.values()) {
      if (count > 1) {
        replayCount += 1;
      }
    }

    // completedDates ordenadas ascendentemente (el facet ordenaba por
    // completedAt en el pipeline; aquí ordenamos en JS para igualar exacto).
    const completedDates = (r.completedDates || [])
      .slice()
      .sort((a, b) => new Date(a) - new Date(b));

    const { engagementScore } = computeEngagementComponents({
      statusMap,
      daysActive: r.activeDays.length,
      completedDates,
      replayCount,
      days
    });

    scores.set(String(r._id), engagementScore);
  }

  return scores;
}

// ══════════════════════════════════════════════════════════════════════
// E10 — Engagement agregado de clase
// ══════════════════════════════════════════════════════════════════════

/**
 * Calcula engagement agregado de toda la clase.
 *
 * @param {string} teacherId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @param {string} [options.sort='engagementScore']
 * @param {string} [options.order='desc']
 * @returns {Promise<Object>}
 */
async function getClassroomEngagement(
  teacherId,
  { timeRange = '30d', sort = 'engagementScore', order = 'desc' } = {}
) {
  const startDate = getStartDate(timeRange);

  // Obtener estudiantes
  const students = await userRepository.find(
    { createdBy: toObjectId(teacherId), role: 'student', status: 'active' },
    { select: 'name' }
  );

  if (students.length === 0) {
    return {
      classEngagementScore: 0,
      classCompletionRate: 0,
      students: [],
      abandonmentRate: 0
    };
  }

  const studentIds = students.map(s => toObjectId(s._id));

  // Pipeline de engagement por estudiante
  const pipeline = [
    {
      $match: {
        playerId: { $in: studentIds },
        startedAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$playerId',
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        abandoned: { $sum: { $cond: [{ $eq: ['$status', 'abandoned'] }, 1, 0] } },
        daysActive: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } } },
        sessions: { $addToSet: '$sessionId' }
      }
    }
  ];

  const results = await gamePlayRepository.aggregate(pipeline, {
    maxTimeMS: REPORT_AGGREGATE_TIMEOUT_MS
  });
  const studentMap = new Map(students.map(s => [s._id.toString(), s.name]));
  const days = timeRange === '90d' ? 90 : 30;

  let totalEngagement = 0;
  let totalCompleted = 0;
  let totalGames = 0;
  let totalAbandoned = 0;

  const studentResults = results.map(r => {
    const sid = r._id.toString();
    const completionRate = r.total > 0 ? (r.completed / r.total) * 100 : 0;
    const gamesPerWeek = r.total / Math.max(days / 7, 1);
    const regularityScore = Math.round((r.daysActive.length / Math.min(days, 30)) * 100);

    // Engagement simplificado para la vista de clase
    const engagement = Math.round(
      Math.min(gamesPerWeek / 5, 1) * 100 * ENGAGEMENT_WEIGHTS.playFrequency +
        regularityScore * ENGAGEMENT_WEIGHTS.regularity +
        completionRate * ENGAGEMENT_WEIGHTS.completionRate
    );

    totalEngagement += engagement;
    totalCompleted += r.completed;
    totalGames += r.total;
    totalAbandoned += r.abandoned;

    return {
      studentId: sid,
      name: studentMap.get(sid) || 'Desconocido',
      engagementScore: engagement,
      completionRate: Math.round(completionRate * 10) / 10,
      playFrequency: Math.round(gamesPerWeek * 10) / 10,
      gamesPlayed: r.total
    };
  });

  // Ordenar
  const sortField = sort;
  const multiplier = order === 'asc' ? 1 : -1;
  studentResults.sort((a, b) => (a[sortField] - b[sortField]) * multiplier);

  return {
    classEngagementScore:
      studentResults.length > 0 ? Math.round(totalEngagement / studentResults.length) : 0,
    classCompletionRate:
      totalGames > 0 ? Math.round((totalCompleted / totalGames) * 100 * 10) / 10 : 0,
    students: studentResults,
    abandonmentRate: totalGames > 0 ? Math.round((totalAbandoned / totalGames) * 100 * 10) / 10 : 0
  };
}

// ══════════════════════════════════════════════════════════════════════
// E11 — Patrones de juego del estudiante
// ══════════════════════════════════════════════════════════════════════

/**
 * Obtiene patrones de juego de un estudiante: horarios, timeline, etc.
 *
 * @param {string} studentId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @returns {Promise<Object>}
 */
async function getStudentPlayPatterns(studentId, { timeRange = '30d' } = {}) {
  const startDate = getStartDate(timeRange);

  const pipeline = [
    {
      $match: {
        playerId: toObjectId(studentId),
        startedAt: { $gte: startDate }
      }
    },
    {
      $facet: {
        statusCounts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        hourDistribution: [
          {
            $group: {
              _id: { $hour: '$startedAt' },
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ],
        dayDistribution: [
          {
            $group: {
              _id: { $dayOfWeek: '$startedAt' },
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ],
        dailyTimeline: [
          { $match: { status: 'completed' } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
              gamesPlayed: { $sum: 1 },
              avgScore: { $avg: '$score' }
            }
          },
          { $sort: { _id: 1 } }
        ],
        lastGame: [{ $sort: { startedAt: -1 } }, { $limit: 1 }, { $project: { startedAt: 1 } }]
      }
    }
  ];

  const [result] = await gamePlayRepository.aggregate(pipeline);

  const statusMap = {};
  for (const s of result.statusCounts) {
    statusMap[s._id] = s.count;
  }

  const now = new Date();
  const lastPlayedAt = result.lastGame[0]?.startedAt;
  const daysSinceLastPlay = lastPlayedAt
    ? Math.floor((now - new Date(lastPlayedAt)) / (1000 * 60 * 60 * 24))
    : null;

  return {
    totalGames:
      (statusMap.completed || 0) +
      (statusMap.abandoned || 0) +
      (statusMap['in-progress'] || 0) +
      (statusMap.paused || 0),
    completedGames: statusMap.completed || 0,
    abandonedGames: statusMap.abandoned || 0,
    daysSinceLastPlay,
    favoriteHour: result.hourDistribution[0]?._id ?? null,
    favoriteDayOfWeek: result.dayDistribution[0]?._id ?? null,
    sessionsTimeline: result.dailyTimeline.map(d => ({
      date: d._id,
      gamesPlayed: d.gamesPlayed,
      avgScore: Math.round(d.avgScore * 10) / 10
    }))
  };
}

module.exports = {
  getStudentEngagement,
  getClassroomEngagement,
  getStudentPlayPatterns,
  computeStudentEngagementBatch,
  // Exportados para tests de igualdad/regresión (acceso a la versión no cacheada).
  computeStudentEngagement,
  computeEngagementComponents
};
