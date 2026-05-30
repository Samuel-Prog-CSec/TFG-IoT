/**
 * @fileoverview Controlador para endpoints de analíticas.
 * Gestiona las peticiones HTTP y conecta con el servicio de analíticas.
 */

const analyticsService = require('../services/analyticsService');
const userRepository = require('../repositories/userRepository');
const GameSession = require('../models/GameSession');
const GamePlay = require('../models/GamePlay');
const { sendSuccess } = require('../utils/responseHelper');
const { cacheGet } = require('../utils/cacheHelper');
const { ensureStudentBelongsToTeacher } = require('../utils/ownershipHelpers');
const { toStudentIdentityDTOV1 } = require('../utils/dtos');
const { MIN_ANALYTICS_GROUP_SIZE } = require('../config/dataRetention');
const { getRequestContext, logSecurityEvent } = require('../utils/securityLogger');
const { pseudonymize } = require('../utils/pseudonymize');
const consentService = require('../services/consentService');

/**
 * T-942 Fase E: añade un sufijo de filtros a una cache key SOLO cuando hay
 * algún filtro activo. Garantiza que la vista por defecto (sin contexto ni
 * mecánica) conserve su key histórica intacta — los tests de cobertura de
 * caché dependen de ello y, sobre todo, evita que un resultado filtrado se
 * sirva (o sea servido) desde la entrada sin filtrar y viceversa.
 *
 * @param {string} baseKey - Key base ya construida (ej. `summary:<teacherId>`)
 * @param {Object} filters - Filtros candidatos (contextId, mechanicId, timeRange)
 * @returns {string} La key base intacta, o con el sufijo `:f:<ctx>:<mech>:<range>`
 * @private
 */
const buildFilteredCacheKey = (baseKey, { contextId, mechanicId, timeRange } = {}) => {
  if (!contextId && !mechanicId && !timeRange) {
    return baseKey;
  }
  return `${baseKey}:f:${contextId || ''}:${mechanicId || ''}:${timeRange || ''}`;
};

/**
 * Obtiene el progreso temporal de un estudiante.
 * @route GET /api/analytics/student/:id/progress
 */
exports.getStudentProgress = async (req, res) => {
  const { id } = req.params;
  const { timeRange } = req.query; // '7d', '30d'

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);
  await consentService.requireConsent(id, 'performance_analytics');

  // Audit trail — Art. 5.2 RGPD (accountability)
  logSecurityEvent('DATA_ACCESS', {
    ...getRequestContext(req),
    studentPseudoId: pseudonymize(id),
    endpoint: 'student/progress'
  });

  const progress = await cacheGet(
    'cache:analytics',
    `student:progress:${id}:${timeRange || '30d'}`,
    async () => analyticsService.getStudentProgress(id, timeRange),
    180
  );

  sendSuccess(res, progress);
};

/**
 * Obtiene las dificultades del estudiante por contexto/mecánica.
 * @route GET /api/analytics/student/:id/difficulties
 */
exports.getStudentDifficulties = async (req, res) => {
  const { id } = req.params;

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);
  await consentService.requireConsent(id, 'performance_analytics');

  // Audit trail — Art. 5.2 RGPD (accountability)
  logSecurityEvent('DATA_ACCESS', {
    ...getRequestContext(req),
    studentPseudoId: pseudonymize(id),
    endpoint: 'student/difficulties'
  });

  const difficulties = await cacheGet(
    'cache:analytics',
    `student:difficulties:${id}`,
    async () => analyticsService.getStudentDifficulties(id),
    180
  );

  sendSuccess(res, difficulties);
};

/**
 * Obtiene resumen de KPIs de la clase del profesor autenticado.
 * @route GET /api/analytics/classroom/summary
 */
exports.getClassroomSummary = async (req, res) => {
  // El ID del profesor viene del token (req.user)
  const teacherId = req.user?._id?.toString();
  // T-942 Fase E: filtros opcionales del Dashboard (contexto/mecánica/rango).
  const { contextId, mechanicId, timeRange } = req.query;

  // La key incluye los filtros SOLO cuando hay alguno activo, de modo que la
  // vista por defecto (sin filtros) conserve la key histórica `summary:<id>`
  // y no sirva (ni sea servida por) resultados filtrados de forma cruzada.
  const cacheKey = buildFilteredCacheKey(`summary:${teacherId}`, {
    contextId,
    mechanicId,
    timeRange
  });

  const summary = await cacheGet(
    'cache:analytics',
    cacheKey,
    async () =>
      analyticsService.getClassroomSummary(teacherId, { contextId, mechanicId, timeRange }),
    300
  );

  sendSuccess(res, summary);
};

