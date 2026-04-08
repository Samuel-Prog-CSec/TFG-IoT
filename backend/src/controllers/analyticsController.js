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

/**
 * Obtiene el progreso temporal de un estudiante.
 * @route GET /api/analytics/student/:id/progress
 */
exports.getStudentProgress = async (req, res) => {
  const { id } = req.params;
  const { timeRange } = req.query; // '7d', '30d'

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);

  const progress = await analyticsService.getStudentProgress(id, timeRange);

  sendSuccess(res, progress);
};

/**
 * Obtiene las dificultades del estudiante por contexto/mecánica.
 * @route GET /api/analytics/student/:id/difficulties
 */
exports.getStudentDifficulties = async (req, res) => {
  const { id } = req.params;

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);

  const difficulties = await analyticsService.getStudentDifficulties(id);

  sendSuccess(res, difficulties);
};

/**
 * Obtiene resumen de KPIs de la clase del profesor autenticado.
 * @route GET /api/analytics/classroom/summary
 */
exports.getClassroomSummary = async (req, res) => {
  // El ID del profesor viene del token (req.user)
  const teacherId = req.user?._id?.toString();

  const summary = await cacheGet(
    'cache:analytics',
    `summary:${teacherId}`,
    async () => analyticsService.getClassroomSummary(teacherId),
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
  const { timeRange } = req.query;

  const comparison = await analyticsService.getClassroomComparison(teacherId, timeRange);

  sendSuccess(res, comparison);
};

/**
 * Obtiene dificultades agregadas de la clase.
 * @route GET /api/analytics/classroom/difficulties
 */
exports.getClassroomDifficulties = async (req, res) => {
  const teacherId = req.user?._id?.toString();
  const difficulties = await analyticsService.getClassroomDifficulties(teacherId);
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
      data.students = data.students.filter(s => playerIdSet.has(s._id.toString()));
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

    return sendSuccess(res, {
      aggregatedOnly: true,
      reason: `Protección k-anonimidad: grupo de ${data.students.length} estudiantes (mínimo ${MIN_ANALYTICS_GROUP_SIZE})`,
      total: data.students.length,
      aggregatedMetrics: {
        totalGames,
        averageScore: Math.round(avgScore * 10) / 10
      }
    });
  }

  sendSuccess(res, data);
};

/**
 * Distribución de rendimiento en 4 rangos.
 * @route GET /api/analytics/classroom/distribution
 */
exports.getClassroomDistribution = async (req, res) => {
  const teacherId = req.user._id.toString();
  const data = await cacheGet(
    'cache:analytics',
    `distribution:${teacherId}`,
    async () => analyticsService.getClassroomDistribution(teacherId),
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
  const { timeRange } = req.query;
  const data = await analyticsService.getClassroomTrends(teacherId, timeRange);
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

  const data = await analyticsService.getStudentSummary(id, timeRange);
  sendSuccess(res, data);
};

/**
 * Mapa de calor de actividad.
 * @route GET /api/analytics/classroom/heatmap
 */
exports.getClassroomHeatmap = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { timeRange } = req.query;
  const data = await analyticsService.getClassroomHeatmap(teacherId, timeRange);
  sendSuccess(res, data);
};

/**
 * Top contextos y mecánicas.
 * @route GET /api/analytics/classroom/rankings
 */
exports.getClassroomRankings = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { timeRange, limit } = req.query;
  const data = await analyticsService.getTopContextsAndMechanics(teacherId, timeRange, limit);
  sendSuccess(res, data);
};

/**
 * Resolución de identidad seudonimizada.
 * Devuelve el mapeo pseudoId → datos identificativos para los estudiantes del profesor.
 * Endpoint dedicado que separa PII de datos analíticos (Art. 25 RGPD).
 * @route GET /api/analytics/students/identity
 */
exports.getStudentsIdentity = async (req, res) => {
  const teacherId = req.user._id.toString();
  const students = await userRepository.find(
    { createdBy: teacherId, role: 'student', status: 'active' },
    { select: 'name profile.avatar profile.age profile.classroom' }
  );
  sendSuccess(res, students.map(toStudentIdentityDTOV1));
};
