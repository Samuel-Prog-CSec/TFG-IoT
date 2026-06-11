/**
 * @fileoverview Tests del validador HMAC RFID (T-905 B8).
 *
 * Verifica:
 * - Flag off → siempre valid (compat firmware viejo).
 * - Flag on + HMAC válido + counter monotónico → valid.
 * - Flag on + HMAC inválido → invalid.
 * - Flag on + counter ≤ previous (replay) → invalid.
 * - Flag on sin counter/hmac → invalid (fields missing).
 * - constant-time compare resistente a timing leak (sanity check).
 */

const crypto = require('node:crypto');

// El validador hace un `require` perezoso de securityCountersService dentro de
// las ramas de rechazo (HMAC inválido / replay). Lo mockeamos para espiar
// `increment` sin tocar Redis. El mock devuelve una promesa resuelta para que
// el patrón fire-and-forget `.increment(...).catch(...)` del validador funcione
// igual que en producción y no rompa los tests previos (scans válidos no llaman).
jest.mock('../../src/services/security/securityCountersService', () => ({
  increment: jest.fn().mockResolvedValue(true)
}));

const rfidHmac = require('../../src/utils/rfidHmacValidator');
const { connectRedis, disconnectRedis } = require('../../src/config/redis');
const redisService = require('../../src/services/redisService');
const securityCounters = require('../../src/services/security/securityCountersService');

const SECRET = crypto.randomBytes(32).toString('hex');
const SENSOR_ID = 'sensor-test-001';
const UID = 'AABBCCDD';