/**
 * Obtiene comparativa de rendimiento de la clase (últimos 7 días).
 * @route GET /api/analytics/classroom/comparison
 */
exports.getClassroomComparison = async (req, res) => {
  const teacherId = req.user?._id?.toString();
  // QA 2026-05-30: filtros opcionales del Dashboard (contexto/mecánica). La
  // línea "Rendimiento de Clase (Tendencia)" debe responder al mismo subconjunto
  // que los KPIs cuando el docente filtra por contenido. Sin filtro, la key y el
  // resultado son idénticos al comportamiento previo.
  const { timeRange, contextId, mechanicId } = req.query;

  const cacheKey = buildFilteredCacheKey(`comparison:${teacherId}:${timeRange || 'default'}`, {
    contextId,
    mechanicId
  });

  const comparison = await cacheGet(
    'cache:analytics',
    cacheKey,
    async () =>
      analyticsService.getClassroomComparison(teacherId, timeRange, { contextId, mechanicId }),
    300
  );

  sendSuccess(res, comparison);
};

/**
 * Obtiene dificultades agregadas de la clase.
 * @route GET /api/analytics/classroom/difficulties
 */
exports.getClassroomDifficulties = async (req, res) => {
  const teacherId = req.user?._id?.toString();
  const difficulties = await cacheGet(
    'cache:analytics',
    `difficulties:${teacherId}`,
    async () => analyticsService.getClassroomDifficulties(teacherId),
    300
  );
  sendSuccess(res, difficulties);
};

// ══════════════════════════════════════════════════════════════════════
// Nuevos handlers (T-601)
// ══════════════════════════════════════════════════════════════════════

/**
 * Lista de estudiantes con métricas agregadas.
 * @route GET /api/analytics/classroom/students
 */
exports.getClassroomStudents = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { sort, order, tier, classroom, contextId, mechanicId } = req.query;

  const cacheKey = `students:${teacherId}:${sort || ''}:${order || ''}:${tier || ''}:${classroom || ''}:${contextId || ''}:${mechanicId || ''}`;

  const response = await cacheGet(
    'cache:analytics',
    cacheKey,
    async () => {
      // El servicio devuelve un array de estudiantes; lo envolvemos en objeto
      // para poder aplicar filtros y k-anonimidad de forma consistente.
      const students = await analyticsService.getClassroomStudents(teacherId, {
        sort,
        order,
        tier,
        classroom
      });
      const data = { students, total: students.length };

      // Filtro opcional por contexto/mecánica: identifica los estudiantes que han
      // jugado en sesiones con el contexto o mecánica seleccionados y descarta el resto.
      // No modifica analyticsService.js (ADR-026) — filtra a nivel de controlador.
      if (contextId || mechanicId) {
        const sessionFilter = { createdBy: req.user._id };
        if (contextId) {
          sessionFilter.contextId = contextId;
        }
        if (mechanicId) {
          sessionFilter.mechanicId = mechanicId;
        }

        const sessionIds = await GameSession.find(sessionFilter).select('_id').lean();
        const matchingSessionIds = sessionIds.map(s => s._id);

        if (matchingSessionIds.length === 0) {
          data.students = [];
        } else {
          const playerIds = await GamePlay.distinct('playerId', {
            sessionId: { $in: matchingSessionIds },
            status: 'completed'
          });
          const playerIdSet = new Set(playerIds.map(id => id.toString()));
          // El DTO de estudiante expone `id` (string), no `_id`: usar `s._id`
          // lanzaba TypeError (undefined.toString) → 500 al filtrar por
          // contexto/mecánica. Bug latente: el frontend nunca enviaba un filtro
          // válido por el bug de `value` en las opciones del Dashboard.
          data.students = data.students.filter(s => playerIdSet.has(s.id));
        }

        data.total = data.students.length;
      }

      // Protección k-anonimidad: si el grupo es menor al umbral, solo datos agregados.
      // Previene re-identificación en aulas pequeñas (Guía Anonimización AEPD, 2019).
      if (data.students.length > 0 && data.students.length < MIN_ANALYTICS_GROUP_SIZE) {
        const totalGames = data.students.reduce(
          (sum, s) => sum + (s.studentMetrics?.totalGamesPlayed || 0),
          0
        );
        const avgScore =
          data.students.reduce((sum, s) => sum + (s.studentMetrics?.averageScore || 0), 0) /
          data.students.length;

        return {
          aggregatedOnly: true,
          reason: `Protección k-anonimidad: grupo de ${data.students.length} estudiantes (mínimo ${MIN_ANALYTICS_GROUP_SIZE})`,
          total: data.students.length,
          aggregatedMetrics: {
            totalGames,
            averageScore: Math.round(avgScore * 10) / 10
          }
        };
      }

      return data;
    },
    120
  );

  return sendSuccess(res, response);
};

