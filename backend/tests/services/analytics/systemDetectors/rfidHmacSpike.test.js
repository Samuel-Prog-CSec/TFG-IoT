/**
 * @fileoverview Tests del detector `rfidHmacSpike`.
 *
 * Volumen anómalo de rechazos HMAC RFID (firmas inválidas + replays) en la
 * última hora. Lee `ctx.securityCounters.rfid_hmac_invalid` y
 * `ctx.securityCounters.rfid_replay` (sin Redis: se pasan directamente).
 *
 * Umbrales: warningPerHour=10, criticalPerHour=30.
 */

const detector = require('../../../../src/services/analytics/systemDetectors/rfidHmacSpike');

describe('rfidHmacSpike detector', () => {
  it('NO genera finding si el total está por debajo del umbral warning', async () => {
    const findings = await detector.run({
      now: new Date(),
      securityCounters: { rfid_hmac_invalid: 5, rfid_replay: 4 }
    });
    expect(findings).toEqual([]);
  });

  it('genera finding warning cuando el total está entre 10 y 29', async () => {
    const findings = await detector.run({
      now: new Date(),
      securityCounters: { rfid_hmac_invalid: 8, rfid_replay: 7 }
    });
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.type).toBe('rfid_hmac_spike');
    expect(f.severity).toBe('warning');
    expect(f.source).toBe('auth');
    expect(f.component).toBe('rfid:hmac');
    expect(f.data).toEqual({
      invalidLastHour: 8,
      replayLastHour: 7,
      total: 15,
      threshold: 10
    });
  });

  it('justo en el umbral warning (total=10) genera warning', async () => {
    const findings = await detector.run({
      now: new Date(),
      securityCounters: { rfid_hmac_invalid: 10, rfid_replay: 0 }
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
  });

  it('genera finding critical cuando el total alcanza el umbral critical (>=30)', async () => {
    const findings = await detector.run({
      now: new Date(),
      securityCounters: { rfid_hmac_invalid: 20, rfid_replay: 15 }
    });
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.severity).toBe('critical');
    expect(f.data).toEqual({
      invalidLastHour: 20,
      replayLastHour: 15,
      total: 35,
      threshold: 30
    });
  });

  it('no falla y devuelve [] si securityCounters no está presente', async () => {
    expect(await detector.run({})).toEqual([]);
    expect(await detector.run({ securityCounters: {} })).toEqual([]);
  });
});
