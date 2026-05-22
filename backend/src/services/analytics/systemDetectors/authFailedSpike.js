/**
 * @fileoverview Detector: pico de fallos de login en la última hora (T-942).
 *
 * Lee `ctx.securityCounters.auth_failed`.
 *
 * @module services/analytics/systemDetectors/authFailedSpike
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

class AuthFailedSpikeDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'auth_failed_spike', source: 'auth' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.auth_failed_spike;
    const count = ctx.securityCounters?.auth_failed ?? 0;
    if (count < cfg.thresholds.warningPerHour) {
      return [];
    }

    const severity = count >= cfg.thresholds.criticalPerHour ? 'critical' : 'warning';
    const threshold =
      severity === 'critical' ? cfg.thresholds.criticalPerHour : cfg.thresholds.warningPerHour;

    return [
      {
        type: this.type,
        severity,
        source: this.source,
        component: 'auth:login',
        title: cfg.label,
        description: `${count} intentos de login fallidos en la última hora (umbral ${threshold}).`,
        recommendation:
          severity === 'critical'
            ? 'Probable ataque de credential stuffing. Activa medidas reforzadas y revisa IPs.'
            : 'Monitoriza la tendencia: si crece, escala medidas.',
        data: { failedLastHour: count, threshold },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

module.exports = new AuthFailedSpikeDetector();
