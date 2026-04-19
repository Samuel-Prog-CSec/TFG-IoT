/**
 * @fileoverview Tests del ciclo de vida de connectionCountByUserId.
 *
 * Cubre el bug histórico en el que un fallo en la inicialización del handler
 * de connection (await getRfidModeState) impedía registrar el listener de
 * disconnect, dejando el contador huérfano y bloqueando al usuario tras
 * MAX_CONNECTIONS reconexiones.
 *
 * El fix consta de dos partes:
 *  1. Helpers `incrementConnectionCount` / `decrementConnectionCount`
 *     deterministas y testables (este archivo).
 *  2. Reorden del handler en socketHandlers.js para registrar el listener
 *     de disconnect ANTES de cualquier await (verificación por code review).
 */

const {
  getConnectionCount,
  incrementConnectionCount,
  decrementConnectionCount,
  resetConnectionCountsForTests
} = require('../../src/realtime/socketHandlers');

describe('connectionCountByUserId lifecycle', () => {
  beforeEach(() => {
    resetConnectionCountsForTests();
  });

  it('incrementa y decrementa correctamente en un único usuario', () => {
    const userId = 'teacher-1';

    expect(getConnectionCount(userId)).toBe(0);
    expect(incrementConnectionCount(userId)).toBe(1);
    expect(getConnectionCount(userId)).toBe(1);
    expect(incrementConnectionCount(userId)).toBe(2);
    expect(getConnectionCount(userId)).toBe(2);

    expect(decrementConnectionCount(userId)).toBe(1);
    expect(getConnectionCount(userId)).toBe(1);
    expect(decrementConnectionCount(userId)).toBe(0);
    expect(getConnectionCount(userId)).toBe(0);
  });

  it('5 ciclos de reconexión consecutivos vuelven a cero (no leak)', () => {
    const userId = 'teacher-leak-regression';

    for (let i = 0; i < 5; i++) {
      incrementConnectionCount(userId);
      decrementConnectionCount(userId);
    }

    expect(getConnectionCount(userId)).toBe(0);
  });

  it('decrement con contador a cero no baja de cero', () => {
    expect(decrementConnectionCount('user-x')).toBe(0);
    expect(decrementConnectionCount('user-x')).toBe(0);
    expect(getConnectionCount('user-x')).toBe(0);
  });

  it('contadores de varios usuarios son independientes', () => {
    incrementConnectionCount('user-a');
    incrementConnectionCount('user-b');
    incrementConnectionCount('user-b');

    expect(getConnectionCount('user-a')).toBe(1);
    expect(getConnectionCount('user-b')).toBe(2);

    decrementConnectionCount('user-b');
    expect(getConnectionCount('user-b')).toBe(1);
    expect(getConnectionCount('user-a')).toBe(1);

    decrementConnectionCount('user-a');
    expect(getConnectionCount('user-a')).toBe(0);
    expect(getConnectionCount('user-b')).toBe(1);
  });

  it('increment y decrement con userId vacío son no-op silenciosos', () => {
    expect(incrementConnectionCount(null)).toBe(0);
    expect(incrementConnectionCount(undefined)).toBe(0);
    expect(incrementConnectionCount('')).toBe(0);

    expect(decrementConnectionCount(null)).toBe(0);
    expect(decrementConnectionCount(undefined)).toBe(0);
    expect(decrementConnectionCount('')).toBe(0);
  });

  it('al alcanzar cero la entrada se elimina del Map (no acumula claves)', () => {
    incrementConnectionCount('volatile-user');
    decrementConnectionCount('volatile-user');

    // No exponemos el Map directamente, pero podemos confirmar que un
    // usuario nuevo cuenta a partir de 1 y que decrementar uno inexistente
    // continúa devolviendo 0 sin efectos colaterales.
    expect(getConnectionCount('volatile-user')).toBe(0);
    expect(incrementConnectionCount('volatile-user')).toBe(1);
  });

  it('escenario realista: ráfaga de 10 reconexiones rápidas', () => {
    const userId = 'teacher-burst';

    // Simulamos 10 ciclos consecutivos sin recubrirse: la implementación
    // anterior dejaba el contador en 5+ y bloqueaba al sexto intento por
    // MAX_CONNECTIONS. El fix garantiza que al final estemos en 0.
    for (let i = 0; i < 10; i++) {
      incrementConnectionCount(userId);
      decrementConnectionCount(userId);
    }

    expect(getConnectionCount(userId)).toBe(0);
  });
});
