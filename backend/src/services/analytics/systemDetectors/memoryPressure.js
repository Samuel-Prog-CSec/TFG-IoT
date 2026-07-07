/**
 * @fileoverview Detector: memoria al límite (T-942).
 *
 * Lee `runtimeMetrics.memory.percentUsed`. Umbrales (overrideables):
 *   - warning ≥85%
 *   - critical ≥95%
 *
 * @module services/analytics/systemDetectors/memoryPressure
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

class MemoryPressureDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'memory_pressure', source: 'memory' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.memory_pressure;
    const pct = ctx.runtimeMetrics?.memory?.percentUsed;
    if (typeof pct !== 'number' || Number.isNaN(pct)) {
      return [];
    }
    if (pct < cfg.thresholds.warningPct) {
      return [];
    }

    const severity = pct >= cfg.thresholds.criticalPct ? 'critical' : 'warning';
    const heapUsedMB = ctx.runtimeMetrics?.memory?.heapUsedMB;
    const heapTotalMB = ctx.runtimeMetrics?.memory?.heapTotalMB;
    // (A5) percentUsed es RSS / límite del contenedor (no heapUsed/heapTotal).
    const rssMB = ctx.runtimeMetrics?.memory?.rssMB;
    const memoryLimitMB = ctx.runtimeMetrics?.memory?.memoryLimitMB;
    const threshold =
      severity === 'critical' ? cfg.thresholds.criticalPct : cfg.thresholds.warningPct;

    const usageLabel =
      typeof rssMB === 'number' && typeof memoryLimitMB === 'number'
        ? ` (${rssMB}/${memoryLimitMB} MB RSS)`
        : '';

    return [
      {
        type: this.type,
        severity,
        source: this.source,
        // Clave de dedup estable (no cambiar): permite que una alerta previa se
        // re-evalúe con la métrica RSS corregida y se auto-resuelva. Métrica real: RSS.
        component: 'process:heap',
        title: cfg.label,
        description: `Uso de memoria al ${pct.toFixed(1)}%${usageLabel} (umbral ${threshold}%).`,
        recommendation:
          severity === 'critical'
            ? 'Reinicia el proceso si es seguro. Investiga fugas (heap snapshot).'
            : 'Vigila el consumo. Considera reciclaje preventivo.',
        data: { percentUsed: pct, rssMB, memoryLimitMB, heapUsedMB, heapTotalMB, threshold },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

module.exports = new MemoryPressureDetector();
