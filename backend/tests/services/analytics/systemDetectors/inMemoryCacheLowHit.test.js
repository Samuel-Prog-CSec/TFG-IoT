/**
 * @fileoverview Tests del detector `inMemoryCacheLowHit` (T-910 Fase A).
 */

const detector = require('../../../../src/services/analytics/systemDetectors/inMemoryCacheLowHit');

const buildCtx = (authStats, mechanicStats, contextStats) => ({
  now: new Date(),
  runtimeMetrics: {
    redis: {
      inMemoryCache: {
        authUser: authStats,
        mechanic: mechanicStats,
        context: contextStats
      }
    }
  }
});

describe('inMemoryCacheLowHit detector (T-910)', () => {
  beforeEach(() => {
    detector._resetBuffer();
  });

  it('NO evalúa si total lookups < minLookups (50)', async () => {
    // 10 hits + 5 misses = 15 lookups < 50 → no finding
    const findings = await detector.run(
      buildCtx({ hits: 10, misses: 5 }, { hits: 0, misses: 0 }, { hits: 0, misses: 0 })
    );
    expect(findings).toEqual([]);
  });

  it('NO genera finding si hit ratio agregado ≥ 40%', async () => {
    // Lookups suficientes (100) y ratio 60% → no finding
    const ctx = buildCtx({ hits: 60, misses: 40 }, { hits: 0, misses: 0 }, { hits: 0, misses: 0 });
    for (let i = 0; i < 4; i += 1) {
      // Cuatro corridas seguidas, todas por encima del umbral

      const findings = await detector.run(ctx);
      expect(findings).toEqual([]);
    }
  });

  it('NO genera finding si solo una muestra está bajo el umbral', async () => {
    // 3 muestras por encima + 1 por debajo → no sostenido
    const ctxHigh = buildCtx(
      { hits: 80, misses: 20 },
      { hits: 0, misses: 0 },
      { hits: 0, misses: 0 }
    );
    const ctxLow = buildCtx(
      { hits: 20, misses: 80 },
      { hits: 0, misses: 0 },
      { hits: 0, misses: 0 }
    );
    await detector.run(ctxHigh);
    await detector.run(ctxHigh);
    await detector.run(ctxHigh);
    const findings = await detector.run(ctxLow);
    expect(findings).toEqual([]);
  });

  it('genera finding warning tras 4 muestras consecutivas bajo umbral', async () => {
    const ctxLow = buildCtx(
      { hits: 20, misses: 80 }, // 20%
      { hits: 0, misses: 0 },
      { hits: 0, misses: 0 }
    );
    // Primeras 3 muestras: rellenan el buffer pero aún no disparan.
    await detector.run(ctxLow);
    await detector.run(ctxLow);
    await detector.run(ctxLow);
    const findings = await detector.run(ctxLow);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].type).toBe('in_memory_cache_low_hit');
    expect(findings[0].source).toBe('memory');
    expect(findings[0].data.currentRatio).toBeCloseTo(0.2, 2);
    expect(findings[0].data.samples).toHaveLength(4);
  });

  it('agrega hits/misses de las 3 instancias LRU', async () => {
    // Total: 30 hits + 70 misses = 30% → bajo umbral
    const ctxLow = buildCtx(
      { hits: 10, misses: 20 },
      { hits: 10, misses: 30 },
      { hits: 10, misses: 20 }
    );
    await detector.run(ctxLow);
    await detector.run(ctxLow);
    await detector.run(ctxLow);
    const findings = await detector.run(ctxLow);
    expect(findings).toHaveLength(1);
    expect(findings[0].data.currentRatio).toBeCloseTo(0.3, 2);
  });

  it('NO falla si runtimeMetrics está incompleto', async () => {
    expect(await detector.run({})).toEqual([]);
    expect(await detector.run({ runtimeMetrics: {} })).toEqual([]);
    expect(await detector.run({ runtimeMetrics: { redis: {} } })).toEqual([]);
    expect(await detector.run({ runtimeMetrics: { redis: { inMemoryCache: null } } })).toEqual([]);
  });
});
