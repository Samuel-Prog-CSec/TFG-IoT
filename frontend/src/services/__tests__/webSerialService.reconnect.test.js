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

let webSerialServiceModule;
let WebSerialServiceCtor;

beforeEach(async () => {
  vi.resetModules();
  webSerialServiceModule = await import('../webSerialService');
  WebSerialServiceCtor = webSerialServiceModule.webSerialService.constructor;

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
