const rfidService = require('../src/services/rfidService');

describe('rfidService (modo cliente)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.RFID_SOURCE = 'client';
    jest.restoreAllMocks();
    rfidService.clearEventBuffer();
    rfidService.metrics = {
      totalEventsReceived: 0,
      totalCardDetections: 0,
      totalErrors: 0,
      lastEventTimestamp: null,
      connectionUptime: 0,
      lastConnectedAt: null
    };
    rfidService.status = 'stopped';
    rfidService.source = null;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('inicia en modo cliente y emite estado', () => {
    const emitSpy = jest.spyOn(rfidService, 'emit');

    rfidService.start();

    expect(rfidService.status).toBe('client_ready');
    expect(rfidService.source).toBe('client');
    expect(emitSpy).toHaveBeenCalledWith('status', 'client_ready');
  });

  it('ingiere eventos RFID y actualiza métricas', () => {
    const emitSpy = jest.spyOn(rfidService, 'emit');
    const event = {
      event: 'card_detected',
      uid: '32B8FA05',
      type: 'MIFARE_1KB',
      sensorId: 'sensor-1',
      timestamp: Date.now(),
      source: 'web_serial'
    };

    rfidService.ingestEvent(event);

    expect(rfidService.metrics.totalEventsReceived).toBe(1);
    expect(rfidService.metrics.totalCardDetections).toBe(1);
    expect(emitSpy).toHaveBeenCalledWith('rfid_event', event);
  });

  it('rechaza fuentes no permitidas', () => {
    const emitSpy = jest.spyOn(rfidService, 'emit');

    rfidService.ingestEvent({ event: 'card_detected', source: 'otro' });

    expect(rfidService.metrics.totalErrors).toBe(1);
    expect(emitSpy).not.toHaveBeenCalledWith('rfid_event', expect.any(Object));
  });
});
