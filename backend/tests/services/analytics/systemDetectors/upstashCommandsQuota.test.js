/**
 * @fileoverview Tests del detector `upstashCommandsQuota` (T-910 Fase A).
 */

const detector = require('../../../../src/services/analytics/systemDetectors/upstashCommandsQuota');

const buildCtx = (commandsEstimatedDaily, byCategory = {}) => ({
  now: new Date(),
  runtimeMetrics: {
    redis: {
      commandsEstimatedDaily,
      commandsByCategory: byCategory
    }
  }
});

describe('upstashCommandsQuota detector (T-910)', () => {
  // Default budget = 10 000 (definido en SYSTEM_ALERT_TYPES, sobreescribible
  // vía UPSTASH_DAILY_BUDGET pero los tests usan el default).

  it('NO genera finding si el consumo proyectado < 80% del presupuesto', async () => {
    const findings = await detector.run(buildCtx(7000));
    expect(findings).toHaveLength(0);
  });

  it('genera finding warning entre 80% y 95%', async () => {
    const findings = await detector.run(
      buildCtx(8500, { auth: 4000, ratelimit: 2000, bullmq: 2500 })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].type).toBe('upstash_commands_quota');
    expect(findings[0].source).toBe('redis');
    expect(findings[0].data.estimatedDaily).toBe(8500);
    expect(findings[0].data.dailyBudget).toBe(10000);
    expect(findings[0].data.pct).toBe(85);
    expect(findings[0].data.topCategory).toBe('auth');
    expect(findings[0].data.topCategoryCount).toBe(4000);
  });

  it('genera finding critical cuando ≥ 95%', async () => {
    const findings = await detector.run(buildCtx(9700));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].data.pct).toBe(97);
  });

  it('NO falla si runtimeMetrics no aporta commandsEstimatedDaily', async () => {
    expect(await detector.run({})).toEqual([]);
    expect(await detector.run({ runtimeMetrics: {} })).toEqual([]);
    expect(await detector.run({ runtimeMetrics: { redis: {} } })).toEqual([]);
    expect(
      await detector.run({ runtimeMetrics: { redis: { commandsEstimatedDaily: 'NaN' } } })
    ).toEqual([]);
  });

  it('expone topCategory null cuando todas las categorías están a 0', async () => {
    const findings = await detector.run(buildCtx(8500, { auth: 0, ratelimit: 0 }));
    expect(findings).toHaveLength(1);
    expect(findings[0].data.topCategory).toBeNull();
    expect(findings[0].data.topCategoryCount).toBeNull();
  });
});
