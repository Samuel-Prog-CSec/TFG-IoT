/**
 * @fileoverview Controlador para endpoints de analytics avanzados (Sprint 5 expansion).
 * Conecta los sub-servicios de analytics/ con las rutas HTTP.
 *
 * Separado de analyticsController.js para mantener zero regresión — ver ADR-026.
 *
 * @module controllers/analyticsAdvancedController
 */

const { sendSuccess } = require('../utils/responseHelper');
const { cacheGet } = require('../utils/cacheHelper');
const { ensureStudentBelongsToTeacher } = require('../utils/ownershipHelpers');
const userRepository = require('../repositories/userRepository');
const { ForbiddenError } = require('../utils/errors');

/**
 * Verifica que el estudiante tiene consentimiento activo de analytics.
 * Art. 21 RGPD — si el tutor se opuso a analytics, no se sirven datos.
 * @param {string} studentId
 * @throws {ForbiddenError}
 * @private
 */
async function verifyAnalyticsConsent(studentId) {
  const student = await userRepository.findById(studentId, {
    select: 'consent.granted consent.purposes'
  });
  if (!student?.consent?.granted || !student.consent.purposes?.includes('performance_analytics')) {
    throw new ForbiddenError(
      'El tutor de este estudiante ha ejercido su derecho de oposición a analytics (Art. 21 RGPD)'
    );
  }
}

// Sub-servicios de analytics
const alertsService = require('../services/analytics/alertsService');
const studentTrajectoryService = require('../services/analytics/studentTrajectoryService');
const sessionAnalysisService = require('../services/analytics/sessionAnalysisService');
const engagementService = require('../services/analytics/engagementService');
const contentEffectivenessService = require('../services/analytics/contentEffectivenessService');
const reportDataService = require('../services/analytics/reportDataService');

// ══════════════════════════════════════════════════════════════════════
// Alertas inteligentes (E15, E16)
// ══════════════════════════════════════════════════════════════════════

/**
 * Obtiene alertas activas para los alumnos del profesor.
 * @route GET /api/analytics/alerts
 */
exports.getAlerts = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { severity, type, limit } = req.query;

  const data = await cacheGet(
    'cache:analytics',
    `alerts:${teacherId}:${severity || 'all'}:${type || 'all'}`,
    async () => alertsService.getAlerts(teacherId, { severity, type, limit }),
    600
  );

  sendSuccess(res, data);
};

// ══════════════════════════════════════════════════════════════════════
// Trayectoria de aprendizaje (E01-E04)
// ══════════════════════════════════════════════════════════════════════

/**
 * Obtiene la trayectoria de aprendizaje de un estudiante.
 * @route GET /api/analytics/student/:id/trajectory
 */
exports.getStudentTrajectory = async (req, res) => {
  const { id } = req.params;
  const { timeRange, granularity } = req.query;

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);
  await verifyAnalyticsConsent(id);

  const data = await cacheGet(
    'cache:analytics',
    `trajectory:${id}:${timeRange}:${granularity || 'auto'}`,
    async () => studentTrajectoryService.getStudentTrajectory(id, { timeRange, granularity }),
    300
  );

  sendSuccess(res, data);
};

/**
 * Obtiene la velocidad de mejora del estudiante.
 * @route GET /api/analytics/student/:id/velocity
 */
exports.getStudentVelocity = async (req, res) => {
  const { id } = req.params;
  const { timeRange, windowDays } = req.query;

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);
  await verifyAnalyticsConsent(id);

  const data = await studentTrajectoryService.getStudentVelocity(id, { timeRange, windowDays });

  sendSuccess(res, data);
};

/**
 * Detecta periodos de estancamiento del estudiante.
 * @route GET /api/analytics/student/:id/plateaus
 */
exports.getStudentPlateaus = async (req, res) => {
  const { id } = req.params;
  const { timeRange, minDays } = req.query;

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);
  await verifyAnalyticsConsent(id);

  const data = await studentTrajectoryService.getStudentPlateaus(id, { timeRange, minDays });

  sendSuccess(res, data);
};

