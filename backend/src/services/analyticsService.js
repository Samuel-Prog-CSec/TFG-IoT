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
 * Expresión de agregación que normaliza la puntuación de una partida a un
 * PORCENTAJE real `score / maxScore × 100` (0 si maxScore es 0). Unifica la
 * representación de "rendimiento" entre mecánicas con techos de puntos muy
 * distintos (Asociación 50-90, Memoria 90, Secuencia 210-420): promediar el
 * `score` crudo entre mecánicas y mostrarlo como "%" era engañoso (un 60/60 de
 * Asociación = 100% aportaba 60, un 75/300 de Secuencia = 25% aportaba 75). El
 * `score` ya viene clampado a `maxScore`, así que el porcentaje queda en [0,100].
 * Se usa en TODOS los promedios de puntuación que la UI muestra como "%".
 */
const SCORE_PERCENT_EXPR = {
  $cond: [{ $gt: ['$maxScore', 0] }, { $multiply: [{ $divide: ['$score', '$maxScore'] }, 100] }, 0]
};

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
        score: { $avg: SCORE_PERCENT_EXPR },
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
    // Proyección post-lookup (paridad con getClassroomDifficulties): descarta
    // cardMappings[]/boardLayout[]/sequencePlan[]/config{} de la sesión antes de
    // los siguientes $lookup. Solo se usan session.contextId/mechanicId + metrics.
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
 * @param {Object} [filters] - Filtros opcionales del Dashboard (T-942 Fase E)
 * @param {string} [filters.contextId] - Limita a sesiones de este contexto
 * @param {string} [filters.mechanicId] - Limita a sesiones de esta mecánica
 * @param {string} [filters.timeRange] - '7d' | '30d' | '90d' (acota globalStats)
 * @returns {Promise<Object>} KPIs calculados
 */
async function getClassroomSummary(teacherId, { contextId, mechanicId, timeRange } = {}) {
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
    () => _getClassroomSummaryImpl(teacherId, { contextId, mechanicId, timeRange })
  );
}