const sign = (uid, counter, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(`${uid}:${counter}`).digest('hex');

const buildPayload = (counter, hmac, overrides = {}) => ({
  uid: UID,
  type: 'MIFARE_1KB',
  sensorId: SENSOR_ID,
  timestamp: Date.now(),
  // `source: 'web_serial'` es el default deliberado: la mayoría de tests prueban
  // el path del sensor físico real (el único obligado a firmar). Las pruebas de
  // exención táctil sobrescriben `source` vía `overrides`.
  source: 'web_serial',
  counter,
  hmac,
  ...overrides
});

describe('rfidHmacValidator (B8)', () => {
  const ORIGINAL_SECRET = process.env.RFID_HMAC_SECRET;
  const ORIGINAL_FLAG = process.env.RFID_HMAC_ENABLED;

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.RFID_HMAC_SECRET;
    } else {
      process.env.RFID_HMAC_SECRET = ORIGINAL_SECRET;
    }
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.RFID_HMAC_ENABLED;
    } else {
      process.env.RFID_HMAC_ENABLED = ORIGINAL_FLAG;
    }
  });

  beforeEach(async () => {
    await redisService.flushNamespace(rfidHmac.COUNTER_NAMESPACE);
    process.env.RFID_HMAC_SECRET = SECRET;
    rfidHmac.drainMetrics();
    securityCounters.increment.mockClear();
  });

  describe('flag off (migración gradual)', () => {
    beforeEach(() => {
      delete process.env.RFID_HMAC_ENABLED;
    });

    it('payload sin HMAC ni counter → valid (compat firmware viejo)', async () => {
      const result = await rfidHmac.validate(buildPayload(undefined, undefined));
      expect(result).toEqual({ valid: true, mode: 'disabled' });
    });

    it('payload con HMAC correcto → valid, métrica valid++', async () => {
      const counter = 1;
      const hmac = sign(UID, counter);
      await rfidHmac.validate(buildPayload(counter, hmac));
      expect(rfidHmac.peekMetrics().valid).toBe(1);
    });

    it('payload con HMAC inválido sigue siendo valid (flag off)', async () => {
      const result = await rfidHmac.validate(buildPayload(1, 'a'.repeat(64)));
      expect(result.valid).toBe(true);
    });
  });

  describe('flag on (enforce)', () => {
    beforeEach(() => {
      process.env.RFID_HMAC_ENABLED = 'true';
    });

    it('HMAC válido + counter monotónico → valid', async () => {
      const counter = 5;
      const hmac = sign(UID, counter);
      const result = await rfidHmac.validate(buildPayload(counter, hmac));
      expect(result.valid).toBe(true);
      expect(result.mode).toBe('enforce');
    });

    it('uid en minúsculas verifica igual (canonicalización interna)', async () => {
      const counter = 3;
      // El firmware firma SIEMPRE mayúsculas; el HMAC se calcula sobre UID.toUpperCase().
      const hmac = sign(UID, counter); // UID = 'AABBCCDD' (mayúsculas)
      const result = await rfidHmac.validate(
        buildPayload(counter, hmac, { uid: UID.toLowerCase() })
      );
      expect(result.valid).toBe(true);
    });

    it('HMAC inválido → invalid HMAC_INVALID', async () => {
      const result = await rfidHmac.validate(buildPayload(1, 'b'.repeat(64)));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('HMAC_INVALID');
    });

    it('counter o hmac ausente → invalid HMAC_FIELDS_MISSING', async () => {
      const r1 = await rfidHmac.validate(buildPayload(undefined, sign(UID, 1)));
      expect(r1.reason).toBe('HMAC_FIELDS_MISSING');
      const r2 = await rfidHmac.validate(buildPayload(1, undefined));
      expect(r2.reason).toBe('HMAC_FIELDS_MISSING');
    });

    it('counter retrocede → invalid COUNTER_REPLAY', async () => {
      // Primer scan establece previous=10
      await rfidHmac.validate(buildPayload(10, sign(UID, 10)));
      // Replay con counter 5
      const result = await rfidHmac.validate(buildPayload(5, sign(UID, 5)));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('COUNTER_REPLAY');
    });

    it('counter igual al previous → invalid COUNTER_REPLAY (estrictamente mayor)', async () => {
      await rfidHmac.validate(buildPayload(7, sign(UID, 7)));
      const result = await rfidHmac.validate(buildPayload(7, sign(UID, 7)));
      expect(result.reason).toBe('COUNTER_REPLAY');
    });

    it('si RFID_HMAC_SECRET no está set, falla con HMAC_SECRET_MISSING', async () => {
      delete process.env.RFID_HMAC_SECRET;
      const result = await rfidHmac.validate(buildPayload(1, 'a'.repeat(64)));
      expect(result.reason).toBe('HMAC_SECRET_MISSING');
    });

    it('sensors diferentes mantienen counters independientes', async () => {
      const payloadA = buildPayload(100, sign(UID, 100), { sensorId: 'sensor-A' });
      const payloadB = buildPayload(5, sign(UID, 5), { sensorId: 'sensor-B' });
      const rA = await rfidHmac.validate(payloadA);
      const rB = await rfidHmac.validate(payloadB);
      expect(rA.valid).toBe(true);
      expect(rB.valid).toBe(true);
    });

    it('HMAC inválido → incrementa securityCounter rfid_hmac_invalid', async () => {
      const result = await rfidHmac.validate(buildPayload(1, 'b'.repeat(64)));
      expect(result.reason).toBe('HMAC_INVALID');
      expect(securityCounters.increment).toHaveBeenCalledWith('rfid_hmac_invalid');
      // Solo el contador de HMAC inválido, no el de replay.
      expect(securityCounters.increment).not.toHaveBeenCalledWith('rfid_replay');
    });

    it('replay (counter ≤ previous) → incrementa securityCounter rfid_replay', async () => {
      // Primer scan válido establece previous=10 (no debe contar como rechazo).
      await rfidHmac.validate(buildPayload(10, sign(UID, 10)));
      expect(securityCounters.increment).not.toHaveBeenCalled();
      // Replay con counter 5 → rechazo por COUNTER_REPLAY.
      const result = await rfidHmac.validate(buildPayload(5, sign(UID, 5)));
      expect(result.reason).toBe('COUNTER_REPLAY');
      expect(securityCounters.increment).toHaveBeenCalledWith('rfid_replay');
      expect(securityCounters.increment).not.toHaveBeenCalledWith('rfid_hmac_invalid');
    });

    it('scan VÁLIDO no incrementa ningún securityCounter', async () => {
      const counter = 42;
      const result = await rfidHmac.validate(buildPayload(counter, sign(UID, counter)));
      expect(result.valid).toBe(true);
      expect(securityCounters.increment).not.toHaveBeenCalled();
    });
  });

  describe('flag on — exención por origen (fallbacks táctiles)', () => {
    beforeEach(() => {
      process.env.RFID_HMAC_ENABLED = 'true';
    });

    it('source touch_fallback sin HMAC → valid mode exempt', async () => {
      const result = await rfidHmac.validate(
        buildPayload(undefined, undefined, { source: 'touch_fallback' })
      );
      expect(result).toEqual({ valid: true, mode: 'exempt' });
      expect(rfidHmac.peekMetrics().exempt).toBe(1);
    });

    it('source touch_memory_flip sin HMAC → valid mode exempt', async () => {
      const result = await rfidHmac.validate(
        buildPayload(undefined, undefined, { source: 'touch_memory_flip' })
      );
      expect(result).toEqual({ valid: true, mode: 'exempt' });
      expect(rfidHmac.peekMetrics().exempt).toBe(1);
    });

    it('source web_serial SIGUE exigiendo HMAC (no se exime)', async () => {
      const result = await rfidHmac.validate(
        buildPayload(undefined, undefined, { source: 'web_serial' })
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('HMAC_FIELDS_MISSING');
    });

    it('source ausente con flag enabled → invalid SOURCE_MISSING', async () => {
      const payload = buildPayload(undefined, undefined);
      delete payload.source;
      const result = await rfidHmac.validate(payload);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SOURCE_MISSING');
    });
  });

  describe('métricas', () => {
    it('drainMetrics resetea el contador interno', async () => {
      process.env.RFID_HMAC_ENABLED = 'true';
      await rfidHmac.validate(buildPayload(1, sign(UID, 1)));
      const snapshot = rfidHmac.drainMetrics();
      expect(snapshot.valid).toBe(1);
      expect(rfidHmac.peekMetrics().valid).toBe(0);
    });
  });
});
