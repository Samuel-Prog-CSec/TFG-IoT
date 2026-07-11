/**
 * @fileoverview Tests de robustez del WebSerialService frente al hardware real
 * (RC522 clon, firmware inmutable). Cubre tres correcciones:
 *
 *  - Issue 1: connect() reutiliza el puerto ya autorizado (sin abrir el
 *    selector en cada arranque), tolera "puerto ya abierto" y traduce los
 *    errores del navegador al español (marcando la cancelación del usuario).
 *  - Issue 2: una lectura válida (o un heartbeat) promueve deviceState→ready
 *    aunque se perdiera el init:success (ESP ya encendido al abrir el puerto).
 *  - Issue 3: los read_failure del firmware son ruido transitorio: no se pintan
 *    en rojo; solo tras fallos sostenidos se emite una pista, que se limpia al
 *    llegar una lectura válida. init_failure sí sigue siendo error real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../socket', () => ({
  socketService: {
    emitGameFireAndForget: vi.fn(),
    isGameSocketConnected: vi.fn(() => false)
  }
}));

vi.mock('../../lib/pendingScansStore', () => ({
  add: vi.fn().mockResolvedValue(null),
  getAll: vi.fn().mockResolvedValue([]),
  remove: vi.fn().mockResolvedValue(),
  purgeOlderThan: vi.fn().mockResolvedValue(0),
  clear: vi.fn().mockResolvedValue()
}));

const READ_FAILURE_HINT_THRESHOLD = 3;

let WebSerialServiceCtor;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../webSerialService');
  WebSerialServiceCtor = mod.webSerialService.constructor;
});

afterEach(() => {
  vi.useRealTimers();
});

const buildSvc = () => new WebSerialServiceCtor();

describe('WebSerialService — connect() robusto (issue 1)', () => {
  const makePort = (openImpl) => ({
    open: vi.fn(openImpl || (() => Promise.resolve())),
    close: vi.fn().mockResolvedValue(),
    readable: {}
  });

  it('reutiliza un puerto ya autorizado sin abrir el selector del navegador', async () => {
    const port = makePort();
    const requestPort = vi.fn();
    globalThis.navigator = {
      serial: {
        getPorts: vi.fn().mockResolvedValue([port]),
        requestPort,
        addEventListener: vi.fn()
      }
    };
    const svc = buildSvc();

    await svc.connect();

    expect(requestPort).not.toHaveBeenCalled();
    expect(port.open).toHaveBeenCalledTimes(1);
    expect(svc.status).toBe('connected');
    expect(svc.port).toBe(port);
  });

  it('abre el selector solo si no hay ningún puerto autorizado', async () => {
    const port = makePort();
    const requestPort = vi.fn().mockResolvedValue(port);
    globalThis.navigator = {
      serial: {
        getPorts: vi.fn().mockResolvedValue([]),
        requestPort,
        addEventListener: vi.fn()
      }
    };
    const svc = buildSvc();

    await svc.connect();

    expect(requestPort).toHaveBeenCalledTimes(1);
    expect(port.open).toHaveBeenCalledTimes(1);
    expect(svc.status).toBe('connected');
  });

  it('reutiliza la conexión si el puerto ya estaba abierto (InvalidStateError)', async () => {
    const err = Object.assign(new Error('The port is already open'), { name: 'InvalidStateError' });
    const port = makePort(() => Promise.reject(err));
    globalThis.navigator = {
      serial: {
        getPorts: vi.fn().mockResolvedValue([port]),
        requestPort: vi.fn(),
        addEventListener: vi.fn()
      }
    };
    const svc = buildSvc();

    await expect(svc.connect()).resolves.toBeUndefined();
    expect(svc.status).toBe('connected');
    expect(svc.port).toBe(port);
  });

  it('traduce la cancelación del usuario (NotFoundError) al español y la marca como cancelada', async () => {
    const err = Object.assign(new Error('No port selected by the user.'), { name: 'NotFoundError' });
    globalThis.navigator = {
      serial: {
        getPorts: vi.fn().mockResolvedValue([]),
        requestPort: vi.fn().mockRejectedValue(err),
        addEventListener: vi.fn()
      }
    };
    const svc = buildSvc();

    const thrown = await svc.connect().catch((e) => e);

    expect(thrown.cancelled).toBe(true);
    expect(thrown.message).not.toContain('No port selected');
    expect(svc.status).toBe('disconnected');
    expect(svc.port).toBeNull();
  });

  it('traduce un fallo de apertura (NetworkError) a español sin exponer el mensaje crudo', async () => {
    const err = Object.assign(new Error('Failed to open serial port.'), { name: 'NetworkError' });
    const port = makePort(() => Promise.reject(err));
    globalThis.navigator = {
      serial: {
        getPorts: vi.fn().mockResolvedValue([port]),
        requestPort: vi.fn(),
        addEventListener: vi.fn()
      }
    };
    const svc = buildSvc();

    const thrown = await svc.connect().catch((e) => e);

    expect(thrown.message).not.toContain('Failed to open');
    expect(thrown.cancelled).toBeFalsy();
    expect(svc.status).toBe('disconnected');
    expect(svc.port).toBeNull();
  });
});

describe('WebSerialService — deviceState promovido por actividad (issue 2)', () => {
  it('un card_detected válido promueve deviceState a ready aunque se perdiera el init', () => {
    const svc = buildSvc();
    svc.deviceState = 'initializing';
    const stateSpy = vi.fn();
    svc.on('device_state_change', stateSpy);

    svc.handleRawEvent({ event: 'card_detected', uid: '32B8FA05', type: 'MIFARE 1KB' });

    expect(svc.deviceState).toBe('ready');
    expect(stateSpy).toHaveBeenCalledWith(expect.objectContaining({ state: 'ready' }));
    svc._clearDeviceTimers();
  });

  it('un heartbeat status promueve initializing → ready', () => {
    const svc = buildSvc();
    svc.deviceState = 'initializing';

    svc.handleRawEvent({ event: 'status', uptime: 10000, cards_detected: 0, free_heap: 32768 });

    expect(svc.deviceState).toBe('ready');
    svc._clearDeviceTimers();
  });

  it('un heartbeat NO promueve desde error (init_failure real)', () => {
    const svc = buildSvc();
    svc.deviceState = 'error';

    svc.handleRawEvent({ event: 'status', uptime: 10000, cards_detected: 0, free_heap: 32768 });

    expect(svc.deviceState).toBe('error');
  });

  it('infiere hmacEnabled de un card_detected firmado', () => {
    const svc = buildSvc();

    svc.handleRawEvent({
      event: 'card_detected',
      uid: '32B8FA05',
      type: 'MIFARE 1KB',
      counter: 5,
      hmac: 'a'.repeat(64)
    });

    expect(svc.hmacEnabled).toBe(true);
    svc._clearDeviceTimers();
  });
});

describe('WebSerialService — read_failure como pista, no error (issue 3)', () => {
  it('un read_failure NO emite device_error ni cambia deviceState', () => {
    const svc = buildSvc();
    svc.deviceState = 'ready';
    const errSpy = vi.fn();
    svc.on('device_error', errSpy);

    svc.handleRawEvent({ event: 'error', type: 'read_failure', message: 'Anticollision failed, status: 3' });

    expect(errSpy).not.toHaveBeenCalled();
    expect(svc.deviceState).toBe('ready');
  });

  it('tras fallos sostenidos emite device_read_hint activo en español (sin jerga)', () => {
    const svc = buildSvc();
    const hintSpy = vi.fn();
    svc.on('device_read_hint', hintSpy);

    for (let i = 0; i < READ_FAILURE_HINT_THRESHOLD; i += 1) {
      svc.handleRawEvent({ event: 'error', type: 'read_failure', message: 'Anticollision failed, status: 1' });
    }

    expect(hintSpy).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, message: expect.any(String) })
    );
    const msg = hintSpy.mock.calls.at(-1)[0].message;
    expect(msg).not.toContain('Anticollision');
  });

  it('un escaneo válido corta la racha y limpia la pista', () => {
    const svc = buildSvc();
    const hintSpy = vi.fn();
    svc.on('device_read_hint', hintSpy);

    // 2 fallos (por debajo del umbral): todavía sin pista activa.
    svc.handleRawEvent({ event: 'error', type: 'read_failure', message: 'x' });
    svc.handleRawEvent({ event: 'error', type: 'read_failure', message: 'x' });
    expect(hintSpy).not.toHaveBeenCalledWith(expect.objectContaining({ active: true }));

    // Éxito: limpia la pista y reinicia la racha.
    svc.handleRawEvent({ event: 'card_detected', uid: '32B8FA05', type: 'MIFARE 1KB' });
    expect(hintSpy).toHaveBeenCalledWith(expect.objectContaining({ active: false }));

    // 2 fallos más: como la racha se reinició, siguen por debajo del umbral.
    hintSpy.mockClear();
    svc.handleRawEvent({ event: 'error', type: 'read_failure', message: 'x' });
    svc.handleRawEvent({ event: 'error', type: 'read_failure', message: 'x' });
    expect(hintSpy).not.toHaveBeenCalledWith(expect.objectContaining({ active: true }));
    svc._clearDeviceTimers();
  });

  it('init_failure SÍ emite device_error en español y pone deviceState en error', () => {
    const svc = buildSvc();
    const errSpy = vi.fn();
    svc.on('device_error', errSpy);

    svc.handleRawEvent({
      event: 'error',
      type: 'init_failure',
      message: 'RC522 communication failed — check SPI wiring'
    });

    expect(svc.deviceState).toBe('error');
    expect(errSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'init_failure' }));
    const msg = errSpy.mock.calls[0][0].message;
    expect(msg).not.toContain('RC522 communication failed');
  });
});
