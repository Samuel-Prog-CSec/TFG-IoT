/**
 * @fileoverview Controlador para endpoints de analíticas.
 * Gestiona las peticiones HTTP y conecta con el servicio de analíticas.
 */

const analyticsService = require('../services/analyticsService');
const userRepository = require('../repositories/userRepository');
const { ForbiddenError, NotFoundError } = require('../utils/errors');
const { sendSuccess } = require('../utils/responseHelper');

/**
 * Obtiene el progreso temporal de un estudiante.
 * @route GET /api/analytics/student/:id/progress
 */
exports.getStudentProgress = async (req, res) => {
  const { id } = req.params;
  const { timeRange } = req.query; // '7d', '30d'

  if (req.user.role === 'teacher') {
    const student = await userRepository.findById(id, { select: 'createdBy' });
    if (!student) {
      throw new NotFoundError('Alumno');
    }
    if (student.createdBy?.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para ver este alumno');
    }
  }

  const progress = await analyticsService.getStudentProgress(id, timeRange);

  res.status(200).json({
    success: true,
    data: progress
  });
};

/**
 * Obtiene las dificultades del estudiante por contexto/mecánica.
 * @route GET /api/analytics/student/:id/difficulties
 */
exports.getStudentDifficulties = async (req, res) => {
  const { id } = req.params;

  if (req.user.role === 'teacher') {
    const student = await userRepository.findById(id, { select: 'createdBy' });
    if (!student) {
      throw new NotFoundError('Alumno');
    }
    if (student.createdBy?.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para ver este alumno');
    }
  }

  const difficulties = await analyticsService.getStudentDifficulties(id);

  res.status(200).json({
    success: true,
    data: difficulties
  });
};

/**
 * Obtiene resumen de KPIs de la clase del profesor autenticado.
 * @route GET /api/analytics/classroom/summary
 */
exports.getClassroomSummary = async (req, res) => {
  // El ID del profesor viene del token (req.user)
  const teacherId = req.user?._id?.toString();

  const summary = await analyticsService.getClassroomSummary(teacherId);

  res.status(200).json({
    success: true,
    data: summary
  });
};

/**
 * Obtiene comparativa de rendimiento de la clase (últimos 7 días).
 * @route GET /api/analytics/classroom/comparison
 */
exports.getClassroomComparison = async (req, res) => {
  const teacherId = req.user?._id?.toString();
  const { timeRange } = req.query;

  const comparison = await analyticsService.getClassroomComparison(teacherId, timeRange);

  res.status(200).json({
    success: true,
    data: comparison
  });
};

/**
 * Obtiene dificultades agregadas de la clase.
 * @route GET /api/analytics/classroom/difficulties
 */
exports.getClassroomDifficulties = async (req, res) => {
  const teacherId = req.user?._id?.toString();
  const difficulties = await analyticsService.getClassroomDifficulties(teacherId);
  res.status(200).json({
    success: true,
    data: difficulties
  });
};

// ══════════════════════════════════════════════════════════════════════
// Nuevos handlers (T-601)
// ══════════════════════════════════════════════════════════════════════

/**
 * Verifica que el profesor tiene acceso al estudiante.
 * @private
 */
const ensureStudentOwnership = async (req, studentId) => {
  if (req.user.role === 'teacher') {
    const student = await userRepository.findById(studentId, { select: 'createdBy' });
    if (!student) {
      throw new NotFoundError('Alumno');
    }
    if (student.createdBy?.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para ver este alumno');
    }
  }
};

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
  const data = await analyticsService.getClassroomDistribution(teacherId);
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

  await ensureStudentOwnership(req, id);

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
