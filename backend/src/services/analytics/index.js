/**
 * @fileoverview Re-exporta todos los sub-servicios de analytics avanzados.
 *
 * Uso: const { getAlerts, getStudentTrajectory } = require('./analytics');
 *
 * @module services/analytics
 */

module.exports = {
  ...require('./alertsService'),
  ...require('./studentTrajectoryService'),
  ...require('./sessionAnalysisService'),
  ...require('./engagementService'),
  ...require('./contentEffectivenessService'),
  ...require('./reportDataService')
};
