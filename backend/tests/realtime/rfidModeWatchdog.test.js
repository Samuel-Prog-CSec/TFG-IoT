/**
 * @fileoverview Tests del watchdog de modo RFID.
 *
 * Garantiza que un modo RFID activo se libera automáticamente tras
 * RFID_MODE_IDLE_TIMEOUT_MS sin actividad (scan o heartbeat). Cubre el
 * caso "modo stuck" en el que un profesor cerraba el navegador sin
 * disparar `leave_*` y otro socket suyo recibía RFID_MODE_TAKEN_OVER en
 * cadena durante 1h hasta que el TTL Redis expirase.
 */

const {
  RFID_MODE_IDLE_TIMEOUT_MS,
  RFID_MODES,
  setRfidModeState,
  clearRfidModeState,
  refreshRfidModeActivity,
  resetRfidModeTimersForTests,
  peekRfidModeStateForTests
} = require('../../src/realtime/socketHandlers');

describe('RFID mode watchdog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetRfidModeTimersForTests();
  });

  afterEach(() => {
    resetRfidModeTimersForTests();
    jest.useRealTimers();
  });

  it('expone un timeout positivo razonable (>= 1 min)', () => {
    expect(RFID_MODE_IDLE_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('auto-limpia el modo gameplay tras RFID_MODE_IDLE_TIMEOUT_MS sin actividad', () => {
    setRfidModeState('user-1', RFID_MODES.GAMEPLAY, 'socket-1', { playId: 'p-1' });
    expect(peekRfidModeStateForTests('user-1')?.mode).toBe(RFID_MODES.GAMEPLAY);

    jest.advanceTimersByTime(RFID_MODE_IDLE_TIMEOUT_MS - 1_000);
    expect(peekRfidModeStateForTests('user-1')?.mode).toBe(RFID_MODES.GAMEPLAY);

    jest.advanceTimersByTime(2_000);
    expect(peekRfidModeStateForTests('user-1')).toBeUndefined();
  });

  it('auto-limpia también el modo card_assignment', () => {
    setRfidModeState('user-2', RFID_MODES.CARD_ASSIGNMENT, 'socket-2', {});
    jest.advanceTimersByTime(RFID_MODE_IDLE_TIMEOUT_MS + 1_000);
    expect(peekRfidModeStateForTests('user-2')).toBeUndefined();
  });

  it('refreshRfidModeActivity dentro de la ventana evita el cleanup', () => {
    setRfidModeState('user-3', RFID_MODES.GAMEPLAY, 'socket-3', {});

    // 1 min antes del cutoff llega un scan o heartbeat.
    jest.advanceTimersByTime(RFID_MODE_IDLE_TIMEOUT_MS - 60_000);
    refreshRfidModeActivity('user-3', 'socket-3');

    // Avanzamos otros (TIMEOUT - 1 min) — todavía dentro de la nueva ventana.
    jest.advanceTimersByTime(RFID_MODE_IDLE_TIMEOUT_MS - 1_000);
    expect(peekRfidModeStateForTests('user-3')?.mode).toBe(RFID_MODES.GAMEPLAY);

    // Y luego pasa el resto: ahora sí se limpia.
    jest.advanceTimersByTime(2_000);
    expect(peekRfidModeStateForTests('user-3')).toBeUndefined();
  });

  it('refreshRfidModeActivity con socketId distinto no afecta el watchdog (anti-hijack)', () => {
    setRfidModeState('user-4', RFID_MODES.GAMEPLAY, 'socket-A', {});
    jest.advanceTimersByTime(RFID_MODE_IDLE_TIMEOUT_MS - 60_000);

    // Otro socket intenta refrescar la actividad sin ser dueño.
    refreshRfidModeActivity('user-4', 'socket-INTRUDER');

    // El watchdog original sigue corriendo.
    jest.advanceTimersByTime(70_000);
    expect(peekRfidModeStateForTests('user-4')).toBeUndefined();
  });

  it('clearRfidModeState cancela el timer pendiente', () => {
    setRfidModeState('user-5', RFID_MODES.GAMEPLAY, 'socket-5', {});
    clearRfidModeState('user-5', 'socket-5');

    // Con el timer cancelado no debe haber side effects al avanzar tiempo.
    expect(() => jest.advanceTimersByTime(RFID_MODE_IDLE_TIMEOUT_MS * 2)).not.toThrow();
    expect(peekRfidModeStateForTests('user-5')).toBeUndefined();
  });

  it('cambiar de modo a IDLE cancela el timer y limpia el estado', () => {
    setRfidModeState('user-6', RFID_MODES.GAMEPLAY, 'socket-6', {});
    setRfidModeState('user-6', RFID_MODES.IDLE, 'socket-6');

    jest.advanceTimersByTime(RFID_MODE_IDLE_TIMEOUT_MS * 2);
    expect(peekRfidModeStateForTests('user-6')).toBeUndefined();
  });

  it('reasignar el mismo modo reprograma el timer (no se acumulan)', () => {
    setRfidModeState('user-7', RFID_MODES.GAMEPLAY, 'socket-7a', {});
    jest.advanceTimersByTime(RFID_MODE_IDLE_TIMEOUT_MS - 30_000);

    // Otro socket toma el control con un re-set; el timer debería reiniciarse.
    setRfidModeState('user-7', RFID_MODES.GAMEPLAY, 'socket-7b', {});

    // Queda mucho menos de TIMEOUT del primero, pero como reprogramamos
    // todavía el modo debe estar activo aquí:
    jest.advanceTimersByTime(RFID_MODE_IDLE_TIMEOUT_MS - 30_000);
    expect(peekRfidModeStateForTests('user-7')?.mode).toBe(RFID_MODES.GAMEPLAY);
    expect(peekRfidModeStateForTests('user-7')?.socketId).toBe('socket-7b');

    // Transcurrido el TIMEOUT íntegro desde la reasignación, sí se limpia.
    jest.advanceTimersByTime(60_000);
    expect(peekRfidModeStateForTests('user-7')).toBeUndefined();
  });

  it('múltiples usuarios tienen watchdogs independientes', () => {
    setRfidModeState('user-A', RFID_MODES.GAMEPLAY, 'sock-A', {});
    setRfidModeState('user-B', RFID_MODES.GAMEPLAY, 'sock-B', {});

    jest.advanceTimersByTime(RFID_MODE_IDLE_TIMEOUT_MS - 30_000);
    refreshRfidModeActivity('user-B', 'sock-B');

    jest.advanceTimersByTime(60_000);
    // user-A pasó el timeout; user-B fue refrescado, sigue activo.
    expect(peekRfidModeStateForTests('user-A')).toBeUndefined();
    expect(peekRfidModeStateForTests('user-B')?.mode).toBe(RFID_MODES.GAMEPLAY);
  });
});
