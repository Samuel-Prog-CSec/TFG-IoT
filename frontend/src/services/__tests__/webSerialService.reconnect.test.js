/**
 * @fileoverview Tests del bucle de reconexión iterativo del WebSerialService.
 *
 * Cubre el bug histórico en el que `attemptReconnect` se llamaba
 * recursivamente desde el `setTimeout` y podía solaparse con un
 * `disconnect()` del usuario, terminando con `port.open` exitoso TRAS la
 * desconexión explícita.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../socket', () => ({
  socketService: {
    emitGameFireAndForget: vi.fn(),
    isGameSocketConnected: vi.fn(() => false)
  }
}));

// Mockeamos el store de IndexedDB para poder aseverar el borrado de los scans
// caducados sin depender de un IndexedDB real (jsdom no lo trae por defecto).
vi.mock('../../lib/pendingScansStore', () => ({
  add: vi.fn().mockResolvedValue(null),
  getAll: vi.fn().mockResolvedValue([]),
  remove: vi.fn().mockResolvedValue(),
  purgeOlderThan: vi.fn().mockResolvedValue(0),
  clear: vi.fn().mockResolvedValue()
}));

let webSerialServiceModule;
let WebSerialServiceCtor;
let socketService;
let pendingScansStore;

beforeEach(async () => {
  vi.resetModules();
  webSerialServiceModule = await import('../webSerialService');
  WebSerialServiceCtor = webSerialServiceModule.webSerialService.constructor;
  ({ socketService } = await import('../socket'));
  pendingScansStore = await import('../../lib/pendingScansStore');

  // Reset de los mocks compartidos entre tests.
  socketService.emitGameFireAndForget.mockReset();
  socketService.isGameSocketConnected.mockReset();
  socketService.isGameSocketConnected.mockReturnValue(false);
  pendingScansStore.remove.mockClear();

  // Mock global navigator.serial
  globalThis.navigator = {
    serial: {
      getPorts: vi.fn().mockResolvedValue([])
    }
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const buildSvc = () => {
  const svc = new WebSerialServiceCtor();
  svc.lastPort = null;
  svc.startReading = vi.fn(); // evita arranque real del stream
  return svc;
};

describe('WebSerialService — reconexión iterativa', () => {
  it('si no hay puertos disponibles, agota los reintentos y emite error final', async () => {
    vi.useFakeTimers();
    const svc = buildSvc();
    svc.autoReconnectEnabled = true;
    const errSpy = vi.fn();
    svc.on('error', errSpy);

    const reconnectPromise = svc.attemptReconnect();
    // Avanzamos lo suficiente para cubrir 3 intentos con backoff (1s + 2s + 4s).
    await vi.advanceTimersByTimeAsync(10_000);
    await reconnectPromise;

    expect(svc.reconnectAttempts).toBe(3);
    expect(errSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Máximo de intentos')
      })
    );
  });

  it('si disconnect() se invoca a mitad del bucle, no abre el puerto', async () => {
    vi.useFakeTimers();
    const svc = buildSvc();
    svc.autoReconnectEnabled = true;
    const fakePort = {
      open: vi.fn().mockResolvedValue(),
      close: vi.fn().mockResolvedValue()
    };
    globalThis.navigator.serial.getPorts.mockResolvedValue([fakePort]);

    const reconnectPromise = svc.attemptReconnect();

    // Justo antes del primer reintento real, simulamos disconnect.
    await vi.advanceTimersByTimeAsync(500);
    svc.autoReconnectEnabled = false;
    svc._reconnectAborted = true;

    await vi.advanceTimersByTimeAsync(2_000);
    await reconnectPromise;

    // El loop puede haber abierto el puerto pero al detectar abort lo cierra.
    expect(fakePort.open).toHaveBeenCalledTimes(0);
    expect(svc.status).not.toBe('connected');
  });

  it('reconecta y arranca lectura cuando aparece un puerto disponible', async () => {
    vi.useFakeTimers();
    const svc = buildSvc();
    svc.autoReconnectEnabled = true;
    const fakePort = {
      open: vi.fn().mockResolvedValue(),
      close: vi.fn().mockResolvedValue()
    };
    globalThis.navigator.serial.getPorts.mockResolvedValue([fakePort]);

    const reconnectPromise = svc.attemptReconnect();
    await vi.advanceTimersByTimeAsync(2_000);
    await reconnectPromise;

    expect(fakePort.open).toHaveBeenCalledTimes(1);
    expect(svc.status).toBe('connected');
    expect(svc.startReading).toHaveBeenCalled();
    expect(svc.reconnectAttempts).toBe(0); // reset tras éxito
  });

  it('llamadas concurrentes a attemptReconnect son no-op (no doble bucle)', async () => {
    vi.useFakeTimers();
    const svc = buildSvc();
    svc.autoReconnectEnabled = true;
    const fakePort = {
      open: vi.fn().mockResolvedValue(),
      close: vi.fn().mockResolvedValue()
    };
    globalThis.navigator.serial.getPorts.mockResolvedValue([fakePort]);

    const p1 = svc.attemptReconnect();
    const p2 = svc.attemptReconnect(); // segundo no debería arrancar otro bucle

    await vi.advanceTimersByTimeAsync(2_000);
    await Promise.all([p1, p2]);

    // El puerto sólo se ha abierto una vez, no dos.
    expect(fakePort.open).toHaveBeenCalledTimes(1);
  });
});

describe('WebSerialService — flush descarta scans caducados', () => {
  it('descarta el scan caducado (>30s) y reenvía solo el fresco', () => {
    const svc = buildSvc();
    // El flush sólo opera con el socket conectado.
    socketService.isGameSocketConnected.mockReturnValue(true);

    const expiredSpy = vi.fn();
    svc.on('scan_expired', expiredSpy);

    const now = Date.now();
    // Encolamos directamente en pendingScans con la estructura real del entry:
    // { payload, queuedAt, persistedId }. queuedAt fresco (la prune por queuedAt
    // no lo descarta); lo que caduca es el `timestamp` del payload (ventana de
    // frescura del backend), que es lo que valida el flush.
    const expired = {
      payload: { uid: 'AABBCCDD', timestamp: now - 31000, source: 'web_serial' },
      queuedAt: now,
      persistedId: 11
    };
    const fresh = {
      payload: { uid: '11223344', timestamp: now, source: 'web_serial' },
      queuedAt: now,
      persistedId: 22
    };
    svc.pendingScans = [expired, fresh];

    const result = svc.flushPendingScans();

    // (a) El caducado NO se reenvía; (d) el fresco SÍ.
    const emittedUids = socketService.emitGameFireAndForget.mock.calls.map(
      ([, payload]) => payload.uid
    );
    expect(emittedUids).not.toContain('AABBCCDD');
    expect(emittedUids).toContain('11223344');
    expect(socketService.emitGameFireAndForget).toHaveBeenCalledTimes(1);

    // (b) Se elimina de pendingScans (in-memory) y de pendingScansStore (IDB).
    expect(svc.pendingScans).toHaveLength(0);
    expect(pendingScansStore.remove).toHaveBeenCalledWith(11);

    // (c) Se emite scan_expired con el uid del caducado.
    expect(expiredSpy).toHaveBeenCalledWith({ uid: 'AABBCCDD' });

    // El contador `sent` solo cuenta los realmente reenviados.
    expect(result.sent).toBe(1);
    expect(result.pending).toBe(0);
  });
});
