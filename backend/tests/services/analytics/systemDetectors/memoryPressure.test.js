/**
 * @fileoverview Tests del detector `memoryPressure` (T-942).
 */

const detector = require('../../../../src/services/analytics/systemDetectors/memoryPressure');

describe('memoryPressure detector', () => {
  it('NO genera finding cuando uso de heap < 85%', async () => {
    const findings = await detector.run({
      now: new Date(),
      runtimeMetrics: {
        memory: { percentUsed: 70, heapUsedMB: 100, heapTotalMB: 150 }
      }
    });
    expect(findings).toHaveLength(0);
  });

  it('genera finding warning entre 85% y 95%', async () => {
    const findings = await detector.run({
      now: new Date(),
      runtimeMetrics: {
        memory: { percentUsed: 90, heapUsedMB: 135, heapTotalMB: 150 }
      }
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].source).toBe('memory');
    expect(findings[0].type).toBe('memory_pressure');
    expect(findings[0].data.percentUsed).toBe(90);
  });

  it('genera finding critical cuando ≥ 95%', async () => {
    const findings = await detector.run({
      now: new Date(),
      runtimeMetrics: {
        memory: { percentUsed: 97, heapUsedMB: 145, heapTotalMB: 150 }
      }
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('NO falla si runtimeMetrics es null o incompleto', async () => {
    expect(await detector.run({})).toEqual([]);
    expect(await detector.run({ runtimeMetrics: {} })).toEqual([]);
    expect(await detector.run({ runtimeMetrics: { memory: {} } })).toEqual([]);
  });
});
