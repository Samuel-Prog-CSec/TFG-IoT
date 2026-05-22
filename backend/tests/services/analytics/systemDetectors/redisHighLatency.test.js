/**
 * @fileoverview Tests del detector `redisHighLatency` (T-942).
 *
 * Comprueba la lógica "sostenido" — al menos N muestras consecutivas por
 * encima del umbral.
 */

const detector = require('../../../../src/services/analytics/systemDetectors/redisHighLatency');

describe('redisHighLatency detector', () => {
  it('NO genera con menos muestras que el umbral sustainedSamples', async () => {
    expect(await detector.run({ now: new Date(), redisLatencySamples: [200] })).toEqual([]);
    expect(await detector.run({ now: new Date(), redisLatencySamples: [200, 200] })).toEqual([]);
  });

  it('NO genera si una de las muestras está por debajo del warning', async () => {
    const findings = await detector.run({
      now: new Date(),
      redisLatencySamples: [200, 50, 200]
    });
    expect(findings).toHaveLength(0);
  });

  it('genera warning con 3 muestras ≥ 100 ms', async () => {
    const findings = await detector.run({
      now: new Date(),
      redisLatencySamples: [120, 130, 110]
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].type).toBe('redis_high_latency');
    expect(findings[0].source).toBe('redis');
    expect(findings[0].data.samples).toEqual([120, 130, 110]);
  });

  it('genera critical con 3 muestras ≥ 500 ms', async () => {
    const findings = await detector.run({
      now: new Date(),
      redisLatencySamples: [600, 700, 550]
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('toma siempre las últimas N muestras (no las primeras)', async () => {
    const findings = await detector.run({
      now: new Date(),
      redisLatencySamples: [50, 50, 50, 200, 200, 200]
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
  });
});
