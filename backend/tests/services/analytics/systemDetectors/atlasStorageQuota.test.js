/**
 * @fileoverview Tests del detector `atlasStorageQuota` (T-910 Fase A).
 */

const detector = require('../../../../src/services/analytics/systemDetectors/atlasStorageQuota');

const MB = 1024 * 1024;

const buildConn = stats => ({
  readyState: 1,
  db: {
    stats: jest.fn().mockResolvedValue(stats)
  }
});

const buildCtx = (dataSize, indexSize) => ({
  now: new Date(),
  mongooseConn: buildConn({ dataSize, indexSize })
});

describe('atlasStorageQuota detector (T-910)', () => {
  beforeEach(() => {
    // El detector cachea db.stats() en memoria del módulo. Reseteamos para
    // que cada test parta de un estado limpio.
    detector._resetStatsCache();
  });

  it('NO genera finding si el storage usado < 80% del presupuesto', async () => {
    // 200 MB de datos + 50 MB de índices sobre 512 MB → 48.8%
    const findings = await detector.run(buildCtx(200 * MB, 50 * MB));
    expect(findings).toHaveLength(0);
  });

  it('genera finding warning entre 80% y 95%', async () => {
    // 400 MB + 25 MB = 425 MB sobre 512 MB → 83%
    const findings = await detector.run(buildCtx(400 * MB, 25 * MB));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].type).toBe('atlas_storage_quota');
    expect(findings[0].source).toBe('mongo');
    expect(findings[0].data.usedMB).toBeCloseTo(425, 0);
    expect(findings[0].data.budgetMB).toBe(512);
    expect(findings[0].data.pct).toBeGreaterThanOrEqual(80);
    expect(findings[0].data.pct).toBeLessThan(95);
  });

  it('genera finding critical cuando ≥ 95%', async () => {
    // 480 MB + 10 MB = 490 MB sobre 512 MB → 95.7%
    const findings = await detector.run(buildCtx(480 * MB, 10 * MB));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('NO toca Atlas si la conexión no está lista', async () => {
    const conn = buildConn({ dataSize: 480 * MB, indexSize: 0 });
    conn.readyState = 0;
    const findings = await detector.run({ now: new Date(), mongooseConn: conn });
    expect(findings).toEqual([]);
    expect(conn.db.stats).not.toHaveBeenCalled();
  });

  it('devuelve [] sin propagar si db.stats() lanza', async () => {
    const conn = {
      readyState: 1,
      db: { stats: jest.fn().mockRejectedValue(new Error('boom')) }
    };
    const findings = await detector.run({ now: new Date(), mongooseConn: conn });
    expect(findings).toEqual([]);
  });

  it('reutiliza el cache durante la ventana TTL', async () => {
    const conn = buildConn({ dataSize: 400 * MB, indexSize: 25 * MB });
    await detector.run({ now: new Date(), mongooseConn: conn });
    await detector.run({ now: new Date(), mongooseConn: conn });
    await detector.run({ now: new Date(), mongooseConn: conn });
    // Una sola llamada a db.stats() pese a 3 corridas seguidas.
    expect(conn.db.stats).toHaveBeenCalledTimes(1);
  });
});
