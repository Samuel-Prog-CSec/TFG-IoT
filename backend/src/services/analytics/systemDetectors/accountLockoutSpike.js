/**
 * @fileoverview Detector: pico de bloqueos de cuenta en la última hora (T-942).
 *
 * Lee `ctx.securityCounters.account_locked` (sliding window 1h).
 *
 * @module services/analytics/systemDetectors/accountLockoutSpike
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

class AccountLockoutSpikeDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'account_lockout_spike', source: 'auth' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.account_lockout_spike;
    const count = ctx.securityCounters?.account_locked ?? 0;
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
        component: 'auth:lockouts',
        title: cfg.label,
        description: `Se han bloqueado ${count} cuentas en la última hora (umbral ${threshold}).`,
        recommendation:
          severity === 'critical'
            ? 'Posible ataque distribuido. Revisa logs de auth y considera CAPTCHA reforzado.'
            : 'Vigila la evolución y verifica si hay un patrón concreto.',
        data: { lockoutsLastHour: count, threshold },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

module.exports = new AccountLockoutSpikeDetector();