async function _getClassroomSummaryImpl(teacherId, { contextId, mechanicId, timeRange } = {}) {
  const hasFilter = Boolean(contextId || mechanicId);

  // Excluir estudiantes sin consentimiento de analytics (Art. 21 RGPD)
  const [excludedIds, teacherSessionIds] = await Promise.all([
    getAnalyticsExcludedPlayerIds(teacherId),
    // A.3 (pre-v1.0.0): prefiltrar sessionIds del profesor para hacer
    // `$match` ANTES de `$lookup` — reduce 50× el escaneo en GamePlay.
    // T-942 Fase E: cuando hay filtro contexto/mecánica se restringe a las
    // sesiones que casan; sin filtro devuelve la misma lista cacheada que antes.
    resolveTeacherSessionIds(teacherId, { contextId, mechanicId })
  ]);
  const teacherOid = new mongoose.Types.ObjectId(teacherId);

  // T-942 Fase E: si llega timeRange acotamos globalStats con la misma fecha
  // de inicio que el resto de endpoints (`getDateRange`). Solo afecta a
  // globalStats (promedio/total del rango); `todayActivity` sigue siendo "hoy".
  const startDate = timeRange ? getDateRange(timeRange).currentStart : null;

  const pipeline = [
    {
      $match: {
        sessionId: { $in: teacherSessionIds },
        ...(excludedIds.length > 0 && { playerId: { $nin: excludedIds } })
      }
    },
    {
      $facet: {
        // Promedio global y total — SOLO partidas completadas (igual que el resto
        // de endpoints: trends/comparison/difficulties). Antes faltaba el filtro
        // `status:'completed'`, así que la media y el contador incluían
        // abandonadas/in-progress, arrastrando la media a la baja y descuadrando
        // con la tendencia (que sí filtra completadas).
        globalStats: [
          {
            $match: {
              status: 'completed',
              ...(startDate && { completedAt: { $gte: startDate } })
            }
          },
          {
            $group: {
              _id: null,
              avgScore: { $avg: SCORE_PERCENT_EXPR },
              totalGames: { $sum: 1 }
            }
          }
        ],
        // Tasa de completado real: completadas / (completadas + abandonadas) del
        // rango. `completedAt` está seteado tanto en completadas como en
        // abandonadas (recovery), así que el denominador son las partidas
        // TERMINADAS (excluye in-progress/paused). Antes la tarjeta usaba
        // `abandonmentRate` que el endpoint nunca devolvía → 100% fijo.
        completionStats: [
          {
            $match: {
              status: { $in: ['completed', 'abandoned'] },
              ...(startDate && { completedAt: { $gte: startDate } })
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
              }
            }
          }
        ],
        // Actividad de hoy — partidas COMPLETADAS hoy.
        todayActivity: [
          {
            $match: {
              status: 'completed',
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
  //
  // T-942 Fase E: cuando hay un filtro de contexto/mecánica activo, el
  // `studentMetrics.averageScore` (lifetime, global a todas las mecánicas) ya
  // no representa el riesgo dentro del subconjunto filtrado. Recalculamos el
  // riesgo desde las partidas FILTRADAS: media por alumno y conteo de los que
  // caen en [0, 50). La exclusión por consentimiento (Art. 21 RGPD) se respeta
  // igual vía `$nin: excludedIds`.
  const riskPromise = hasFilter
    ? _countStudentsInRiskFromPlays(teacherSessionIds, excludedIds)
    : userRepository.count({
        createdBy: teacherOid,
        role: 'student',
        status: 'active',
        ...ANALYTICS_CONSENT_FILTER,
        'studentMetrics.averageScore': { $gte: 0, $lt: 50 }
      });

  const [results, studentsInRisk] = await Promise.all([
    gamePlayRepository.aggregate(pipeline, { maxTimeMS: REPORT_AGGREGATE_TIMEOUT_MS }),
    riskPromise
  ]);

  const data = results[0];
  const completion = data.completionStats[0];
  // Tasa de completado real (null si no hay partidas terminadas → la tarjeta
  // muestra "—" en lugar de un 100% vacuo).
  const completionRate =
    completion && completion.total > 0
      ? Math.round((completion.completed / completion.total) * 100)
      : null;

  return {
    studentsInRisk,
    averageScore: data.globalStats[0] ? Math.round(data.globalStats[0].avgScore) : 0,
    totalGames: data.globalStats[0] ? data.globalStats[0].totalGames : 0,
    gamesToday: data.todayActivity[0] ? data.todayActivity[0].count : 0,
    completionRate,
    finishedGames: completion ? completion.total : 0
  };
}

/**
 * T-942 Fase E: cuenta alumnos "en riesgo" (media de score en [0, 50)) a
 * partir de las partidas completadas de un conjunto de sesiones — el camino
 * filtrado por contexto/mecánica del Dashboard. Agrupa por `playerId`,
 * promedia `score` y cuenta los grupos por debajo de 50. Respeta la exclusión
 * por consentimiento (Art. 21 RGPD).
 *
 * Solo se usa cuando hay un filtro activo; el camino sin filtro sigue leyendo
 * `studentMetrics.averageScore` (lifetime) como hasta ahora.
 *
 * @param {Array<import('mongoose').Types.ObjectId>} sessionIds
 * @param {Array<import('mongoose').Types.ObjectId>} excludedIds
 * @returns {Promise<number>}
 * @private
 */
async function _countStudentsInRiskFromPlays(sessionIds, excludedIds) {
  const pipeline = [
    {
      $match: {
        sessionId: { $in: sessionIds },
        status: 'completed',
        ...(excludedIds.length > 0 && { playerId: { $nin: excludedIds } })
      }
    },
    {
      $group: {
        _id: '$playerId',
        avgScore: { $avg: SCORE_PERCENT_EXPR }
      }
    },
    { $match: { avgScore: { $gte: 0, $lt: 50 } } },
    { $count: 'count' }
  ];

  const [result] = await gamePlayRepository.aggregate(pipeline, {
    maxTimeMS: REPORT_AGGREGATE_TIMEOUT_MS
  });
  return result?.count || 0;
}

/**
 * Compara el rendimiento del estudiante con la media general de la clase
 * para un periodo de tiempo.
 *
 * @param {string} teacherId - ID del profesor (para contexto de clase)
 * @param {string} [timeRange] - '7d' | '30d' | '90d'
 * @param {Object} [filters] - Filtros opcionales del Dashboard (QA 2026-05-30)
 * @param {string} [filters.contextId] - Limita a sesiones de este contexto
 * @param {string} [filters.mechanicId] - Limita a sesiones de esta mecánica
 */
async function getClassroomComparison(teacherId, timeRange = '7d', { contextId, mechanicId } = {}) {
  const today = new Date();
  const startDate = new Date(today);
  // QA 2026-05-30: soporte 90d (antes `=== '30d' ? 30 : 7` ignoraba 90d y lo
  // trataba como 7d). El selector del Dashboard ofrece "Trimestre actual" → 90d.
  let rangeDays = 7;
  if (timeRange === '90d') {
    rangeDays = 90;
  } else if (timeRange === '30d') {
    rangeDays = 30;
  }
  startDate.setDate(today.getDate() - rangeDays);

  // Excluir estudiantes sin consentimiento de analytics (Art. 21 RGPD)
  // A.3 (pre-v1.0.0): prefiltrar sessionIds — sin el `$lookup game_sessions`
  // posterior (los campos de session no se usan en este pipeline).
  // QA 2026-05-30: con filtro de contexto/mecánica se restringe a las sesiones
  // que casan (mismo patrón que summary/trends/distribution); sin filtro
  // devuelve la lista cacheada compartida, byte por byte igual que antes.
  const [excludedIds, teacherSessionIds] = await Promise.all([
    getAnalyticsExcludedPlayerIds(teacherId),
    resolveTeacherSessionIds(teacherId, { contextId, mechanicId })
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
        classAverage: { $avg: SCORE_PERCENT_EXPR },
        score: { $avg: SCORE_PERCENT_EXPR },
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
 * Proyección del shape de una partida en el historial del alumno (consumido por
 * `GameHistoryTable`): score crudo, fecha, accuracy 0-100 y los nombres de
 * contexto/mecánica. Compartido por la rama `lastGames` de `getStudentSummary`
 * (resumen, primeras N) y por `getStudentGames` (historial paginado completo)
 * para garantizar que ambos rinden EXACTAMENTE el mismo objeto.
 * @readonly
 */
const GAME_HISTORY_ITEM_PROJECTION = {
  $project: {
    score: 1,
    completedAt: 1,
    accuracy: {
      $cond: [
        { $gt: ['$metrics.totalAttempts', 0] },
        { $multiply: [{ $divide: ['$metrics.correctAttempts', '$metrics.totalAttempts'] }, 100] },
        0
      ]
    },
    context: '$context.name',
    mechanic: '$mechanic.displayName',
    _id: 0
  }
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
 * T-942 Fase E: resuelve los `_id` de sesiones del profesor honrando los
 * filtros opcionales de contexto/mecánica del Dashboard.
 *
 * Aísla el camino filtrado del default para garantizar regresión cero
 * (constraint crítico): cuando NO hay `contextId` NI `mechanicId`, delega en
 * `getTeacherSessionIds(teacherId)` — exactamente la misma lista cacheada que
 * usaban los pipelines hasta ahora, byte por byte. Solo cuando llega al menos
 * un filtro se hace una query directa a GameSession por
 * `{ createdBy, contextId?, mechanicId? }`, apoyada en los índices compuestos
 * `{createdBy:1, contextId:1}` / `{createdBy:1, mechanicId:1}`.
 *
 * Devuelve siempre ObjectId (no string): igual que `getTeacherSessionIds`, el
 * consumidor inserta el resultado en `$match { sessionId: { $in: ids } }` y un
 * string no casaría contra el campo `sessionId` (ObjectId) — ADR-183.
 *
 * @param {string} teacherId
 * @param {Object} [filters]
 * @param {string} [filters.contextId] - ObjectId del contexto (24 hex) opcional
 * @param {string} [filters.mechanicId] - ObjectId de la mecánica (24 hex) opcional
 * @returns {Promise<Array<import('mongoose').Types.ObjectId>>}
 * @private
 */
async function resolveTeacherSessionIds(teacherId, { contextId, mechanicId } = {}) {
  // Sin filtros → camino default intacto (lista cacheada compartida).
  if (!contextId && !mechanicId) {
    return getTeacherSessionIds(teacherId);
  }

  // Camino filtrado: query directa sin caché. La combinación
  // teacher×contexto×mecánica es de baja cardinalidad por petición y el
  // dashboard ya cachea el endpoint completo en `cache:analytics` con una
  // key que incluye los filtros, así que no merece su propia entrada.
  const query = {
    createdBy: new mongoose.Types.ObjectId(teacherId),
    ...(contextId && { contextId: new mongoose.Types.ObjectId(contextId) }),
    ...(mechanicId && { mechanicId: new mongoose.Types.ObjectId(mechanicId) })
  };
  const sessions = await gameSessionRepository.find(query, { select: '_id' });
  return sessions.map(s => s._id);
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
 * Devuelve el tier de rendimiento de un score con clasificación CONTIGUA (sin
 * huecos): el primer tier —de mayor a menor— cuyo `min` no supera el score.
 * Antes `score>=min && score<=max` dejaba huecos en los bordes fraccionarios
 * (49.5, 69.5, 89.5 no casaban ningún tier) → caían al fallback 'risk', de modo
 * que un alumno con 89.5% salía "En Riesgo" y desaparecía del histograma.
 * @private
 */
const tierForScore = score => {
  for (let i = PERFORMANCE_TIERS.length - 1; i >= 0; i -= 1) {
    if (score >= PERFORMANCE_TIERS[i].min) {
      return PERFORMANCE_TIERS[i];
    }
  }
  return PERFORMANCE_TIERS[0];
};

/**
 * Clasifica un score en un tier de rendimiento.
 * @private
 */
const classifyTier = score => {
  if (score === null || score === undefined || score < 0) {
    return 'risk';
  }
  return tierForScore(score).tier;
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
 * @param {Object} [filters] - Filtros opcionales del Dashboard (T-942 Fase E)
 * @param {string} [filters.contextId] - Limita a sesiones de este contexto
 * @param {string} [filters.mechanicId] - Limita a sesiones de esta mecánica
 * @param {string} [filters.timeRange] - '7d' | '30d' | '90d' (acota partidas)
 * @returns {Promise<Array>} Distribución con count y porcentaje por rango
 */
async function getClassroomDistribution(teacherId, { contextId, mechanicId, timeRange } = {}) {
  // T-942 Fase E: con filtro de contexto/mecánica activo, la distribución se
  // recalcula desde las partidas filtradas (media por alumno → tier). Sin
  // filtro mantiene EXACTAMENTE la implementación lifetime de studentMetrics.
  if (contextId || mechanicId) {
    return _getClassroomDistributionFromPlays(teacherId, { contextId, mechanicId, timeRange });
  }

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
      return tierForScore(score).tier === tier;
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
 * T-942 Fase E: recalcula la distribución en 4 tiers a partir de las partidas
 * de un conjunto filtrado de sesiones (contexto/mecánica). Agrupa por alumno,
 * promedia `score` y clasifica cada promedio en su tier. Respeta la exclusión
 * por consentimiento (Art. 21 RGPD) y la acotación temporal opcional.
 *
 * Devuelve el mismo shape `{ distribution, totalStudents }` que el camino sin
 * filtro, así que el frontend no distingue entre ambos.
 *
 * @param {string} teacherId
 * @param {Object} filters
 * @param {string} [filters.contextId]
 * @param {string} [filters.mechanicId]
 * @param {string} [filters.timeRange]
 * @returns {Promise<{distribution: Array, totalStudents: number}>}
 * @private
 */
async function _getClassroomDistributionFromPlays(
  teacherId,
  { contextId, mechanicId, timeRange } = {}
) {
  const [excludedIds, sessionIds] = await Promise.all([
    getAnalyticsExcludedPlayerIds(teacherId),
    resolveTeacherSessionIds(teacherId, { contextId, mechanicId })
  ]);

  const startDate = timeRange ? getDateRange(timeRange).currentStart : null;

  const pipeline = [
    {
      $match: {
        sessionId: { $in: sessionIds },
        status: 'completed',
        ...(startDate && { completedAt: { $gte: startDate } }),
        ...(excludedIds.length > 0 && { playerId: { $nin: excludedIds } })
      }
    },
    {
      $group: {
        _id: '$playerId',
        avgScore: { $avg: SCORE_PERCENT_EXPR }
      }
    }
  ];

  const perStudent = await gamePlayRepository.aggregate(pipeline, {
    maxTimeMS: REPORT_AGGREGATE_TIMEOUT_MS
  });

  const totalStudents = perStudent.length;
  const distribution = PERFORMANCE_TIERS.map(({ tier, label, min, max }) => {
    const count = perStudent.filter(s => {
      const score = s.avgScore ?? 0;
      return tierForScore(score).tier === tier;
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
  let days = 7;
  if (timeRange === '90d') {
    days = 90;
  } else if (timeRange === '30d') {
    days = 30;
  }
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
 * @param {Object} [filters] - Filtros opcionales del Dashboard (T-942 Fase E)
 * @param {string} [filters.contextId] - Limita a sesiones de este contexto
 * @param {string} [filters.mechanicId] - Limita a sesiones de esta mecánica
 * @returns {Promise<Object>} KPIs con valores actuales, anteriores y cambio porcentual
 */
async function getClassroomTrends(teacherId, timeRange = '7d', { contextId, mechanicId } = {}) {
  const { now, currentStart, previousStart } = getDateRange(timeRange);
  const teacherOid = new mongoose.Types.ObjectId(teacherId);

  // Excluir estudiantes sin consentimiento de analytics (Art. 21 RGPD)
  // A.3 (pre-v1.0.0): prefiltrar sessionIds del profesor — los facets no
  // necesitan campos de session, eliminamos el `$lookup` por completo.
  // T-942 Fase E: con filtro de contexto/mecánica se restringe a las sesiones
  // que casan; sin filtro devuelve la misma lista cacheada que antes.
  const [excludedIds, teacherSessionIds] = await Promise.all([
    getAnalyticsExcludedPlayerIds(teacherId),
    resolveTeacherSessionIds(teacherId, { contextId, mechanicId })
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
              avgScore: { $avg: SCORE_PERCENT_EXPR },
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
              avgScore: { $avg: SCORE_PERCENT_EXPR },
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

// eslint-disable-next-line sonarjs/cyclomatic-complexity -- agregación del resumen del alumno: múltiples métricas en un pipeline; refactor diferido
async function _getStudentSummaryImpl(studentId, timeRange = '30d') {
  const { currentStart } = getDateRange(timeRange);
  const studentOid = new mongoose.Types.ObjectId(studentId);

  // Pipeline con $facet para un solo round-trip.
  //
  // OPTIMIZACIÓN (perf): el enriquecimiento sesión→contexto/mecánica se hace
  // UNA sola vez ANTES del $facet, no dentro de cada rama. La versión previa
  // repetía el `$lookup game_sessions` + `$lookup game_contexts/game_mechanics`
  // en ~6 ramas del facet sobre el MISMO set de partidas del alumno → MongoDB
  // materializaba el lookup 26 veces (medido con explain). Al pre-enriquecer,
  // cada rama opera sobre los docs ya unidos y solo agrupa/ordena/proyecta.
  // Benchmark (500 partidas, 12 sesiones, 4 ctx × 3 mec): tiempo de pipeline
  // 96 ms → 31 ms (~3x), etapas $lookup 26 → 6, salida byte-idéntica.
  //
  // Semántica de joins preservada EXACTAMENTE:
  //   - `$unwind '$session'` (inner join) descarta partidas huérfanas. Una
  //     partida COMPLETADA nunca queda huérfana: una sesión solo puede borrarse
  //     en estado `created` (gameSessionController.deleteSession), es decir,
  //     antes de tener ninguna partida. Por tanto este inner join no descarta
  //     ningún doc en la práctica y `overallStats` (que antes operaba sobre el
  //     set crudo) cuenta exactamente lo mismo.
  //   - contexto/mecánica con `preserveNullAndEmptyArrays: true` (igual que
  //     antes): una partida con contexto/mecánica ausente se conserva con el
  //     subdoc en `null`, no se descarta.
  const pipeline = [
    {
      $match: {
        playerId: studentOid,
        status: 'completed',
        completedAt: { $gte: currentStart }
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
    // A.2: proyección post-lookup para descartar cardMappings[], boardLayout[],
    // sequencePlan[], config{} antes de los siguientes $lookup. Reduce 80%
    // bytes inter-stage. Mantiene `metrics` completo (lo consumen todas las ramas).
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
    // Proyección de enriquecimiento: retiene TODOS los campos que cualquier
    // rama del $facet necesita (score, maxScore, completedAt, metrics completo, y
    // los subdocs context/mechanic reducidos a lo consumido). Descarta el resto.
    // `maxScore` es IMPRESCINDIBLE desde ADR-201: los facets normalizan a %
    // (score/maxScore×100); sin él SCORE_PERCENT_EXPR devuelve 0 y overallStats/
    // byContext/byMechanic salían a 0 (bug destapado al consumir overallStats en
    // las KPIs del perfil).
    {
      $project: {
        score: 1,
        maxScore: 1,
        completedAt: 1,
        metrics: 1,
        'context._id': 1,
        'context.name': 1,
        'mechanic._id': 1,
        'mechanic.name': 1,
        'mechanic.displayName': 1
      }
    },
    {
      $facet: {
        // Cada rama opera sobre los docs YA enriquecidos (sin más $lookup).
        lastGames: [{ $sort: { completedAt: -1 } }, { $limit: 10 }, GAME_HISTORY_ITEM_PROJECTION],
        byContext: [
          {
            $group: {
              _id: { id: '$context._id', name: '$context.name' },
              avgScore: { $avg: SCORE_PERCENT_EXPR },
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
            $group: {
              _id: { id: '$mechanic._id', name: '$mechanic.displayName' },
              avgScore: { $avg: SCORE_PERCENT_EXPR },
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
              avgScore: { $avg: SCORE_PERCENT_EXPR },
              totalGames: { $sum: 1 },
              avgResponseTime: { $avg: '$metrics.averageResponseTime' },
              // Acierto del RANGO (correctas/intentos), para que la KPI "Tasa de
              // Acierto" del perfil reaccione al selector temporal igual que los
              // gráficos, en lugar de mostrar siempre el acierto lifetime.
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
                    null
                  ]
                }
              }
            }
          }
        ],
        // Métricas específicas de la mecánica Memoria (ADR-A/B, sesión
        // 04/05/2026). Agrega los campos persistidos por GameEngine.endPlay
        // dentro del sub-objeto `metrics.memory`. `null` si el alumno no
        // jugó Memoria en el rango temporal — el frontend muestra
        // `MemoryHighlightCard` solo cuando hay datos.
        memoryStats: [
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
        ],
        // Serie temporal de partidas de Secuencia (cronológica) para el
        // gráfico de evolución. `lastGames` no sirve aquí: está limitado a las
        // 10 últimas partidas (de cualquier mecánica) y no proyecta
        // `maxSequenceLengthAchieved` por partida, por lo que la evolución
        // salía vacía (sin Secuencia en las últimas 10) o como línea plana
        // (todos los puntos caían al máximo global por el fallback del front).
        sequenceProgression: [
          { $match: { 'mechanic.name': 'sequence' } },
          { $sort: { completedAt: -1 } },
          { $limit: 50 },
          { $sort: { completedAt: 1 } },
          {
            $project: {
              _id: 0,
              completedAt: 1,
              maxLength: { $ifNull: ['$metrics.maxSequenceLengthAchieved', 0] },
              sequencesCompleted: { $ifNull: ['$metrics.sequencesCompleted', 0] }
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

  // Comparativa con la clase: media de puntuación (%), acierto (%) y tiempo de
  // respuesta (ms) sobre los alumnos activos del profesor. Antes solo se calculaba
  // la puntuación y se devolvía como `classAvgScore`, pero el front leía
  // `classComparison.averageScore/accuracy/responseTime` → las 3 pastillas
  // "vs clase" salían siempre vacías.
  let classAvg = { averageScore: 0, accuracy: null, responseTime: null };
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
          classAvgScore: { $avg: '$studentMetrics.averageScore' },
          classAvgResponseTime: { $avg: '$studentMetrics.averageResponseTime' },
          classAvgAccuracy: {
            $avg: {
              $let: {
                vars: {
                  tot: {
                    $add: [
                      { $ifNull: ['$studentMetrics.totalCorrectAnswers', 0] },
                      { $ifNull: ['$studentMetrics.totalErrors', 0] }
                    ]
                  }
                },
                in: {
                  $cond: [
                    { $gt: ['$$tot', 0] },
                    {
                      $multiply: [
                        {
                          $divide: [
                            { $ifNull: ['$studentMetrics.totalCorrectAnswers', 0] },
                            '$$tot'
                          ]
                        },
                        100
                      ]
                    },
                    null
                  ]
                }
              }
            }
          }
        }
      }
    ]);
    if (classStats) {
      classAvg = {
        averageScore: classStats.classAvgScore || 0,
        accuracy: classStats.classAvgAccuracy !== null ? classStats.classAvgAccuracy : null,
        responseTime:
          classStats.classAvgResponseTime !== null ? classStats.classAvgResponseTime : null
      };
    }
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
      avgResponseTime: Math.round(overall.avgResponseTime || 0),
      avgAccuracy:
        overall.avgAccuracy !== null && overall.avgAccuracy !== undefined
          ? Math.round(overall.avgAccuracy)
          : null
    },
    // Medias de clase con las CLAVES que consume el front (averageScore/accuracy/
    // responseTime). Se conserva `studentAvgScore`/`classAvgScore`/`difference`
    // por compatibilidad con consumidores existentes (tests/informes).
    classComparison: {
      averageScore: Math.round(classAvg.averageScore * 10) / 10,
      accuracy: classAvg.accuracy !== null ? Math.round(classAvg.accuracy * 10) / 10 : null,
      responseTime: classAvg.responseTime !== null ? Math.round(classAvg.responseTime) : null,
      studentAvgScore: student?.studentMetrics?.averageScore || 0,
      classAvgScore: Math.round(classAvg.averageScore * 10) / 10,
      difference:
        Math.round(((student?.studentMetrics?.averageScore || 0) - classAvg.averageScore) * 10) / 10
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
          hintsUsed: sequenceSummary.hintsUsed || 0,
          // Serie temporal por partida para el gráfico de evolución
          // (SequenceProgressChart). Cronológica, máx. 50 partidas.
          progression: result.sequenceProgression || []
        }
      : null,
    timeRange
  };
}

/**
 * Historial COMPLETO de partidas de un alumno, paginado.
 *
 * Complementa `getStudentSummary.lastGames` (que solo devuelve las 10 más
 * recientes del rango): aquí se pagina sobre TODAS las partidas completadas del
 * alumno, sin filtro temporal, para que el docente pueda consultar la trayectoria
 * entera desde `GameHistoryTable` («Cargar más»). Rinde el mismo shape que
 * `lastGames` (`GAME_HISTORY_ITEM_PROJECTION`).
 *
 * El enriquecimiento sesión→contexto/mecánica se hace DENTRO de la rama `items`
 * del `$facet`, DESPUÉS de `$skip`/`$limit`, de modo que el `$lookup` solo toca
 * los documentos de la página solicitada (no la colección entera). La rama
 * `totalCount` cuenta el total con un índice (`{playerId, status, completedAt}`).
 *
 * @param {string} studentId - ID del alumno
 * @param {Object} [options]
 * @param {number} [options.page=1] - Página (1-indexada)
 * @param {number} [options.limit=20] - Items por página
 * @returns {Promise<{games: Array<Object>, pagination: {page: number, limit: number, total: number, totalPages: number}}>}
 */
async function getStudentGames(studentId, { page = 1, limit = 20 } = {}) {
  const studentOid = new mongoose.Types.ObjectId(studentId);
  const skip = (page - 1) * limit;

  const pipeline = [
    { $match: { playerId: studentOid, status: 'completed' } },
    {
      $facet: {
        items: [
          { $sort: { completedAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          // Enriquecer solo la página (no la colección entera): lookups tras skip/limit.
          {
            $lookup: {
              from: 'game_sessions',
              localField: 'sessionId',
              foreignField: '_id',
              as: 'session'
            }
          },
          { $unwind: { path: '$session', preserveNullAndEmptyArrays: true } },
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
          GAME_HISTORY_ITEM_PROJECTION
        ],
        totalCount: [{ $count: 'count' }]
      }
    }
  ];

  const [result] = await gamePlayRepository.aggregate(pipeline);
  const games = result?.items || [];
  const total = result?.totalCount?.[0]?.count || 0;

  return {
    games,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
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
        avgScore: { $avg: SCORE_PERCENT_EXPR },
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
        avgScore: { $avg: SCORE_PERCENT_EXPR },
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
  getStudentGames,
  getClassroomHeatmap,
  getTopContextsAndMechanics,
  // Helper de scope por profesor (cacheado 300s, invalidado por gameSessionService).
  // Expuesto para que otros módulos (gamePlayController, contentEffectivenessService)
  // reutilicen la MISMA lista cacheada y el prefiltro `$match` early en lugar de
  // re-consultar game_sessions en cada request.
  getTeacherSessionIds,
  // Lista de playerIds excluidos por oposición al tratamiento (Art. 21 RGPD).
  // Expuesto para que contentEffectivenessService aplique la misma exclusión.
  getAnalyticsExcludedPlayerIds
};
