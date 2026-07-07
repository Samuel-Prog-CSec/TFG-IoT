/**
 * @fileoverview Detector: rate limit no distribuido (T-910 Fase A).
 *
 * Si algún rate limiter HTTP ha caído a MemoryStore por ausencia de Redis,
 * el contador `runtimeMetrics.redis.rateLimitStoreFallbackCount` queda > 0
 * de forma irreversible hasta el reinicio del proceso. Cualquier valor > 0
 * indica que el rate limit global está fragmentado entre instancias y que
 * un atacante con presencia simultánea en varias instancias podría
 * multiplicar su cuota.
 *
 * No hay umbral cuantitativo: la primera ocurrencia ya es señal. La
 * severidad permanece en `warning` (no `critical`) porque el sistema
 * sigue funcional; la alerta sirve para investigar y, si procede,
 * reiniciar el proceso tras restaurar Redis.
 *
 * @module services/analytics/systemDetectors/rateLimitStoreFallback
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

class RateLimitStoreFallbackDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'rate_limit_store_fallback', source: 'redis' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.rate_limit_store_fallback;
    const count = ctx.runtimeMetrics?.redis?.rateLimitStoreFallbackCount;
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) {
      return [];
    }

    return [
      {
        type: this.type,
        severity: 'warning',
        source: this.source,
        component: 'http:rate-limit',
        title: cfg.label,
        description: `Detectado fallback a MemoryStore en ${count} ocasión(es). El rate limit ya no se comparte entre instancias.`,
        recommendation:
          'Verifica conectividad con Redis. Tras restaurar Redis, reinicia el proceso para reanclar los limiters al store distribuido.',
        data: { fallbackCount: count },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

module.exports = new RateLimitStoreFallbackDetector();
