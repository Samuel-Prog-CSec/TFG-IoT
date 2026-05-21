/**
 * @fileoverview Detector: almacenamiento Atlas cerca del límite (T-910 Fase A).
 *
 * Lee `db.stats({ scale: 1 })` de la conexión Mongoose viva y compara
 * `dataSize + indexSize` contra el presupuesto configurable (512 MB por
 * defecto, free tier M0).
 *
 * El detector worker corre cada 5 min; `db.stats()` no es gratis en M0
 * (consume conexiones del pool compartido y golpea la CPU shared). Para
 * evitar 12 llamadas por hora cuando una por hora basta, el detector
 * cachea el último resultado en memoria del módulo durante una hora.
 *
 * Si la BD no está accesible (`readyState !== 1`) o `db.stats()` falla,
 * el detector devuelve `[]` y deja que `mongo_disconnected` cubra el
 * fallo subyacente (separación de responsabilidades).
 *
 * @module services/analytics/systemDetectors/atlasStorageQuota
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

const STATS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 h

// Cache en memoria del módulo. Reutilizado entre corridas del worker.
// Se reinicia al reiniciar el proceso (aceptable: la primera corrida
// volverá a tocar Atlas, que es lo que queremos al arrancar).
let statsCache = { value: null, fetchedAt: 0 };

/**
 * Helper auxiliar para invalidar el cache desde tests sin depender del
 * reloj real. No documentado en el módulo público.
 */
const _resetStatsCache = () => {
  statsCache = { value: null, fetchedAt: 0 };
};

class AtlasStorageQuotaDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'atlas_storage_quota', source: 'mongo' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.atlas_storage_quota;
    const budgetMB = cfg.thresholds.storageBudgetMB;

    // Escape hatch: budget = 0 desactiva el detector (dev local).
    if (!budgetMB || budgetMB <= 0) {
      return [];
    }

    const conn = ctx.mongooseConn;
    if (!conn || conn.readyState !== 1 || !conn.db) {
      return [];
    }

    const cacheAge = Date.now() - statsCache.fetchedAt;
    let stats = statsCache.value;
    if (!stats || cacheAge >= STATS_CACHE_TTL_MS) {
      try {
        stats = await conn.db.stats({ scale: 1 });
        statsCache = { value: stats, fetchedAt: Date.now() };
      } catch {
        // El error subyacente lo gestionan los detectores de
        // disponibilidad; aquí simplemente abortamos sin propagar.
        return [];
      }
    }

    const dataSize = Number(stats?.dataSize) || 0;
    const indexSize = Number(stats?.indexSize) || 0;
    const usedBytes = dataSize + indexSize;
    const budgetBytes = budgetMB * 1024 * 1024;
    if (budgetBytes <= 0) {
      return [];
    }

    const pct = (usedBytes / budgetBytes) * 100;
    if (pct < cfg.thresholds.warningPct) {
      return [];
    }

    const severity = pct >= cfg.thresholds.criticalPct ? 'critical' : 'warning';
    const threshold =
      severity === 'critical' ? cfg.thresholds.criticalPct : cfg.thresholds.warningPct;
    const usedMB = Math.round((usedBytes / (1024 * 1024)) * 10) / 10;
    const dataSizeMB = Math.round((dataSize / (1024 * 1024)) * 10) / 10;
    const indexSizeMB = Math.round((indexSize / (1024 * 1024)) * 10) / 10;

    return [
      {
        type: this.type,
        severity,
        source: this.source,
        component: 'atlas:storage',
        title: cfg.label,
        description: `Atlas storage usado ${usedMB} MB de ${budgetMB} MB (${pct.toFixed(1)}%, datos ${dataSizeMB} MB + índices ${indexSizeMB} MB).`,
        recommendation:
          severity === 'critical'
            ? 'Ejecuta retención de datos (`npm run data:retention`), purga `smartalerts` antiguos y considera escalar a Atlas M2.'
            : 'Revisa Runbook §13a. Programa retención y audita colecciones más pesadas.',
        data: {
          usedMB,
          budgetMB,
          pct: Math.round(pct * 10) / 10,
          threshold,
          dataSizeMB,
          indexSizeMB,
          cachedAgeMs: Math.max(0, cacheAge)
        },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

const instance = new AtlasStorageQuotaDetector();
instance._resetStatsCache = _resetStatsCache;
module.exports = instance;
