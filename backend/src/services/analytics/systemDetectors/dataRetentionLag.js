/**
 * @fileoverview Detector: job de retención RGPD retrasado (T-942).
 *
 * Lee `ctx.lastRetentionRun`. Si lleva más de las horas configuradas sin
 * completar, emite finding. critical si supera N días.
 *
 * Si `lastRetentionRun=null` (nunca se ejecutó), se considera warning
 * (el cron diario debería haber corrido ya en la primera noche).
 *
 * @module services/analytics/systemDetectors/dataRetentionLag
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

class DataRetentionLagDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'data_retention_lag', source: 'compliance' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.data_retention_lag;
    const lastRun = ctx.lastRetentionRun ? new Date(ctx.lastRetentionRun) : null;

    let ageHours;
    let neverRan = false;

    if (!lastRun) {
      // Si la app lleva más de 36h levantada y nunca se ha ejecutado, lo marcamos.
      // En caso contrario (arranque reciente) lo dejamos pasar.
      const uptimeHours = (process.uptime() || 0) / 3600;
      if (uptimeHours < 36) {
        return [];
      }
      neverRan = true;
      ageHours = uptimeHours;
    } else {
      ageHours = (now.getTime() - lastRun.getTime()) / (60 * 60 * 1000);
    }

    if (ageHours < cfg.thresholds.warningHours) {
      return [];
    }

    const severity = ageHours >= cfg.thresholds.criticalDays * 24 ? 'critical' : 'warning';

    return [
      {
        type: this.type,
        severity,
        source: this.source,
        component: 'compliance:data-retention',
        title: cfg.label,
        description: neverRan
          ? `El job de retención nunca se ha ejecutado (servidor uptime ${Math.floor(ageHours)} h).`
          : `Última ejecución del job de retención hace ${Math.floor(ageHours)} h.`,
        recommendation: 'Revisa el worker de data-retention. Encola manualmente si es necesario.',
        data: {
          lastRunAt: lastRun ? lastRun.toISOString() : null,
          ageHours: Math.round(ageHours),
          severity
        },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

module.exports = new DataRetentionLagDetector();
