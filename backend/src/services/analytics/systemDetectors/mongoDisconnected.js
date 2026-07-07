/**
 * @fileoverview Detector: MongoDB desconectado (T-942).
 *
 * Evalúa `mongoose.connection.readyState`:
 *   0=disconnected, 1=connected, 2=connecting, 3=disconnecting
 *
 * Exige `downSamples` muestras consecutivas con state≠1 para evitar falsos
 * positivos durante reinicios cortos.
 *
 * @module services/analytics/systemDetectors/mongoDisconnected
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

const READY_STATE_LABEL = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

class MongoDisconnectedDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'mongo_disconnected', source: 'mongo' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.mongo_disconnected;
    const samples = Array.isArray(ctx.mongoStateSamples) ? ctx.mongoStateSamples : [];
    if (samples.length < cfg.thresholds.downSamples) {
      return [];
    }

    const recent = samples.slice(-cfg.thresholds.downSamples);
    const allDown = recent.every(s => s !== 1);
    if (!allDown) {
      return [];
    }

    const lastState = recent[recent.length - 1];

    return [
      {
        type: this.type,
        severity: 'critical',
        source: this.source,
        component: 'mongoose:default',
        title: cfg.label,
        description: `La conexión a MongoDB lleva ${recent.length} muestras en estado ${READY_STATE_LABEL[lastState] || lastState}.`,
        recommendation:
          'Revisa el cluster Mongo, el endpoint y las credenciales. Reinicia si es necesario.',
        data: {
          readyState: lastState,
          readyStateLabel: READY_STATE_LABEL[lastState] || String(lastState),
          samples: recent
        },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

module.exports = new MongoDisconnectedDetector();
