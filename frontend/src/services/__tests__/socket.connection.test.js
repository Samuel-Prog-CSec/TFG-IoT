/**
 * @fileoverview Regresión de BUG-WS-1 (reconexiones espurias de WebSocket).
 *
 * El bug original (~0.6 reconexiones por navegación, QA 2026-05-14) tenía dos
 * causas que estas pruebas blindan para que no reaparezcan:
 *
 *  1. `auth` se entregaba como objeto estático `{ token }`. Tras un
 *     `/auth/refresh` el access token rotaba pero el socket reconectaba con el
 *     token original → el backend respondía SESSION_MISMATCH → `io server
 *     disconnect` → reconexión forzada. El fix entrega `auth` como FUNCIÓN, de
 *     modo que socket.io-client resuelve `getAccessToken()` en cada handshake.
 *
 *  2. Dos llamadores casi-simultáneos a `connect()` (AuthContext.login +
 *     useGameSocket) abrían handshakes paralelos; el server cerraba uno por
 *     SESSION_MISMATCH. El fix memoiza el `connect()` en vuelo (`_connectPromise`)
 *     y devuelve la misma promesa.
 *
 * Verificado además por QA E2E (24/05/2026): navegación SPA pura entre 8 rutas
 * produce CERO eventos de socket. Este test fija el contrato a nivel unitario.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let currentToken = 'tok-initial';

vi.mock('socket.io-client', () => {
  const sockets = [];
  const io = vi.fn((url, opts) => {
    const handlers = {};
    const sock = {
      id: `mock-${sockets.length}`,
      connected: false,
      _url: url,
      _opts: opts,
      on: vi.fn((ev, cb) => {
        handlers[ev] = cb;
      }),
      off: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      emit: vi.fn(),
      volatile: { emit: vi.fn() }
    };
    sockets.push(sock);
    return sock;
  });
  return { io, __sockets: sockets };
});

vi.mock('../api', () => ({
  getAccessToken: vi.fn(() => currentToken),
  refreshAccessTokenProactive: vi.fn(() => Promise.resolve()),
  AUTH_EVENTS: {
    UNAUTHORIZED: 'auth:unauthorized',
    SESSION_INVALIDATED: 'auth:session_invalidated'
  }
}));

const importService = async () => {
  const mod = await import('../socket');
  return mod.socketService;
};

describe('socket BUG-WS-1 — auth dinámico', () => {
  let socketService;

  beforeEach(async () => {
    vi.resetModules();
    currentToken = 'tok-initial';
    socketService = await importService();
  });

  afterEach(() => {
    socketService.disconnect();
  });

  it('entrega `auth` como FUNCIÓN, no como objeto estático', () => {
    const opts = socketService._connectionOptions();
    expect(typeof opts.auth).toBe('function');
  });

  it('la función `auth` resuelve el token VIGENTE en cada handshake (no uno anclado)', () => {
    const opts = socketService._connectionOptions();

    // Primer handshake: token inicial.
    let firstHandshake;
    opts.auth(payload => {
      firstHandshake = payload;
    });
    expect(firstHandshake).toEqual({ token: 'tok-initial' });

    // Simular rotación de token tras /auth/refresh.
    currentToken = 'tok-rotado';

    // Segundo handshake (reconexión): debe usar el token NUEVO, no el anclado.
    let secondHandshake;
    opts.auth(payload => {
      secondHandshake = payload;
    });
    expect(secondHandshake).toEqual({ token: 'tok-rotado' });
  });

  it('mantiene reconexión automática habilitada con backoff acotado', () => {
    const opts = socketService._connectionOptions();
    expect(opts.reconnection).toBe(true);
    expect(opts.reconnectionAttempts).toBeGreaterThan(0);
    expect(opts.reconnectionDelayMax).toBeGreaterThan(0);
  });
});

describe('socket BUG-WS-1 — idempotencia de connect()', () => {
  let socketService;

  beforeEach(async () => {
    vi.resetModules();
    currentToken = 'tok-initial';
    socketService = await importService();
  });

  afterEach(() => {
    socketService.disconnect();
  });

  it('dos connect() casi-simultáneos devuelven la MISMA promesa (sin handshakes paralelos)', async () => {
    const { io } = await import('socket.io-client');
    io.mockClear();

    const p1 = socketService.connect();
    const p2 = socketService.connect();

    expect(p1).toBe(p2);
    // Solo deben crearse 2 sockets (system + game), no 4 (dos handshakes).
    expect(io).toHaveBeenCalledTimes(2);
  });
});

describe('socket — onGame() resistente al race del socket de juego', () => {
  let socketService;

  beforeEach(async () => {
    vi.resetModules();
    currentToken = 'tok-initial';
    socketService = await importService();
  });

  afterEach(() => {
    socketService.disconnect();
  });

  it('onGame() antes de que exista el socket de juego NO descarta el listener: lo trackea y lo encola', () => {
    const cb = vi.fn();
    expect(socketService.gameSocket).toBeFalsy();

    socketService.onGame('round_started', cb);

    // No se pierde: trackeado (para cleanup) y encolado (para aplicar al conectar).
    expect(socketService.gameListeners.get('round_started')?.has(cb)).toBe(true);
    expect(
      socketService.pendingGameListeners.some(
        p => p.event === 'round_started' && p.callback === cb
      )
    ).toBe(true);
  });

  it('al crear el socket de juego, los onGame() pendientes se aplican y la cola se vacía', async () => {
    const { io } = await import('socket.io-client');
    io.mockClear();
    const cb = vi.fn();

    socketService.onGame('round_started', cb);
    // connect() crea ambos sockets y vuelca los pendientes sincrónicamente.
    socketService.connect().catch(() => {});

    // io() se llama 2 veces: [0]=sistema, [1]=/game.
    const gameSock = io.mock.results[1].value;
    const aplicado = gameSock.on.mock.calls.some(([ev]) => ev === 'round_started');
    expect(aplicado).toBe(true);
    expect(socketService.pendingGameListeners).toHaveLength(0);
  });

  it('offGame() antes de conectar cancela un listener de juego pendiente', () => {
    const cb = vi.fn();
    socketService.onGame('round_started', cb);
    socketService.offGame('round_started', cb);

    expect(
      socketService.pendingGameListeners.some(p => p.event === 'round_started')
    ).toBe(false);
    expect(socketService.gameListeners.has('round_started')).toBe(false);
  });
});
