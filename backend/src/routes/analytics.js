/**
 * @fileoverview Rutas para el módulo de analíticas.
 * Define los endpoints y aplica middleware de autenticación y validación.
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate, requireRole } = require('../middlewares/auth');
const { analyticsRateLimiter, reportExportRateLimiter } = require('../config/security');
const { validateParams, validateQuery, validateBody } = require('../middlewares/validation');
const { emptyObjectSchema } = require('../validators/commonValidator');
const {
  analyticsStudentParamsSchema,
  analyticsTimeRangeQuerySchema,
  classroomStudentsQuerySchema,
  classroomSummaryQuerySchema,
  classroomDistributionQuerySchema,
  classroomTrendsQuerySchema,
  classroomComparisonQuerySchema,
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
  reportQuerySchema,
  reportExportQuerySchema
} = require('../validators/analyticsValidator');
const {
  alertIdParamsSchema,
  listAlertsQuerySchema,
  alertsSummaryQuerySchema,
  alertsEffectivenessQuerySchema,
  dismissAlertBodySchema,
  snoozeAlertBodySchema,
  bulkAlertActionBodySchema
} = require('../validators/alertsValidator');
const asyncHandler = require('../utils/asyncHandler');
const analyticsAdvancedController = require('../controllers/analyticsAdvancedController');
const alertsController = require('../controllers/alertsController');

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

/**
 * @openapi
 * /analytics/classroom/summary:
 *   get:
 *     tags: [Analytics]
 *     summary: KPIs agregados del aula del profesor autenticado
 *     description: Devuelve totalStudents, averageScore, studentsInRisk y métricas globales.
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Resumen del aula
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalStudents: { type: integer }
 *                     averageScore: { type: number }
 *                     studentsInRisk: { type: integer }
 *                     activeStudents: { type: integer }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */
