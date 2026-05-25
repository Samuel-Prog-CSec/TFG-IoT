/**
 * @fileoverview Servicio para análisis de datos y estadísticas de juego.
 * Encapsula la lógica de agregación de MongoDB para transformar datos crudos en insights.
 */

const mongoose = require('mongoose');
const Sentry = require('@sentry/node');
const gamePlayRepository = require('../repositories/gamePlayRepository');
const gameSessionRepository = require('../repositories/gameSessionRepository');

/**
 * Timeout aplicado a las agregaciones más pesadas del flujo de informes
 * (`reportDataService.getClassroomReport` / `getStudentReport`). Marca el
 * límite que protege el pool de Mongoose si una sub-agregación se cuelga:
 * sin esto, el race en `Promise.race` rechazaba la promesa pero la query
 * seguía corriendo zombie hasta los 15 s del default. Mantenemos margen de
 * 1 s sobre `REPORT_TIMEOUT_MS=8000` para que MongoDB aborte antes que
 * `Promise.race` y el caller reciba el error real con `codeName`.
 */
const REPORT_AGGREGATE_TIMEOUT_MS = 7000;

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
  // T-904 Fase A: span manual sobre el agregado completo (lookup+facet pueden
  // ser caros en datasets grandes; visibilidad de p95 imprescindible para
  // detectar regresiones de Mongo Atlas M0).
  return Sentry.startSpan(
    {
      name: 'analytics.classroomSummary',
      op: 'analytics',
      attributes: {
        'teacher.id': teacherId?.toString()
      }
    },
    () => _getClassroomSummaryImpl(teacherId)
  );
}

