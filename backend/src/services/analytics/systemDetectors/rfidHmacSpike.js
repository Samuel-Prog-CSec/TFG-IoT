/**
 * @fileoverview Detector: pico de rechazos HMAC RFID en la última hora.
 *
 * Lee `ctx.securityCounters.rfid_hmac_invalid` (firmas inválidas) y
 * `ctx.securityCounters.rfid_replay` (intentos de replay). Un volumen anómalo
 * combinado puede indicar manipulación del firmware o un ataque de replay sobre
 * el canal del sensor.
 *
 * @module services/analytics/systemDetectors/rfidHmacSpike
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

class RfidHmacSpikeDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'rfid_hmac_spike', source: 'auth' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.rfid_hmac_spike;
    const invalid = ctx.securityCounters?.rfid_hmac_invalid ?? 0;
    const replay = ctx.securityCounters?.rfid_replay ?? 0;
    const total = invalid + replay;
    if (total < cfg.thresholds.warningPerHour) {
      return [];
    }

    const severity = total >= cfg.thresholds.criticalPerHour ? 'critical' : 'warning';
    const threshold =
      severity === 'critical' ? cfg.thresholds.criticalPerHour : cfg.thresholds.warningPerHour;

    return [
      {
        type: this.type,
        severity,
        source: this.source,
        component: 'rfid:hmac',
        title: cfg.label,
        description: `${total} rechazos RFID en la última hora (${invalid} firma inválida, ${replay} replay). Umbral: ${threshold}.`,
        recommendation:
          severity === 'critical'
            ? 'Posible replay o firmware comprometido: rota el secret HMAC y revisa el sensor.'
            : 'Monitoriza: puede ser firmware en actualización o sensor defectuoso.',
        data: { invalidLastHour: invalid, replayLastHour: replay, total, threshold },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

module.exports = new RfidHmacSpikeDetector();
