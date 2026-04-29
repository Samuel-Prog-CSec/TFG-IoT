/**
 * @fileoverview Tests del endpoint GET /api/metrics/rfid (controller unitario).
 *
 * No arrancamos el servidor completo: probamos el controller con mocks de
 * req/res, lo que es suficiente para verificar contrato del payload y
 * que delega correctamente a `rfidService.getHealthSnapshot()`.
 */

const rfidService = require('../../src/services/rfidService');
const { getRfidHealth } = require('../../src/controllers/metricsController');

const buildRes = () => {
  const status = jest.fn();
  const json = jest.fn();
  const res = { status, json };
  status.mockReturnValue(res);
  json.mockReturnValue(res);
  return res;
};

describe('metricsController — GET /api/metrics/rfid', () => {
  beforeEach(() => {
    // Estado limpio del singleton entre tests.
    rfidService.metrics = {
      totalEventsReceived: 0,
      totalCardDetections: 0,
      totalErrors: 0,
      lastEventTimestamp: null,
      lastScanAt: null,
      lastErrorAt: null,
      connectionUptime: 0,
      lastConnectedAt: null,
      dedupeHits: 0,
      errorsByType: {}
    };
    rfidService._scanTimestamps = [];
    rfidService.status = 'client_ready';
    rfidService.source = 'client';
  });

  it('responde 200 y envuelve el snapshot con responseHelper', () => {
    const req = { app: { get: jest.fn().mockReturnValue(null) } };
    const res = buildRes();

    getRfidHealth(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        service: { status: 'client_ready', source: 'client' },
        health: 'ok',
        counters: expect.any(Object),
        rates: expect.any(Object),
        timestamps: expect.any(Object),
        timestamp: expect.any(String)
      })
    });
  });

  it('marca health=down cuando el servicio no está activo', () => {
    rfidService.status = 'disabled';
    const req = { app: { get: jest.fn().mockReturnValue(null) } };
    const res = buildRes();

    getRfidHealth(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data.health).toBe('down');
  });

  it('refleja contadores tras ingerir scans y errores', () => {
    rfidService.ingestEvent({
      event: 'card_detected',
      uid: 'AABB1122',
      type: 'MIFARE_1KB',
      sensorId: 's1',
      source: 'web_serial'
    });
    rfidService.ingestEvent({
      event: 'error',
      type: 'read_failure',
      message: 'fail',
      source: 'web_serial'
    });
    rfidService.recordDedupeHit();
    rfidService.recordDedupeHit();

    const req = { app: { get: jest.fn().mockReturnValue(null) } };
    const res = buildRes();
    getRfidHealth(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data.counters).toMatchObject({
      totalEvents: 2,
      totalScans: 1,
      dedupeHits: 2,
      errorsByType: { read_failure: 1 }
    });
    // totalErrors agregado en errorsByType y contador escalado
    expect(body.data.counters.totalErrors).toBe(1);
    expect(body.data.timestamps.lastScanAt).toBeGreaterThan(0);
    expect(body.data.timestamps.lastErrorAt).toBeGreaterThan(0);
  });

  it('incluye snapshot del gameEngine si está registrado en app', () => {
    const gameEngine = {
      getMetrics: () => ({
        activePlays: 3,
        metrics: {
          totalCardScans: 100,
          ignoredCardScans: 5,
          lockContention: 0
        }
      })
    };
    const req = { app: { get: jest.fn(name => (name === 'gameEngine' ? gameEngine : null)) } };
    const res = buildRes();
    getRfidHealth(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data.gameEngine).toMatchObject({
      activePlays: 3,
      totalCardScans: 100,
      ignoredCardScans: 5,
      ignoredScanRatioPct: 5
    });
  });
});