/**
 * Obtiene la evolución por contexto o mecánica.
 * @route GET /api/analytics/student/:id/evolution
 */
exports.getStudentEvolution = async (req, res) => {
  const { id } = req.params;
  const { timeRange, groupBy } = req.query;

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);
  await verifyAnalyticsConsent(id);

  const data = await studentTrajectoryService.getStudentEvolution(id, { timeRange, groupBy });

  sendSuccess(res, data);
};

// ══════════════════════════════════════════════════════════════════════
// Análisis de sesiones (E05-E08)
// ══════════════════════════════════════════════════════════════════════

/**
 * Desglose ronda-a-ronda de una partida.
 * @route GET /api/analytics/gameplay/:id/rounds
 */
exports.getGameplayRounds = async (req, res) => {
  const { id } = req.params;

  const data = await cacheGet(
    'cache:analytics',
    `rounds:${id}`,
    async () => sessionAnalysisService.getGameplayRounds(id),
    600
  );

  sendSuccess(res, data);
};

/**
 * Análisis de tarjetas a nivel de clase.
 * @route GET /api/analytics/classroom/card-analysis
 */
exports.getCardAnalysis = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { timeRange, contextId, limit } = req.query;

  const data = await cacheGet(
    'cache:analytics',
    `cardAnalysis:${teacherId}:${timeRange}:${contextId || 'all'}`,
    async () => sessionAnalysisService.getCardAnalysis(teacherId, { timeRange, contextId, limit }),
    300
  );

  sendSuccess(res, data);
};

/**
 * Momentos de dificultad de un estudiante.
 * @route GET /api/analytics/student/:id/struggles
 */
exports.getStudentStruggles = async (req, res) => {
  const { id } = req.params;
  const { timeRange, minConsecutiveErrors } = req.query;

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);
  await verifyAnalyticsConsent(id);

  const data = await sessionAnalysisService.getStudentStruggles(id, {
    timeRange,
    minConsecutiveErrors
  });

  sendSuccess(res, data);
};

/**
 * Indicadores de fatiga de la clase.
 * @route GET /api/analytics/classroom/fatigue
 */
exports.getClassroomFatigue = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { timeRange } = req.query;

  const data = await cacheGet(
    'cache:analytics',
    `fatigue:${teacherId}:${timeRange}`,
    async () => sessionAnalysisService.getClassroomFatigue(teacherId, { timeRange }),
    300
  );

  sendSuccess(res, data);
};

// ══════════════════════════════════════════════════════════════════════
// Engagement (E09-E11)
// ══════════════════════════════════════════════════════════════════════

/**
 * Engagement individual del estudiante.
 * @route GET /api/analytics/student/:id/engagement
 */
exports.getStudentEngagement = async (req, res) => {
  const { id } = req.params;
  const { timeRange } = req.query;

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);
  await verifyAnalyticsConsent(id);

  const data = await cacheGet(
    'cache:analytics',
    `engagement:${id}:${timeRange}`,
    async () => engagementService.getStudentEngagement(id, { timeRange }),
    300
  );

  sendSuccess(res, data);
};

/**
 * Engagement agregado de la clase.
 * @route GET /api/analytics/classroom/engagement
 */
exports.getClassroomEngagement = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { timeRange, sort, order } = req.query;

  const data = await cacheGet(
    'cache:analytics',
    `classEngagement:${teacherId}:${timeRange}:${sort}:${order}`,
    async () => engagementService.getClassroomEngagement(teacherId, { timeRange, sort, order }),
    300
  );

  sendSuccess(res, data);
};

/**
 * Patrones de juego del estudiante.
 * @route GET /api/analytics/student/:id/play-patterns
 */