// Rutas de clase (profesor)
router.get(
  '/classroom/summary',
  validateQuery(classroomSummaryQuerySchema),
  asyncHandler(analyticsController.getClassroomSummary)
);
router.get(
  '/classroom/comparison',
  validateQuery(classroomComparisonQuerySchema),
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

/**
 * @openapi
 * /analytics/classroom/students:
 *   get:
 *     tags: [Analytics]
 *     summary: Estudiantes del aula con métricas agregadas
 *     description: Incluye `studentMetrics.maxSequenceLengthAchieved` (T-922) para la columna comparativa "Mejor Secuencia".
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: tier
 *         schema: { type: string, enum: [excellent, good, average, risk] }
 *       - in: query
 *         name: classroom
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [name, score, lastPlayed, accuracy] }
 *     responses:
 *       200:
 *         description: Lista con métricas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/User'
 *                       - type: object
 *                         properties:
 *                           studentMetrics:
 *                             type: object
 *                             properties:
 *                               maxSequenceLengthAchieved: { type: integer }
 *                               sequencesCompleted: { type: integer }
 *                               averageScore: { type: number }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
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

/**
 * @openapi
 * /analytics/classroom/distribution:
 *   get:
 *     tags: [Analytics]
 *     summary: Distribución de rendimiento en 4 tiers
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: 4 buckets con count y porcentaje
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       range: { type: string }
 *                       count: { type: integer }
 *                       percentage: { type: number }
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

/**
 * @openapi
 * /analytics/student/{id}/summary:
 *   get:
 *     tags: [Analytics]
 *     summary: Resumen completo de un alumno con métricas por mecánica
 *     description: Incluye desglose por mecánica (memoria, asociación, secuencia con `maxSequenceLengthAchieved` y `sequencesCompleted`).
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: timeRange
 *         schema: { type: string, enum: ['7d', '30d', '90d'] }
 *     responses:
 *       200:
 *         description: Resumen del alumno
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: object, description: 'Resumen complejo con KPIs y serie temporal' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get(
  '/student/:id/summary',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(studentSummaryQuerySchema),
  asyncHandler(analyticsController.getStudentSummary)
);

// ──────────────── Resolución de identidad seudonimizada (T-703) ────────────────

/**
 * @route   GET /api/analytics/students/identity
 * @desc    Mapeo pseudoId → identidad para los estudiantes del profesor.
 *          Endpoint dedicado de resolución (Art. 25 RGPD: separación PII/analytics).
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/students/identity',
  validateQuery(emptyObjectSchema),
  asyncHandler(analyticsController.getStudentsIdentity)
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

// ──────────── Alertas inteligentes persistidas (T-941) ────────────
//
// Sustituye el sistema legacy de alertsService.getAlerts() on-the-fly por
// SmartAlerts con ciclo de vida (active|resolved|dismissed|snoozed),
// historial, pinning, audit y dashboard de eficacia. ADR-169.

/**
 * @route   GET /api/analytics/alerts
 * @desc    Listado paginado de alertas con filtros por estado/severidad/tipo
 */
router.get('/alerts', validateQuery(listAlertsQuerySchema), asyncHandler(alertsController.list));

/**
 * @route   GET /api/analytics/alerts/summary
 * @desc    Conteos para badges (por severidad, estado y tipo)
 */
router.get(
  '/alerts/summary',
  validateQuery(alertsSummaryQuerySchema),
  asyncHandler(alertsController.summary)
);

/**
 * @route   GET /api/analytics/alerts/effectiveness
 * @desc    Dashboard interno del sistema de alertas (H.3)
 */
router.get(
  '/alerts/effectiveness',
  validateQuery(alertsEffectivenessQuerySchema),
  asyncHandler(alertsController.effectiveness)
);

/**
 * @route   GET /api/analytics/alerts/:id
 * @desc    Detalle individual de una alerta
 */
router.get(
  '/alerts/:id',
  validateParams(alertIdParamsSchema),
  asyncHandler(alertsController.getById)
);

/**
 * @route   GET /api/analytics/alerts/:id/history
 * @desc    Audit log / timeline lifecycle (H.2)
 */
router.get(
  '/alerts/:id/history',
  validateParams(alertIdParamsSchema),
  asyncHandler(alertsController.history)
);

/**
 * @route   PATCH /api/analytics/alerts/:id/dismiss
 * @desc    Marca como descartada con motivo
 */
router.patch(
  '/alerts/:id/dismiss',
  validateParams(alertIdParamsSchema),
  validateBody(dismissAlertBodySchema),
  asyncHandler(alertsController.dismiss)
);

/**
 * @route   PATCH /api/analytics/alerts/:id/resolve
 * @desc    Marca manualmente como resuelta
 */
router.patch(
  '/alerts/:id/resolve',
  validateParams(alertIdParamsSchema),
  validateBody(emptyObjectSchema),
  asyncHandler(alertsController.resolve)
);

/**
 * @route   PATCH /api/analytics/alerts/:id/snooze
 * @desc    Pausa hasta una fecha futura (días o ISO)
 */
router.patch(
  '/alerts/:id/snooze',
  validateParams(alertIdParamsSchema),
  validateBody(snoozeAlertBodySchema),
  asyncHandler(alertsController.snooze)
);

/**
 * @route   PATCH /api/analytics/alerts/:id/pin
 * @desc    Fija al principio (límite 3 por teacher)
 */
router.patch(
  '/alerts/:id/pin',
  validateParams(alertIdParamsSchema),
  validateBody(emptyObjectSchema),
  asyncHandler(alertsController.pin)
);

/**
 * @route   PATCH /api/analytics/alerts/:id/unpin
 * @desc    Quita la fijación
 */
router.patch(
  '/alerts/:id/unpin',
  validateParams(alertIdParamsSchema),
  validateBody(emptyObjectSchema),
  asyncHandler(alertsController.unpin)
);

/**
 * @route   POST /api/analytics/alerts/bulk-action
 * @desc    Acciones lifecycle en lote (dismiss/resolve/snooze)
 */
router.post(
  '/alerts/bulk-action',
  validateBody(bulkAlertActionBodySchema),
  asyncHandler(alertsController.bulkAction)
);

// — Reportes y exportación (E17-E19) —

/**
 * @route   GET /api/analytics/reports/student/:id
 * @desc    Datos completos de reporte de un estudiante (E17)
 * @access  Private (Teacher/Super Admin)
 */
router.get(
  '/reports/student/:id',
  reportExportRateLimiter,
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
  reportExportRateLimiter,
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
  reportExportRateLimiter,
  validateQuery(reportExportQuerySchema),
  asyncHandler(analyticsAdvancedController.getClassroomExport)
);

module.exports = router;
