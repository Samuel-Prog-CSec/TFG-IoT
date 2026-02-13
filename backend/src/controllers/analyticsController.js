/**
 * @fileoverview Controlador para endpoints de analíticas.
 * Gestiona las peticiones HTTP y conecta con el servicio de analíticas.
 */

const analyticsService = require('../services/analyticsService');
const logger = require('../utils/logger');
const userRepository = require('../repositories/userRepository');
const { ForbiddenError, NotFoundError } = require('../utils/errors');

/**
 * Obtiene el progreso temporal de un estudiante.
 * @route GET /api/analytics/student/:id/progress
 */
exports.getStudentProgress = async (req, res, next) => {
  try {
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
  } catch (error) {
    logger.error(`Error en getStudentProgress: ${error.message}`);
    next(error);
  }
};

/**
 * Obtiene las dificultades del estudiante por contexto/mecánica.
 * @route GET /api/analytics/student/:id/difficulties
 */
exports.getStudentDifficulties = async (req, res, next) => {
  try {
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
  } catch (error) {
    logger.error(`Error en getStudentDifficulties: ${error.message}`);
    next(error);
  }
};

/**
 * Obtiene resumen de KPIs de la clase del profesor autenticado.
 * @route GET /api/analytics/classroom/summary
 */
exports.getClassroomSummary = async (req, res, next) => {
  try {
    // El ID del profesor viene del token (req.user)
    const teacherId = req.user?._id?.toString();

    const summary = await analyticsService.getClassroomSummary(teacherId);

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error(`Error en getClassroomSummary: ${error.message}`);
    next(error);
  }
};

/**
 * Obtiene comparativa de rendimiento de la clase (últimos 7 días).
 * @route GET /api/analytics/classroom/comparison
 */
exports.getClassroomComparison = async (req, res, next) => {
  try {
    const teacherId = req.user?._id?.toString();
    const { timeRange } = req.query;

    const comparison = await analyticsService.getClassroomComparison(teacherId, timeRange);

    res.status(200).json({
      success: true,
      data: comparison
    });
  } catch (error) {
    logger.error(`Error en getClassroomComparison: ${error.message}`);
    next(error);
  }
};

/**
 * Obtiene dificultades agregadas de la clase.
 * @route GET /api/analytics/classroom/difficulties
 */
exports.getClassroomDifficulties = async (req, res, next) => {
  try {
    const teacherId = req.user?._id?.toString();
    const difficulties = await analyticsService.getClassroomDifficulties(teacherId);
    res.status(200).json({
      success: true,
      data: difficulties
    });
  } catch (error) {
    logger.error(`Error en getClassroomDifficulties: ${error.message}`);
    next(error);
  }
};
