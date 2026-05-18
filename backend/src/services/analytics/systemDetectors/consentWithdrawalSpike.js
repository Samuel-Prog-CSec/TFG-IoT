/**
 * @fileoverview Detector: pico de retiradas de consentimiento parental (T-942).
 *
 * Cuenta entradas `consent.history` con action='withdrawn' en las últimas
 * 24h, agregando sobre todos los alumnos. Umbrales: info ≥5/día, warning ≥20.
 *
 * Esto NO es un evento "negativo" en sí mismo (los tutores tienen derecho
 * pleno a retirar consentimiento por RGPD), pero un pico repentino puede
 * indicar un problema (comunicación masiva, brecha, malestar de un colegio).
 *
 * @module services/analytics/systemDetectors/consentWithdrawalSpike
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');
const User = require('../../../models/User');
const logger = require('../../../utils/logger').child({
  component: 'detector.consentWithdrawalSpike'
});

class ConsentWithdrawalSpikeDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'consent_withdrawal_spike', source: 'compliance' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.consent_withdrawal_spike;
    try {
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const agg = await User.aggregate([
        { $match: { role: 'student', 'consent.history.action': 'withdrawn' } },
        { $unwind: '$consent.history' },
        {
          $match: {
            'consent.history.action': 'withdrawn',
            'consent.history.timestamp': { $gte: since }
          }
        },
        { $count: 'count' }
      ]);
      const count = agg[0]?.count || 0;

      if (count < cfg.thresholds.infoPerDay) {
        return [];
      }

      const severity = count >= cfg.thresholds.warningPerDay ? 'warning' : 'info';

      return [
        {
          type: this.type,
          severity,
          source: this.source,
          component: 'compliance:consent',
          title: cfg.label,
          description: `${count} retirada(s) de consentimiento en las últimas 24h.`,
          recommendation:
            severity === 'warning'
              ? 'Investiga si hay una causa común (comunicación, brecha, malestar). Documenta hallazgos.'
              : 'Pico informativo. Revisa periódicamente.',
          data: { withdrawalsLast24h: count, severity },
          runbookUrl: cfg.defaultRunbook,
          detectedAt: now
        }
      ];
    } catch (err) {
      logger.warn('consentWithdrawalSpike: error de aggregate', { error: err.message });
      return [];
    }
  }
}

module.exports = new ConsentWithdrawalSpikeDetector();
