/**
 * @fileoverview Tests del detector `rateLimitStoreFallback` (T-910 Fase A).
 */

const detector = require('../../../../src/services/analytics/systemDetectors/rateLimitStoreFallback');

describe('rateLimitStoreFallback detector (T-910)', () => {
  it('NO genera finding si fallbackCount es 0', async () => {
    const findings = await detector.run({
      now: new Date(),
      runtimeMetrics: {
        redis: { rateLimitStoreFallbackCount: 0 }
      }
    });
    expect(findings).toHaveLength(0);
  });

  it('genera finding warning ante cualquier ocurrencia > 0', async () => {
    const findings = await detector.run({
      now: new Date(),
      runtimeMetrics: {
        redis: { rateLimitStoreFallbackCount: 3 }
      }
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].type).toBe('rate_limit_store_fallback');
    expect(findings[0].source).toBe('redis');
    expect(findings[0].data.fallbackCount).toBe(3);
  });

  it('mantiene severity warning incluso con valores altos (no escala a critical aquí)', async () => {
    const findings = await detector.run({
      now: new Date(),
      runtimeMetrics: {
        redis: { rateLimitStoreFallbackCount: 9999 }
      }
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
  });

  it('NO falla si runtimeMetrics es null o el campo no está', async () => {
    expect(await detector.run({})).toEqual([]);
    expect(await detector.run({ runtimeMetrics: {} })).toEqual([]);
    expect(await detector.run({ runtimeMetrics: { redis: {} } })).toEqual([]);
    expect(
      await detector.run({
        runtimeMetrics: { redis: { rateLimitStoreFallbackCount: 'no-numero' } }
      })
    ).toEqual([]);
  });
});
