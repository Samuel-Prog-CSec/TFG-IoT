/**
 * @fileoverview Registro central de detectores de alertas de sistema (T-942).
 *
 * Para añadir un detector nuevo:
 *   1. Crear archivo en este directorio extendiendo `SystemAlertDetector`.
 *   2. Registrarlo aquí en `ALL_SYSTEM_DETECTORS`.
 *   3. Añadir su tipo a `config/systemAlerts.js` SYSTEM_ALERT_TYPES.
 *   4. Añadir su icono/label en `frontend/src/constants/systemAlertTypes.js`.
 *   5. Test en `backend/tests/services/analytics/systemDetectors/`.
 *
 * @module services/analytics/systemDetectors
 */

const redisHighLatency = require('./redisHighLatency');
const mongoDisconnected = require('./mongoDisconnected');
const memoryPressure = require('./memoryPressure');
const queueBacklog = require('./queueBacklog');
const upstashCommandsQuota = require('./upstashCommandsQuota');
const atlasStorageQuota = require('./atlasStorageQuota');
const rateLimitStoreFallback = require('./rateLimitStoreFallback');
const inMemoryCacheLowHit = require('./inMemoryCacheLowHit');
const accountLockoutSpike = require('./accountLockoutSpike');
const authFailedSpike = require('./authFailedSpike');
const tokenTheftDetected = require('./tokenTheftDetected');
const rfidHmacSpike = require('./rfidHmacSpike');
const pendingTeachersAging = require('./pendingTeachersAging');
const inactiveTeachers = require('./inactiveTeachers');
const contextWithoutAssets = require('./contextWithoutAssets');
const dataRetentionLag = require('./dataRetentionLag');
const consentWithdrawalSpike = require('./consentWithdrawalSpike');
const adminApprovalSpike = require('./adminApprovalSpike');

const ALL_SYSTEM_DETECTORS = Object.freeze([
  redisHighLatency,
  mongoDisconnected,
  memoryPressure,
  queueBacklog,
  upstashCommandsQuota,
  atlasStorageQuota,
  rateLimitStoreFallback,
  inMemoryCacheLowHit,
  accountLockoutSpike,
  authFailedSpike,
  tokenTheftDetected,
  rfidHmacSpike,
  pendingTeachersAging,
  inactiveTeachers,
  contextWithoutAssets,
  dataRetentionLag,
  consentWithdrawalSpike,
  adminApprovalSpike
]);

const SYSTEM_DETECTOR_BY_TYPE = Object.freeze(
  ALL_SYSTEM_DETECTORS.reduce((map, det) => {
    map[det.type] = det;
    return map;
  }, {})
);

module.exports = {
  ALL_SYSTEM_DETECTORS,
  SYSTEM_DETECTOR_BY_TYPE
};
