/**
 * @fileoverview Controller de métricas de salud específicas del pipeline RFID.
 *
 * Expone endpoints granulares (health, counters, rates) consumibles por
 * dashboards de profesor y por monitorización externa, separados de las
 * métricas runtime generales (`/api/metrics`, `healthController.js`).
 *
 * @module controllers/metricsController
 */

const rfidService = require('../services/rfidService');
const rfidHmacValidator = require('../utils/rfidHmacValidator');
const { sendSuccess } = require('../utils/responseHelper');

/**
 * Snapshot de salud del sensor RFID con tasas computadas y rating
 * cualitativo (`ok | degraded | down`).
 *
 * @route GET /api/metrics/rfid
 * @access Private (Teacher / Super_Admin)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getRfidHealth = (req, res) => {
  const snapshot = rfidService.getHealthSnapshot();

  // Enriquecer con métricas del GameEngine si está disponible: ratio de
  // scans ignorados sobre el total ayuda a detectar tarjetas mal asignadas.
  const gameEngine = req.app.get('gameEngine');
  let engineSnippet = null;
  if (gameEngine && typeof gameEngine.getMetrics === 'function') {
    const engineMetrics = gameEngine.getMetrics();
    const total = engineMetrics?.metrics?.totalCardScans ?? 0;
    const ignored = engineMetrics?.metrics?.ignoredCardScans ?? 0;
    const ignoredRatio = total > 0 ? Math.round((ignored / total) * 1000) / 10 : 0;
    engineSnippet = {
      activePlays: engineMetrics?.activePlays ?? 0,
      totalCardScans: total,
      ignoredCardScans: ignored,
      ignoredScanRatioPct: ignoredRatio,
      lockContention: engineMetrics?.metrics?.lockContention ?? 0
    };
  }

  // T-905 B8: observabilidad de la firma HMAC (contadores por instancia desde el arranque).
  const security = {
    hmacEnabled: rfidHmacValidator.isEnabled(),
    ...rfidHmacValidator.peekMetrics() // valid, invalid, absent, replay, exempt
  };

  sendSuccess(res, {
    ...snapshot,
    security,
    gameEngine: engineSnippet,
    timestamp: new Date().toISOString()
  });
};

module.exports = { getRfidHealth };
