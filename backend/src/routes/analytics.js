/**
 * @fileoverview Rutas para el módulo de analíticas.
 * Define los endpoints y aplica middleware de autenticación y validación.
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validateParams, validateQuery } = require('../middlewares/validation');
const { emptyObjectSchema } = require('../validators/commonValidator');
const {
  analyticsStudentParamsSchema,
  analyticsTimeRangeQuerySchema,
  classroomStudentsQuerySchema,
  classroomDistributionQuerySchema,
  classroomTrendsQuerySchema,
  studentSummaryQuerySchema,
  classroomHeatmapQuerySchema,
  classroomRankingsQuerySchema
} = require('../validators/analyticsValidator');
const asyncHandler = require('../utils/asyncHandler');

// Todas las rutas requieren estar autenticado como profesor o super admin
router.use(authenticate, requireRole('teacher', 'super_admin'));

// ──────────────── Rutas existentes ────────────────

// Rutas de estudiante individual
router.get(
  '/student/:id/progress',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(analyticsTimeRangeQuerySchema),
  asyncHandler(analyticsController.getStudentProgress)
);
router.get(
  '/student/:id/difficulties',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(analyticsController.getStudentDifficulties)
);

// Rutas de clase (profesor)
router.get(
  '/classroom/summary',
  validateQuery(emptyObjectSchema),
  asyncHandler(analyticsController.getClassroomSummary)
);
router.get(
  '/classroom/comparison',
  validateQuery(analyticsTimeRangeQuerySchema),
  asyncHandler(analyticsController.getClassroomComparison)
);
router.get(
  '/classroom/difficulties',
  validateQuery(emptyObjectSchema),
  asyncHandler(analyticsController.getClassroomDifficulties)
);

// ──────────────── Nuevas rutas (T-601) ────────────────

/**
 * @route   GET /api/analytics/classroom/students
 * @desc    Lista de estudiantes con métricas agregadas, filtrable por tier y classroom
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/classroom/students',
  validateQuery(classroomStudentsQuerySchema),
  asyncHandler(analyticsController.getClassroomStudents)
);

/**
 * @route   GET /api/analytics/classroom/distribution
 * @desc    Distribución de rendimiento en 4 rangos (riesgo, promedio, bueno, excelente)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/classroom/distribution',
  validateQuery(classroomDistributionQuerySchema),
  asyncHandler(analyticsController.getClassroomDistribution)
);

/**
 * @route   GET /api/analytics/classroom/trends
 * @desc    Tendencias período-sobre-período con cambio porcentual
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/classroom/trends',
  validateQuery(classroomTrendsQuerySchema),
  asyncHandler(analyticsController.getClassroomTrends)
);

/**
 * @route   GET /api/analytics/classroom/heatmap
 * @desc    Mapa de calor de actividad (día de la semana × hora)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/classroom/heatmap',
  validateQuery(classroomHeatmapQuerySchema),
  asyncHandler(analyticsController.getClassroomHeatmap)
);

/**
 * @route   GET /api/analytics/classroom/rankings
 * @desc    Top contextos y mecánicas por uso y rendimiento
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/classroom/rankings',
  validateQuery(classroomRankingsQuerySchema),
  asyncHandler(analyticsController.getClassroomRankings)
);

/**
 * @route   GET /api/analytics/student/:id/summary
 * @desc    Resumen completo de un estudiante (últimas partidas, rendimiento, comparativa)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/student/:id/summary',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(studentSummaryQuerySchema),
  asyncHandler(analyticsController.getStudentSummary)
);

module.exports = router;
