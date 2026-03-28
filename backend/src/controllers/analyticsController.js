/**
 * @fileoverview Controlador para endpoints de analíticas.
 * Gestiona las peticiones HTTP y conecta con el servicio de analíticas.
 */

const analyticsService = require('../services/analyticsService');
const userRepository = require('../repositories/userRepository');
const { sendSuccess } = require('../utils/responseHelper');
const { cacheGet } = require('../utils/cacheHelper');
const { ensureStudentBelongsToTeacher } = require('../utils/ownershipHelpers');

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
  const { sort, order, tier, classroom } = req.query;

  const data = await analyticsService.getClassroomStudents(teacherId, {
    sort,
    order,
    tier,
    classroom
  });

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
