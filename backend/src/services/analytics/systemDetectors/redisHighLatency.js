/**
 * @fileoverview Detector: latencia elevada en Redis (T-942).
 *
 * Lee `runtimeMetrics.redis.avgLatencyMs` y mantiene una ventana corta de
 * muestras (en memoria del propio servicio orquestador) para exigir
 * "sostenido". El detector recibe la ventana en `ctx.redisLatencySamples`.
 *
 * Umbrales (overrideables): warning ≥100ms · critical ≥500ms con
 * `sustainedSamples=3` muestras consecutivas.
 *
 * @module services/analytics/systemDetectors/redisHighLatency
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

class RedisHighLatencyDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'redis_high_latency', source: 'redis' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.redis_high_latency;
    const samples = Array.isArray(ctx.redisLatencySamples) ? ctx.redisLatencySamples : [];
    if (samples.length < cfg.thresholds.sustainedSamples) {
      return [];
    }

    const recent = samples.slice(-cfg.thresholds.sustainedSamples);
    const allHighCritical = recent.every(s => s >= cfg.thresholds.criticalMs);
    const allHighWarning = recent.every(s => s >= cfg.thresholds.warningMs);
    if (!allHighWarning) {
      return [];
    }

    const severity = allHighCritical ? 'critical' : 'warning';
    const lastMs = Math.round(recent[recent.length - 1]);
    const threshold =
      severity === 'critical' ? cfg.thresholds.criticalMs : cfg.thresholds.warningMs;

    return [
      {
        type: this.type,
        severity,
        source: this.source,
        component: 'redis:primary',
        title: cfg.label,
        description: `Latencia media sostenida en ${lastMs} ms (umbral ${threshold} ms en ${recent.length} muestras).`,
        recommendation:
          severity === 'critical'
            ? 'Revisa el servidor Redis: carga, red, pipelines bloqueantes.'
            : 'Monitoriza Redis: si persiste, planifica intervención.',
        data: {
          latestMs: lastMs,
          samples: recent,
          threshold,
          severity
        },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

module.exports = new RedisHighLatencyDetector();