async function _getClassroomSummaryImpl(teacherId) {
  // Excluir estudiantes sin consentimiento de analytics (Art. 21 RGPD)
  const [excludedIds, teacherSessionIds] = await Promise.all([
    getAnalyticsExcludedPlayerIds(teacherId),
    // A.3 (pre-v1.0.0): prefiltrar sessionIds del profesor para hacer
    // `$match` ANTES de `$lookup` — reduce 50× el escaneo en GamePlay.
    getTeacherSessionIds(teacherId)
  ]);
  const teacherOid = new mongoose.Types.ObjectId(teacherId);

  const pipeline = [
    {
      $match: {
        sessionId: { $in: teacherSessionIds },
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
    gamePlayRepository.aggregate(pipeline, { maxTimeMS: REPORT_AGGREGATE_TIMEOUT_MS }),
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
  // A.3 (pre-v1.0.0): prefiltrar sessionIds — sin el `$lookup game_sessions`
  // posterior (los campos de session no se usan en este pipeline).
  const [excludedIds, teacherSessionIds] = await Promise.all([
    getAnalyticsExcludedPlayerIds(teacherId),
    getTeacherSessionIds(teacherId)
  ]);

  const pipeline = [
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
  // A.3: prefiltrar sessionIds del profesor para hacer `$match` early.
  const [excludedIds, teacherSessionIds] = await Promise.all([
    getAnalyticsExcludedPlayerIds(teacherId),
    getTeacherSessionIds(teacherId)
  ]);

  const pipeline = [
    {
      $match: {
        sessionId: { $in: teacherSessionIds },
        status: 'completed',
        ...(excludedIds.length > 0 && { playerId: { $nin: excludedIds } })
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
    // A.2: descartar campos pesados de session (cardMappings[], boardLayout[],
    // sequencePlan[], config{}) — el pipeline solo necesita contextId+mechanicId.
    SESSION_LOOKUP_PROJECTION,
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
      $project: {
        metrics: 1,
        ...CONTEXT_LOOKUP_PROJECTION_FIELDS,
        'session.mechanicId': 1
      }
    },
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
      $project: {
        metrics: 1,
        ...CONTEXT_LOOKUP_PROJECTION_FIELDS,
        ...MECHANIC_LOOKUP_PROJECTION_FIELDS
      }
    },
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
// T-931 (pre-v1.0.0): materialización Redis para fast-path en
// getTopContextsAndMechanics + getClassroomStudents.
const materializedAnalytics = require('./analytics/materializedAnalyticsService');

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
  // Mismo motivo que `getTeacherSessionIds`: el cache JSON convierte los
  // ObjectId en string en un cache HIT. Como estos ids alimentan un
  // `$nin: excludedIds` contra `playerId` (ObjectId), si devolviéramos los
  // strings el `$nin` no casaría con NINGÚN playerId y la exclusión por
  // consentimiento dejaría de aplicarse en cache HIT — fuga RGPD (Art. 21):
  // las partidas de alumnos sin consentimiento de analytics se colarían en
  // las aggregaciones. Cacheamos como string y devolvemos siempre ObjectId.
  const ids = await cacheGet(
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
      return excluded.map(s => s._id.toString());
    },
    60
  ); // TTL 60s — los cambios de consentimiento son infrecuentes
  return ids.map(id => new mongoose.Types.ObjectId(id));
}

// ══════════════════════════════════════════════════════════════════════
// A.2 + A.3 (pre-v1.0.0) — patrón "proyección post-lookup" + "$match early"
// ══════════════════════════════════════════════════════════════════════
//
// Las aggregations sobre GamePlay con `$lookup game_sessions` traían el
// documento completo de session, incluyendo `cardMappings[30]`,
// `boardLayout[30]`, `sequencePlan[]` y `config{}` — campos que ninguna de
// las analytics consume realmente. Bytes egress Atlas inflados hasta 80%.
//
// Patrón unificado:
//   1) Prefiltrar `sessionIds` del profesor con un helper cacheable
//      (`getTeacherSessionIds`) y hacer `$match { sessionId: { $in: [...] } }`
//      ANTES del `$lookup` para reducir el set de docs a procesar.
//   2) Tras cada `$lookup` insertar un `$project` que solo retenga los
//      campos consumidos por el resto de stages.
//
// Si el helper devuelve cache miss el coste extra es 1 query Mongo barata
// (lista de _id sobre índice `{createdBy:1}` de GameSession) que se cachea
// 300s y se invalida al crear/archivar sesión.

/**
 * A.2 — Proyección reusable post-`$lookup game_sessions`. Solo se mantienen
 * los campos consumidos por las aggregations downstream.
 * @readonly
 */
const SESSION_LOOKUP_PROJECTION = {
  $project: {
    _id: 1,
    sessionId: 1,
    playerId: 1,
    score: 1,
    maxScore: 1,
    status: 1,
    completedAt: 1,
    startedAt: 1,
    metrics: 1,
    'session._id': 1,
    'session.createdBy': 1,
    'session.contextId': 1,
    'session.mechanicId': 1,
    'session.status': 1,
    'session.archivedAt': 1
  }
};

/**
 * A.2 — Proyección reusable post-`$lookup game_contexts`.
 * @readonly
 */
const CONTEXT_LOOKUP_PROJECTION_FIELDS = {
  'context._id': 1,
  'context.name': 1,
  'context.displayName': 1
};

/**
 * A.2 — Proyección reusable post-`$lookup game_mechanics`.
 * @readonly
 */
const MECHANIC_LOOKUP_PROJECTION_FIELDS = {
  'mechanic._id': 1,
  'mechanic.name': 1,
  'mechanic.displayName': 1
};

/**
 * A.3 (pre-v1.0.0): obtiene la lista de `_id` de sesiones del profesor,
 * filtrable opcionalmente por estado. Cacheable 300s en `cache:analytics`
 * para evitar re-query en cada aggregation del dashboard. Se invalida desde
 * `gameSessionService` al crear/archivar/eliminar sesiones.
 *
 * El uso correcto es: insertar `$match { sessionId: { $in: ids } }` como
 * PRIMERA etapa del pipeline ANTES del `$lookup game_sessions`, reduciendo
 * dramáticamente el set de docs procesados (típicamente 50× menos).
 *
 * @param {string} teacherId
 * @param {Object} [options]
 * @param {string|string[]} [options.status] - Filtro opcional por status.
 * @returns {Promise<Array<import('mongoose').Types.ObjectId>>}
 */
async function getTeacherSessionIds(teacherId, options = {}) {
  const statusKey = Array.isArray(options.status)
    ? options.status.slice().sort().join(',')
    : options.status || 'all';
  // El cache serializa a JSON: los ObjectId se guardan como string y en un
  // cache HIT vuelven como string. Si devolviéramos esos strings, el
  // `$in: teacherSessionIds` de los pipelines NO casa contra el campo
  // `sessionId` (ObjectId) y la aggregation devuelve 0 — bug intermitente que
  // vaciaba Tendencia / Mapa de calor / Actividad del dashboard según qué
  // endpoint ganaba la carrera por el cache miss (QA 2026-05-25). Cacheamos
  // como string (representación estable entre miss y hit) y SIEMPRE devolvemos
  // ObjectId al consumidor.
  const ids = await cacheGet(
    'cache:analytics',
    `teacherSessions:${teacherId}:${statusKey}`,
    async () => {
      const query = {
        createdBy: new mongoose.Types.ObjectId(teacherId)
      };
      if (options.status) {
        query.status = Array.isArray(options.status) ? { $in: options.status } : options.status;
      }
      const sessions = await gameSessionRepository.find(query, { select: '_id' });
      return sessions.map(s => s._id.toString());
    },
    300
  ); // TTL 300s con jitter (B.2) — equilibra frescura tras crear sesión vs hit-rate
  return ids.map(id => new mongoose.Types.ObjectId(id));
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
 * Calcula tiers de rendimiento desglosados por mecánica para una lista de
 * alumnos (ADR-E). Devuelve un Map<studentId, Record<mechanicName, {…}>>.
 *
 * Lógica: agrupa los `GamePlay` completados por (playerId, mechanicName)
 * y promedia el porcentaje `score / maxScore × 100` (mismo % que se usa
 * en `studentMetrics.averageScore`). Pasa cada promedio por
 * `classifyTier` para devolver la etiqueta semántica.
 *
 * @param {Array<string|ObjectId>} studentIds
 * @returns {Promise<Map<string, Record<string, {averageScore:number, tier:string, gamesPlayed:number}>>>}
 * @private
 */
async function getStudentsTiersByMechanic(studentIds = []) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return new Map();
  }

  const objectIds = studentIds
    .map(id => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (objectIds.length === 0) {
    return new Map();
  }

  const pipeline = [
    {
      $match: {
        playerId: { $in: objectIds },
        status: 'completed'
      }
    },
    {
      // Las collections del proyecto usan snake_case explícito en
      // GameSession.collection ('game_sessions') y GameMechanic.collection
      // ('game_mechanics') — el plural automático de Mongoose
      // ('gamesessions') NO aplica. Sin esto el lookup devolvía vacío y
      // el mapa tiersByMechanic quedaba como {} para todos los alumnos.
      $lookup: {
        from: 'game_sessions',
        localField: 'sessionId',
        foreignField: '_id',
        as: 'session'
      }
    },
    { $unwind: '$session' },
    // A.1 (pre-v1.0.0): descartar campos pesados de session
    // (cardMappings[], boardLayout[], sequencePlan[]) antes del segundo
    // lookup. Reduce bytes inter-stage y CPU pipeline sin alterar output.
    {
      $project: {
        playerId: 1,
        score: 1,
        maxScore: 1,
        'session.mechanicId': 1
      }
    },
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
      $project: {
        playerId: 1,
        mechanicName: '$mechanic.name',
        accuracyPct: {
          $cond: [
            { $gt: ['$maxScore', 0] },
            { $multiply: [{ $divide: ['$score', '$maxScore'] }, 100] },
            0
          ]
        }
      }
    },
    {
      $group: {
        _id: { playerId: '$playerId', mechanicName: '$mechanicName' },
        averageScore: { $avg: '$accuracyPct' },
        gamesPlayed: { $sum: 1 }
      }
    }
  ];

  const rows = await gamePlayRepository.aggregate(pipeline);

  const byPlayer = new Map();
  for (const row of rows) {
    const playerId = row._id.playerId.toString();
    const mechanicName = row._id.mechanicName;
    if (!mechanicName) {
      continue;
    }
    if (!byPlayer.has(playerId)) {
      byPlayer.set(playerId, {});
    }
    const playerData = byPlayer.get(playerId);
    const averageScore = Number.isFinite(row.averageScore)
      ? Math.round(row.averageScore * 10) / 10
      : 0;
    playerData[mechanicName] = {
      averageScore,
      tier: classifyTier(averageScore),
      gamesPlayed: Number(row.gamesPlayed || 0)
    };
  }

  return byPlayer;
}

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

  // Calcular tiers por mecánica una sola vez (ADR-E). Una pipeline
  // agregada cuesta menos que N+1 lookups y permite que la UI muestre
  // chips "MEMORIA: bueno · ASOCIACIÓN: riesgo" en la tabla de alumnos
  // sin perder el tier global.
  const studentIds = students.map(s => s._id.toString());
  const tiersByMechanicMap = await getStudentsTiersByMechanic(studentIds);

  let mapped = students.map(student => {
    const metrics = student.studentMetrics || {};
    const accuracyRate = calcAccuracyRate(metrics.totalCorrectAnswers, metrics.totalErrors);
    const studentTier = classifyTier(metrics.averageScore);
    const tiersByMechanic = tiersByMechanicMap.get(student._id.toString()) || {};

    return {
      id: student._id.toString(),
      pseudoId: pseudonymize(student._id),
      name: student.name,
      avatar: student.profile?.avatar || null,
      classroom: student.profile?.classroom || null,
      age: student.profile?.age || null,
      status: student.status,
      tier: studentTier,
      // Map<mechanicName, {averageScore, tier, gamesPlayed}>. Las mecánicas
      // que el alumno no haya jugado simplemente no aparecen — el frontend
      // pinta "—" o las oculta. Permite descubrir alumno fuerte en
      // Memoria y débil en Secuencia con el mismo dataset.
      tiersByMechanic,
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
        lastPlayedAt: metrics.lastPlayedAt || null,
        // Métricas específicas de Secuencia (T-922 criterio 7 — columna
        // comparativa "Mejor Secuencia" en StudentsAnalytics). 0/null si
        // el alumno aún no ha jugado partidas de esta mecánica.
        maxSequenceLengthAchieved: metrics.maxSequenceLengthAchieved || 0,
        sequencesCompleted: metrics.sequencesCompleted || 0
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
  // A.3 (pre-v1.0.0): prefiltrar sessionIds del profesor — los facets no
  // necesitan campos de session, eliminamos el `$lookup` por completo.
  const [excludedIds, teacherSessionIds] = await Promise.all([
    getAnalyticsExcludedPlayerIds(teacherId),
    getTeacherSessionIds(teacherId)
  ]);

  // Pipeline para obtener stats de ambos períodos en un solo query
  const pipeline = [
    {
      $match: {
        sessionId: { $in: teacherSessionIds },
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

  const [result] = await gamePlayRepository.aggregate(pipeline, {
    maxTimeMS: REPORT_AGGREGATE_TIMEOUT_MS
  });

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
  // T-904 Fase A: span manual sobre el resumen del alumno (cyclomatic 46 según
  // T-907, beneficio alto de observabilidad de p95 para detectar consultas lentas).
  return Sentry.startSpan(
    {
      name: 'analytics.studentSummary',
      op: 'analytics',
      attributes: {
        'student.id': studentId?.toString(),
        'analytics.timeRange': timeRange
      }
    },
    () => _getStudentSummaryImpl(studentId, timeRange)
  );
}

async function _getStudentSummaryImpl(studentId, timeRange = '30d') {
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
          // A.2: proyección post-lookup para descartar cardMappings[],
          // boardLayout[], sequencePlan[], config{} antes del siguiente
          // $lookup. Reduce 80% bytes inter-stage.
          SESSION_LOOKUP_PROJECTION,
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
          SESSION_LOOKUP_PROJECTION,
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
          SESSION_LOOKUP_PROJECTION,
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
        // Métricas específicas de la mecánica Memoria (ADR-A/B, sesión
        // 04/05/2026). Agrega los campos persistidos por GameEngine.endPlay
        // dentro del sub-objeto `metrics.memory`. `null` si el alumno no
        // jugó Memoria en el rango temporal — el frontend muestra
        // `MemoryHighlightCard` solo cuando hay datos.
        memoryStats: [
          {
            $lookup: {
              from: 'game_sessions',
              localField: 'sessionId',
              foreignField: '_id',
              as: 'session'
            }
          },
          { $unwind: '$session' },
          SESSION_LOOKUP_PROJECTION,
          {
            $lookup: {
              from: 'game_mechanics',
              localField: 'session.mechanicId',
              foreignField: '_id',
              as: 'mechanic'
            }
          },
          { $unwind: { path: '$mechanic', preserveNullAndEmptyArrays: true } },
          { $match: { 'mechanic.name': 'memory' } },
          {
            $group: {
              _id: null,
              totalGames: { $sum: 1 },
              groupsMatched: { $sum: { $ifNull: ['$metrics.memory.groupsMatched', 0] } },
              peakStreak: { $max: { $ifNull: ['$metrics.memory.peakStreak', 0] } },
              averageMatchTimeMs: { $avg: { $ifNull: ['$metrics.memory.averageMatchTimeMs', 0] } },
              groupSize: { $max: { $ifNull: ['$metrics.memory.groupSize', 2] } }
            }
          },
          {
            $project: {
              _id: 0,
              totalGames: 1,
              groupsMatched: 1,
              peakStreak: 1,
              averageMatchTimeMs: { $round: ['$averageMatchTimeMs', 0] },
              groupSize: 1
            }
          }
        ],
        // Métricas específicas de la mecánica Asociación (ADR-A/B). El
        // map `byValueAccuracy` no se agrega aquí (sería complejo con
        // claves dinámicas); el frontend lo muestra a partir de la última
        // partida en `lastGames` cuando lo necesita.
        associationStats: [
          {
            $lookup: {
              from: 'game_sessions',
              localField: 'sessionId',
              foreignField: '_id',
              as: 'session'
            }
          },
          { $unwind: '$session' },
          SESSION_LOOKUP_PROJECTION,
          {
            $lookup: {
              from: 'game_mechanics',
              localField: 'session.mechanicId',
              foreignField: '_id',
              as: 'mechanic'
            }
          },
          { $unwind: { path: '$mechanic', preserveNullAndEmptyArrays: true } },
          { $match: { 'mechanic.name': 'association' } },
          {
            $group: {
              _id: null,
              totalGames: { $sum: 1 },
              peakStreak: { $max: { $ifNull: ['$metrics.association.peakStreak', 0] } },
              quickestCorrectMs: { $min: '$metrics.association.quickestCorrectMs' },
              slowestCorrectMs: { $max: '$metrics.association.slowestCorrectMs' }
            }
          },
          {
            $project: {
              _id: 0,
              totalGames: 1,
              peakStreak: 1,
              quickestCorrectMs: 1,
              slowestCorrectMs: 1
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
          SESSION_LOOKUP_PROJECTION,
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
  const memorySummary = result.memoryStats?.[0] || null;
  const associationSummary = result.associationStats?.[0] || null;
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
    // Resumen de la mecánica Memoria (ADR-A/B, sesión 04/05/2026). null
    // si el alumno no ha jugado Memoria en el rango temporal — el frontend
    // muestra `MemoryHighlightCard` sólo cuando este campo es truthy.
    byMemory: memorySummary
      ? {
          totalGames: memorySummary.totalGames || 0,
          groupsMatched: memorySummary.groupsMatched || 0,
          peakStreak: memorySummary.peakStreak || 0,
          averageMatchTimeMs: memorySummary.averageMatchTimeMs || 0,
          groupSize: memorySummary.groupSize || 2
        }
      : null,
    // Resumen de la mecánica Asociación (ADR-A/B). El frontend usa
    // `peakStreak` y los tiempos como cabecera de `AssociationHighlightCard`.
    byAssociation: associationSummary
      ? {
          totalGames: associationSummary.totalGames || 0,
          peakStreak: associationSummary.peakStreak || 0,
          quickestCorrectMs: associationSummary.quickestCorrectMs ?? null,
          slowestCorrectMs: associationSummary.slowestCorrectMs ?? null
        }
      : null,
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

  // Excluir estudiantes sin consentimiento de analytics (Art. 21 RGPD)
  // A.3 (pre-v1.0.0): prefiltrar sessionIds del profesor — el heatmap no
  // necesita campos de session, así que eliminamos el `$lookup` por
  // completo y el `$match` se hace directo sobre GamePlay.
  const [excludedIds, teacherSessionIds] = await Promise.all([
    getAnalyticsExcludedPlayerIds(teacherId),
    getTeacherSessionIds(teacherId)
  ]);

  const pipeline = [
    {
      $match: {
        sessionId: { $in: teacherSessionIds },
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

  // Excluir estudiantes sin consentimiento de analytics (Art. 21 RGPD)
  // A.3: prefiltrar sessionIds + $match ANTES de $lookup + A.2 proyección.
  const [excludedIds, teacherSessionIds] = await Promise.all([
    getAnalyticsExcludedPlayerIds(teacherId),
    getTeacherSessionIds(teacherId)
  ]);

  const basePipeline = [
    {
      $match: {
        sessionId: { $in: teacherSessionIds },
        status: 'completed',
        completedAt: { $gte: currentStart, $lte: now },
        ...(excludedIds.length > 0 && { playerId: { $nin: excludedIds } })
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
    // A.2: descartar cardMappings[], boardLayout[], sequencePlan[] antes
    // de los siguientes lookups context/mechanic.
    SESSION_LOOKUP_PROJECTION
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

  // T-931 (pre-v1.0.0): intentar la lectura desde el ZSET materializado
  // primero. Si está poblado, ZREVRANGE es O(log N + M) y batch-find por
  // _id resuelve los nombres en una sola query Mongo (no aggregation).
  // Si los ZSETs no existen (TTL expirado, primera ejecución tras
  // deploy), fallback a las aggregations Mongo originales — sin perder
  // funcionalidad mientras la reconciliación nocturna repuebla.
  const fastTopContexts = await readTopFromMaterialized({
    teacherId,
    timeRange,
    dimension: 'context',
    limit
  });
  const fastTopMechanics = await readTopFromMaterialized({
    teacherId,
    timeRange,
    dimension: 'mechanic',
    limit
  });

  const [topContexts, topMechanics] = await Promise.all([
    fastTopContexts || gamePlayRepository.aggregate(contextPipeline),
    fastTopMechanics || gamePlayRepository.aggregate(mechanicPipeline)
  ]);

  return { topContexts, topMechanics, timeRange };
}

/**
 * T-931 (pre-v1.0.0): lee el top de leaderboard ZSET y resuelve los
 * nombres de contexts/mechanics con un único `find({_id: { $in: ids } })`.
 * Devuelve `null` si el ZSET no existe (caller hace fallback Mongo).
 *
 * @param {Object} options
 * @returns {Promise<Array|null>}
 */
async function readTopFromMaterialized({ teacherId, timeRange, dimension, limit }) {
  // El timeRange del frontend es '7d' o '30d' (sin '24h'); los ZSETs
  // mantenidos por endPlay están en ['24h', '7d', '30d']. Si el rango no
  // está en ese set, miss → fallback Mongo.
  const supportedRange = ['24h', '7d', '30d'].includes(timeRange) ? timeRange : null;
  if (!supportedRange) {
    return null;
  }

  // Pedir el ranking ordenado por `plays` (más visualmente útil — coincide
  // con el `$sort: { totalPlays: -1 }` de la aggregation Mongo) y
  // resolver `score` como dato secundario para el `avgScore` del DTO.
  const entries = await materializedAnalytics.getTopFromLeaderboard(teacherId, {
    timeRange: supportedRange,
    dimension,
    metric: 'plays',
    limit
  });
  if (!entries || entries.length === 0) {
    return entries === null ? null : [];
  }

  // Resolver nombres en una sola query.
  const ids = entries.map(e => e.id).filter(Boolean);
  if (ids.length === 0) {
    return [];
  }
  const collection = dimension === 'context' ? 'game_contexts' : 'game_mechanics';
  const docs = await mongoose.connection
    .collection(collection)
    .find(
      { _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } },
      { projection: { name: 1, displayName: 1 } }
    )
    .toArray();

  const byId = new Map();
  for (const d of docs) {
    byId.set(d._id.toString(), dimension === 'context' ? d.name : d.displayName || d.name);
  }

  return entries.map(e => ({
    name: byId.get(e.id) || null,
    totalPlays: e.plays || 0,
    avgScore: e.plays > 0 ? Math.round((e.score / e.plays) * 10) / 10 : 0,
    // uniquePlayers no se materializa en ZSET (requeriría HyperLogLog). En
    // el fast path se omite — el frontend lo trata como 0 / opcional. El
    // fallback Mongo lo provee íntegro.
    uniquePlayers: 0
  }));
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
