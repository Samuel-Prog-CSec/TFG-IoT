/**
 * @fileoverview Registro central de detectores de alertas (T-941).
 *
 * Importa cada detector y los expone como array para que el servicio
 * `alertDetectionService` itere por todos sin acoplarse al catálogo concreto.
 *
 * Para añadir un detector nuevo:
 *   1. Crear archivo en este directorio extendiendo `AlertDetector`.
 *   2. Registrarlo aquí en `ALL_DETECTORS`.
 *   3. Añadir su tipo a `config/alerts.js` ALERT_TYPES.
 *   4. (Opcional) Añadir test en `backend/tests/services/analytics/detectors/`.
 *
 * @module services/analytics/detectors
 */

const decliningPerformance = require('./decliningPerformance');
const inactivity = require('./inactivity');
const suddenScoreDrop = require('./suddenScoreDrop');
const consistentTimeout = require('./consistentTimeout');
const improvingFast = require('./improvingFast');
const highAbandonment = require('./highAbandonment');
const plateauDetected = require('./plateauDetected');
const engagementDrop = require('./engagementDrop');
const recoveryAfterDrop = require('./recoveryAfterDrop');
const masteryMilestone = require('./masteryMilestone');
const mechanicSpecificStruggle = require('./mechanicSpecificStruggle');
const sequenceStagnation = require('./sequenceStagnation');
const sequenceOrderErrors = require('./sequenceOrderErrors');

const ALL_DETECTORS = Object.freeze([
  decliningPerformance,
  inactivity,
  suddenScoreDrop,
  consistentTimeout,
  improvingFast,
  highAbandonment,
  plateauDetected,
  engagementDrop,
  recoveryAfterDrop,
  masteryMilestone,
  mechanicSpecificStruggle,
  sequenceStagnation,
  sequenceOrderErrors
]);

const DETECTOR_BY_TYPE = Object.freeze(
  ALL_DETECTORS.reduce((map, det) => {
    map[det.type] = det;
    return map;
  }, {})
);

module.exports = {
  ALL_DETECTORS,
  DETECTOR_BY_TYPE
};
