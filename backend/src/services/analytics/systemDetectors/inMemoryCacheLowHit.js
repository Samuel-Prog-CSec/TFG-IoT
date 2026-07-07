/**
 * @fileoverview Detector: hit ratio bajo en cache LRU memoria (T-910 Fase A).
 *
 * Computa el hit ratio agregado de las tres instancias LRU en memoria
 * (`authUser`, `mechanic`, `context`) expuestas por `runtimeMetrics`.
 * Mantiene una ventana de N muestras en memoria del detector y dispara
 * `warning` cuando todas las muestras de la ventana están por debajo del
 * umbral configurado.
 *
 * Un hit ratio bajo sostenido indica una de tres situaciones:
 *   - Invalidación excesiva (mutaciones que limpian el cache demasiado).
 *   - Reinicios frecuentes (cada arranque empieza con cache frío).
 *   - Mal sizing (TTL demasiado corto o `max` muy bajo).
 *
 * El umbral por defecto (40%) es conservador: por debajo de ese valor el
 * cache LRU deja de aportar ahorro sustancial frente a Redis.
 *
 * @module services/analytics/systemDetectors/inMemoryCacheLowHit
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

// Ventana de muestras en memoria del propio detector. Mismo patrón que
// `redisLatencyBuffer` en systemAlertDetectionService: se pierde tras
// reinicio del proceso, lo que es aceptable (la primera corrida sin
// suficientes muestras devuelve []).
const HIT_RATIO_BUFFER = [];

const _resetBuffer = () => {
  HIT_RATIO_BUFFER.length = 0;
};

/**
 * Calcula hit ratio agregado de las 3 instancias LRU.
 * Devuelve `null` si el total de lookups es menor que `minLookups`
 * (evita falsos positivos en arranques con poco tráfico).
 */
const computeAggregateHitRatio = (inMemoryCache, minLookups) => {
  if (!inMemoryCache || typeof inMemoryCache !== 'object') {
    return null;
  }
  let totalHits = 0;
  let totalLookups = 0;
  for (const stats of Object.values(inMemoryCache)) {
    const hits = Number(stats?.hits) || 0;
    const misses = Number(stats?.misses) || 0;
    totalHits += hits;
    totalLookups += hits + misses;
  }
  if (totalLookups < minLookups) {
    return null;
  }
  return totalHits / totalLookups;
};

class InMemoryCacheLowHitDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'in_memory_cache_low_hit', source: 'memory' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.in_memory_cache_low_hit;
    const inMemoryCache = ctx.runtimeMetrics?.redis?.inMemoryCache;
    const ratio = computeAggregateHitRatio(inMemoryCache, cfg.thresholds.minLookups);
    if (ratio === null) {
      // Sin suficientes lookups: no añadimos muestra ni evaluamos.
      return [];
    }

    HIT_RATIO_BUFFER.push(ratio);
    if (HIT_RATIO_BUFFER.length > cfg.thresholds.sustainedSamples) {
      HIT_RATIO_BUFFER.shift();
    }

    if (HIT_RATIO_BUFFER.length < cfg.thresholds.sustainedSamples) {
      return [];
    }

    const allLow = HIT_RATIO_BUFFER.every(r => r < cfg.thresholds.warningHitRatio);
    if (!allLow) {
      return [];
    }

    const currentPercent = Math.round(ratio * 1000) / 10;
    const warningPercent = Math.round(cfg.thresholds.warningHitRatio * 1000) / 10;

    return [
      {
        type: this.type,
        severity: 'warning',
        source: this.source,
        component: 'cache:lru-memory',
        title: cfg.label,
        description: `Hit ratio agregado del cache LRU en memoria: ${currentPercent}% (umbral ${warningPercent}% sostenido en ${cfg.thresholds.sustainedSamples} muestras).`,
        recommendation:
          'Investiga si hay invalidaciones excesivas o reinicios frecuentes. Considera revisar TTL/max de las instancias LRU.',
        data: {
          currentRatio: Math.round(ratio * 1000) / 1000,
          warningRatio: cfg.thresholds.warningHitRatio,
          samples: HIT_RATIO_BUFFER.map(r => Math.round(r * 1000) / 1000),
          sustainedSamples: cfg.thresholds.sustainedSamples
        },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

const instance = new InMemoryCacheLowHitDetector();
instance._resetBuffer = _resetBuffer;
module.exports = instance;
