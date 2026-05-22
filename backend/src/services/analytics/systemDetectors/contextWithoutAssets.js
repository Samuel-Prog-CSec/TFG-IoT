/**
 * @fileoverview Detector: contextos sin assets pasado el plazo (T-942).
 *
 * Busca contextos creados hace ≥24h con array de assets vacío. Emite un
 * único finding agregado con el conteo y un ejemplo.
 *
 * @module services/analytics/systemDetectors/contextWithoutAssets
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');
const GameContext = require('../../../models/GameContext');
const logger = require('../../../utils/logger').child({
  component: 'detector.contextWithoutAssets'
});

class ContextWithoutAssetsDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'context_without_assets', source: 'moderation' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.context_without_assets;
    try {
      const cutoff = new Date(now.getTime() - cfg.thresholds.warningHours * 60 * 60 * 1000);
      const offenders = await GameContext.find({
        createdAt: { $lte: cutoff },
        $or: [{ assets: { $size: 0 } }, { assets: { $exists: false } }]
      })
        .select('name contextId createdAt')
        .lean();

      if (!offenders.length) {
        return [];
      }

      const example = offenders[0];
      return [
        {
          type: this.type,
          severity: 'warning',
          source: this.source,
          component: 'moderation:contexts',
          title: cfg.label,
          description: `${offenders.length} contexto(s) llevan ≥${cfg.thresholds.warningHours} h sin assets.`,
          recommendation: 'Completa los assets del contexto o archívalo para evitar mazos vacíos.',
          data: {
            count: offenders.length,
            example: {
              id: String(example._id),
              name: example.name,
              contextId: example.contextId
            }
          },
          runbookUrl: cfg.defaultRunbook,
          detectedAt: now
        }
      ];
    } catch (err) {
      logger.warn('contextWithoutAssets: error de query', { error: err.message });
      return [];
    }
  }
}

module.exports = new ContextWithoutAssetsDetector();
