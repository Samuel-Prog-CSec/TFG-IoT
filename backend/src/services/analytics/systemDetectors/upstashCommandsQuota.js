/**
 * @fileoverview Detector: comandos Upstash cerca del límite diario
 * (T-910 Fase A).
 *
 * Lee `runtimeMetrics.redis.commandsEstimatedDaily` — la proyección lineal
 * del consumo del free tier producida por `redisCommandTracker.js` (T-907 D).
 * Si la proyección supera el `warningPct` del `dailyBudget`, abre un
 * SystemAlert con la categoría que más comandos consume para diagnóstico
 * inmediato.
 *
 * El presupuesto diario por defecto (10 000 comandos) corresponde al free
 * tier conservador 2026 de Upstash, ajustable vía `UPSTASH_DAILY_BUDGET`
 * cuando se migre a un tier de pago o cambien las cuotas del proveedor.
 *
 * Limitación documentada (ADR-167): la proyección es lineal y subestima
 * picos sostenidos. Por eso el umbral 80%/95% se considera conservador;
 * un consumo sostenido al 80% del free tier ya merece atención.
 *
 * @module services/analytics/systemDetectors/upstashCommandsQuota
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

/**
 * Devuelve la categoría con más comandos del snapshot. Si el mapa es
 * vacío o todos los valores son cero, devuelve `null`.
 */
const findTopCategory = (byCategory = {}) => {
  let top = null;
  let topCount = 0;
  for (const [category, count] of Object.entries(byCategory)) {
    if (typeof count === 'number' && count > topCount) {
      top = category;
      topCount = count;
    }
  }
  return top ? { category: top, count: topCount } : null;
};

class UpstashCommandsQuotaDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'upstash_commands_quota', source: 'redis' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.upstash_commands_quota;
    const dailyBudget = cfg.thresholds.dailyBudget;

    // Escape hatch: si el budget se ha puesto a 0 explícitamente, el
    // detector queda desactivado (útil en dev sin cuota de Upstash).
    if (!dailyBudget || dailyBudget <= 0) {
      return [];
    }

    const estimatedDaily = ctx.runtimeMetrics?.redis?.commandsEstimatedDaily;
    if (typeof estimatedDaily !== 'number' || !Number.isFinite(estimatedDaily)) {
      return [];
    }

    const pct = (estimatedDaily / dailyBudget) * 100;
    if (pct < cfg.thresholds.warningPct) {
      return [];
    }

    const severity = pct >= cfg.thresholds.criticalPct ? 'critical' : 'warning';
    const threshold =
      severity === 'critical' ? cfg.thresholds.criticalPct : cfg.thresholds.warningPct;

    const byCategory = ctx.runtimeMetrics?.redis?.commandsByCategory || {};
    const topCategory = findTopCategory(byCategory);
    const topSuffix = topCategory
      ? ` Categoría dominante: ${topCategory.category} (${topCategory.count} comandos).`
      : '';

    return [
      {
        type: this.type,
        severity,
        source: this.source,
        component: 'upstash:commands',
        title: cfg.label,
        description: `Proyección de consumo a 24 h: ${estimatedDaily.toLocaleString('es-ES')} comandos (${pct.toFixed(1)}% del presupuesto ${dailyBudget.toLocaleString('es-ES')}).${topSuffix}`,
        recommendation:
          severity === 'critical'
            ? 'Revisa Runbook §13b y baja `SENTRY_TRACES_SAMPLE_RATE` o la frecuencia de los jobs BullMQ. Considera escalar a Upstash Pay-as-you-go.'
            : 'Vigila el consumo. Identifica el hot path desde `commandsByCategory` y aplica pipelining o cache LRU adicional si aplica.',
        data: {
          estimatedDaily,
          dailyBudget,
          pct: Math.round(pct * 10) / 10,
          threshold,
          topCategory: topCategory ? topCategory.category : null,
          topCategoryCount: topCategory ? topCategory.count : null,
          byCategory: { ...byCategory }
        },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

module.exports = new UpstashCommandsQuotaDetector();