/**
 * Distribución de rendimiento en 4 rangos.
 * @route GET /api/analytics/classroom/distribution
 */
exports.getClassroomDistribution = async (req, res) => {
  const teacherId = req.user._id.toString();
  // T-942 Fase E: filtros opcionales del Dashboard (contexto/mecánica/rango).
  const { contextId, mechanicId, timeRange } = req.query;

  const cacheKey = buildFilteredCacheKey(`distribution:${teacherId}`, {
    contextId,
    mechanicId,
    timeRange
  });

  const data = await cacheGet(
    'cache:analytics',
    cacheKey,
    async () =>
      analyticsService.getClassroomDistribution(teacherId, { contextId, mechanicId, timeRange }),
    300
  );
  sendSuccess(res, data);
};

/**
 * Tendencias período-sobre-período.
 * @route GET /api/analytics/classroom/trends
 */
exports.getClassroomTrends = async (req, res) => {
  const teacherId = req.user._id.toString();
  // T-942 Fase E: filtros opcionales del Dashboard (contexto/mecánica).
  const { timeRange, contextId, mechanicId } = req.query;

  // timeRange ya formaba parte de la key (`trends:<id>:<timeRange>`); añadimos
  // contexto/mecánica SOLO cuando hay alguno activo para no alterar la key de
  // la vista por defecto.
  const cacheKey = buildFilteredCacheKey(`trends:${teacherId}:${timeRange || 'default'}`, {
    contextId,
    mechanicId
  });

  const data = await cacheGet(
    'cache:analytics',
    cacheKey,
    async () =>
      analyticsService.getClassroomTrends(teacherId, timeRange, { contextId, mechanicId }),
    300
  );
  sendSuccess(res, data);
};

/**
 * Resumen completo de un estudiante.
 * @route GET /api/analytics/student/:id/summary
 */
exports.getStudentSummary = async (req, res) => {
  const { id } = req.params;
  const { timeRange } = req.query;

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);
  await consentService.requireConsent(id, 'performance_analytics');

  // Audit trail — Art. 5.2 RGPD (accountability)
  logSecurityEvent('DATA_ACCESS', {
    ...getRequestContext(req),
    studentPseudoId: pseudonymize(id),
    endpoint: 'student/summary'
  });

  const data = await cacheGet(
    'cache:analytics',
    `student:summary:${id}:${timeRange || 'default'}`,
    async () => analyticsService.getStudentSummary(id, timeRange),
    180
  );
  sendSuccess(res, data);
};

/**
 * Mapa de calor de actividad.
 * @route GET /api/analytics/classroom/heatmap
 */
exports.getClassroomHeatmap = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { timeRange } = req.query;
  const data = await cacheGet(
    'cache:analytics',
    `heatmap:${teacherId}:${timeRange || 'default'}`,
    async () => analyticsService.getClassroomHeatmap(teacherId, timeRange),
    300
  );
  sendSuccess(res, data);
};

/**
 * Top contextos y mecánicas.
 * @route GET /api/analytics/classroom/rankings
 */
exports.getClassroomRankings = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { timeRange, limit } = req.query;
  const data = await cacheGet(
    'cache:analytics',
    `rankings:${teacherId}:${timeRange || 'default'}:${limit || 'default'}`,
    async () => analyticsService.getTopContextsAndMechanics(teacherId, timeRange, limit),
    600
  );
  sendSuccess(res, data);
};

/**
 * Resolución de identidad seudonimizada.
 * Devuelve el mapeo pseudoId → datos identificativos para los estudiantes del profesor.
 * Endpoint dedicado que separa PII de datos analíticos (Art. 25 RGPD).
 *
 * NO cachear: el payload contiene datos identificativos directos (name, avatar,
 * classroom, age). Cachearlo ampliaría la superficie de exposición de PII sin
 * beneficio de rendimiento relevante (query simple por createdBy + role).
 *
 * @route GET /api/analytics/students/identity
 */
exports.getStudentsIdentity = async (req, res) => {
  const teacherId = req.user._id.toString();
  // Solo estudiantes con consentimiento de analytics activo (Art. 21 RGPD)
  const students = await userRepository.find(
    {
      createdBy: teacherId,
      role: 'student',
      status: 'active',
      'consent.granted': true,
      'consent.purposes': 'performance_analytics'
    },
    { select: 'name profile.avatar profile.age profile.classroom' }
  );
  sendSuccess(res, students.map(toStudentIdentityDTOV1));
};
