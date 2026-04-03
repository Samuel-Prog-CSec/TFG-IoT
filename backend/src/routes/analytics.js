/**
 * @fileoverview Rutas para el módulo de analíticas.
 * Define los endpoints y aplica middleware de autenticación y validación.
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate, requireRole } = require('../middlewares/auth');
const { analyticsRateLimiter } = require('../config/security');
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
  classroomRankingsQuerySchema,
  // Schemas avanzados (Analytics Expansion)
  trajectoryQuerySchema,
  velocityQuerySchema,
  plateauQuerySchema,
  evolutionQuerySchema,
  gameplayParamsSchema,
  cardAnalysisQuerySchema,
  strugglesQuerySchema,
  fatigueQuerySchema,
  engagementQuerySchema,
  classroomEngagementQuerySchema,
  playPatternsQuerySchema,
  contentEffectivenessQuerySchema,
  cardDifficultyQuerySchema,
  learningCurvesQuerySchema,
  alertsQuerySchema,
  reportQuerySchema,
  reportExportQuerySchema
} = require('../validators/analyticsValidator');
const asyncHandler = require('../utils/asyncHandler');
const analyticsAdvancedController = require('../controllers/analyticsAdvancedController');

// Todas las rutas requieren estar autenticado como profesor o super admin
router.use(authenticate, requireRole('teacher', 'super_admin'), analyticsRateLimiter);

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

// ──────────────── Rutas avanzadas (Analytics Expansion) ────────────────

// — Trayectoria de aprendizaje (E01-E04) —

/**
 * @route   GET /api/analytics/student/:id/trajectory
 * @desc    Progresión temporal con tendencia calculada (E01)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/student/:id/trajectory',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(trajectoryQuerySchema),
  asyncHandler(analyticsAdvancedController.getStudentTrajectory)
);

/**
 * @route   GET /api/analytics/student/:id/velocity
 * @desc    Velocidad de mejora en ventanas temporales (E02)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/student/:id/velocity',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(velocityQuerySchema),
  asyncHandler(analyticsAdvancedController.getStudentVelocity)
);

/**
 * @route   GET /api/analytics/student/:id/plateaus
 * @desc    Detección de periodos de estancamiento (E03)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/student/:id/plateaus',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(plateauQuerySchema),
  asyncHandler(analyticsAdvancedController.getStudentPlateaus)
);

/**
 * @route   GET /api/analytics/student/:id/evolution
 * @desc    Evolución por contexto o mecánica (E04)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/student/:id/evolution',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(evolutionQuerySchema),
  asyncHandler(analyticsAdvancedController.getStudentEvolution)
);

// — Análisis de sesiones (E05-E08) —

/**
 * @route   GET /api/analytics/gameplay/:id/rounds
 * @desc    Desglose ronda-a-ronda de una partida con detección de fatiga (E05)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/gameplay/:id/rounds',
  validateParams(gameplayParamsSchema),
  asyncHandler(analyticsAdvancedController.getGameplayRounds)
);

/**
 * @route   GET /api/analytics/classroom/card-analysis
 * @desc    Análisis de rendimiento por tarjeta RFID (E06)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/classroom/card-analysis',
  validateQuery(cardAnalysisQuerySchema),
  asyncHandler(analyticsAdvancedController.getCardAnalysis)
);

/**
 * @route   GET /api/analytics/student/:id/struggles
 * @desc    Momentos de dificultad — errores consecutivos (E07)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/student/:id/struggles',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(strugglesQuerySchema),
  asyncHandler(analyticsAdvancedController.getStudentStruggles)
);

/**
 * @route   GET /api/analytics/classroom/fatigue
 * @desc    Indicadores de fatiga agregados de la clase (E08)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/classroom/fatigue',
  validateQuery(fatigueQuerySchema),
  asyncHandler(analyticsAdvancedController.getClassroomFatigue)
);

// — Engagement (E09-E11) —

/**
 * @route   GET /api/analytics/student/:id/engagement
 * @desc    Engagement score individual con componentes desglosados (E09)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/student/:id/engagement',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(engagementQuerySchema),
  asyncHandler(analyticsAdvancedController.getStudentEngagement)
);

/**
 * @route   GET /api/analytics/classroom/engagement
 * @desc    Engagement agregado de toda la clase (E10)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/classroom/engagement',
  validateQuery(classroomEngagementQuerySchema),
  asyncHandler(analyticsAdvancedController.getClassroomEngagement)
);

/**
 * @route   GET /api/analytics/student/:id/play-patterns
 * @desc    Patrones de juego del estudiante (E11)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/student/:id/play-patterns',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(playPatternsQuerySchema),
  asyncHandler(analyticsAdvancedController.getStudentPlayPatterns)
);

// — Efectividad de contenido (E12-E14) —

/**
 * @route   GET /api/analytics/classroom/content-effectiveness
 * @desc    Qué contextos/mecánicas producen mejor aprendizaje (E12)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/classroom/content-effectiveness',
  validateQuery(contentEffectivenessQuerySchema),
  asyncHandler(analyticsAdvancedController.getContentEffectiveness)
);

/**
 * @route   GET /api/analytics/classroom/card-difficulty
 * @desc    Tarjetas problemáticas con tasa de error alta (E13)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/classroom/card-difficulty',
  validateQuery(cardDifficultyQuerySchema),
  asyncHandler(analyticsAdvancedController.getCardDifficulty)
);

/**
 * @route   GET /api/analytics/classroom/learning-curves
 * @desc    Curvas de aprendizaje por contenido (E14)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/classroom/learning-curves',
  validateQuery(learningCurvesQuerySchema),
  asyncHandler(analyticsAdvancedController.getLearningCurves)
);

// — Alertas inteligentes (E15-E16) —

/**
 * @route   GET /api/analytics/alerts
 * @desc    Alertas inteligentes computadas server-side (E15)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/alerts',
  validateQuery(alertsQuerySchema),
  asyncHandler(analyticsAdvancedController.getAlerts)
);

/**
 * @route   GET /api/analytics/alerts/summary
 * @desc    Resumen de alertas (conteos) para badges del sidebar (E16)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/alerts/summary',
  validateQuery(emptyObjectSchema),
  asyncHandler(analyticsAdvancedController.getAlertsSummary)
);

// — Reportes y exportación (E17-E19) —

/**
 * @route   GET /api/analytics/reports/student/:id
 * @desc    Datos completos de reporte de un estudiante (E17)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/reports/student/:id',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(reportQuerySchema),
  asyncHandler(analyticsAdvancedController.getStudentReport)
);

/**
 * @route   GET /api/analytics/reports/classroom
 * @desc    Datos completos de reporte de la clase (E18)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/reports/classroom',
  validateQuery(reportQuerySchema),
  asyncHandler(analyticsAdvancedController.getClassroomReport)
);

/**
 * @route   GET /api/analytics/reports/classroom/export
 * @desc    Datos tabulares optimizados para CSV (E19)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/reports/classroom/export',
  validateQuery(reportExportQuerySchema),
  asyncHandler(analyticsAdvancedController.getClassroomExport)
);

module.exports = router;