exports.getStudentPlayPatterns = async (req, res) => {
  const { id } = req.params;
  const { timeRange } = req.query;

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);
  await verifyAnalyticsConsent(id);

  const data = await engagementService.getStudentPlayPatterns(id, { timeRange });

  sendSuccess(res, data);
};

// ══════════════════════════════════════════════════════════════════════
// Efectividad de contenido (E12-E14)
// ══════════════════════════════════════════════════════════════════════

/**
 * Efectividad de contextos/mecánicas.
 * @route GET /api/analytics/classroom/content-effectiveness
 */
exports.getContentEffectiveness = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { timeRange, groupBy } = req.query;

  const data = await cacheGet(
    'cache:analytics',
    `contentEffectiveness:${teacherId}:${timeRange}:${groupBy}`,
    async () =>
      contentEffectivenessService.getContentEffectiveness(teacherId, { timeRange, groupBy }),
    300
  );

  sendSuccess(res, data);
};

/**
 * Tarjetas con dificultad alta.
 * @route GET /api/analytics/classroom/card-difficulty
 */
exports.getCardDifficulty = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { timeRange, contextId, threshold } = req.query;

  const data = await cacheGet(
    'cache:analytics',
    `cardDifficulty:${teacherId}:${timeRange}:${contextId || 'all'}:${threshold}`,
    async () =>
      contentEffectivenessService.getCardDifficulty(teacherId, {
        timeRange,
        contextId,
        threshold
      }),
    300
  );

  sendSuccess(res, data);
};

/**
 * Curvas de aprendizaje por contenido.
 * @route GET /api/analytics/classroom/learning-curves
 */
exports.getLearningCurves = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { timeRange, contextId, mechanicId } = req.query;

  const data = await cacheGet(
    'cache:analytics',
    `learningCurves:${teacherId}:${timeRange}:${contextId || 'all'}:${mechanicId || 'all'}`,
    async () =>
      contentEffectivenessService.getLearningCurves(teacherId, {
        timeRange,
        contextId,
        mechanicId
      }),
    300
  );

  sendSuccess(res, data);
};

// ══════════════════════════════════════════════════════════════════════
// Reportes y exportación (E17-E19)
// ══════════════════════════════════════════════════════════════════════

/**
 * Reporte completo de un estudiante.
 * @route GET /api/analytics/reports/student/:id
 */
exports.getStudentReport = async (req, res) => {
  const { id } = req.params;
  const { timeRange, format } = req.query;

  await ensureStudentBelongsToTeacher(id, req.user, userRepository);
  await verifyAnalyticsConsent(id);

  const data = await cacheGet(
    'cache:analytics',
    `report:student:${id}:${timeRange}:${format}`,
    async () => reportDataService.getStudentReport(id, { timeRange, format }),
    600
  );

  sendSuccess(res, data);
};

/**
 * Reporte completo de la clase.
 * @route GET /api/analytics/reports/classroom
 */
exports.getClassroomReport = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { timeRange, format } = req.query;

  const data = await cacheGet(
    'cache:analytics',
    `report:classroom:${teacherId}:${timeRange}:${format}`,
    async () => reportDataService.getClassroomReport(teacherId, { timeRange, format }),
    600
  );

  sendSuccess(res, data);
};

/**
 * Datos tabulares para exportación CSV.
 * @route GET /api/analytics/reports/classroom/export
 */
exports.getClassroomExport = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { timeRange } = req.query;

  const data = await reportDataService.getClassroomExport(teacherId, { timeRange });

  sendSuccess(res, data);
};

/**
 * Obtiene resumen de alertas (conteos por severidad y tipo).
 * @route GET /api/analytics/alerts/summary
 */
exports.getAlertsSummary = async (req, res) => {
  const teacherId = req.user._id.toString();

  const data = await cacheGet(
    'cache:analytics',
    `alertsSummary:${teacherId}`,
    async () => alertsService.getAlertsSummary(teacherId),
    600
  );

  sendSuccess(res, data);
};
