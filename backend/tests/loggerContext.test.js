/**
 * @fileoverview Tests del helper `withPlayContext` (T-904 Fase B).
 * Verifica que sólo los campos definidos se incluyen como bindings del
 * child logger, y que los `null`/`undefined` se omiten silenciosamente.
 */

const { withPlayContext } = require('../src/utils/loggerContext');

/**
 * Fake logger que registra los argumentos pasados a `child()` y devuelve
 * un nuevo fake con los bindings combinados.
 */
const makeFakeLogger = () => {
  const calls = [];
  return {
    bindings: {},
    calls,
    child(extra) {
      calls.push(extra);
      const next = makeFakeLogger();
      next.bindings = { ...this.bindings, ...extra };
      // Propagamos calls al padre para inspeccionar desde la raíz
      next.calls = calls;
      return next;
    }
  };
};

describe('utils/loggerContext.withPlayContext', () => {
  it('crea child logger con los 4 campos cuando todos están presentes', () => {
    const parent = makeFakeLogger();
    const child = withPlayContext(parent, {
      playId: '64b1f0c5e1a2a3b4c5d6e7f8',
      sessionId: '64b1f0c5e1a2a3b4c5d6e7f9',
      userId: '64b1f0c5e1a2a3b4c5d6e7fa',
      mechanic: 'association'
    });

    expect(parent.calls).toHaveLength(1);
    expect(parent.calls[0]).toEqual({
      playId: '64b1f0c5e1a2a3b4c5d6e7f8',
      sessionId: '64b1f0c5e1a2a3b4c5d6e7f9',
      userId: '64b1f0c5e1a2a3b4c5d6e7fa',
      mechanic: 'association'
    });
    expect(child.bindings).toMatchObject({
      playId: '64b1f0c5e1a2a3b4c5d6e7f8',
      mechanic: 'association'
    });
  });

  it('omite campos undefined sin pasarlos al child', () => {
    const parent = makeFakeLogger();
    withPlayContext(parent, { playId: 'p1', sessionId: undefined, userId: null });

    expect(parent.calls[0]).toEqual({ playId: 'p1' });
  });

  it('serializa ObjectId-like values a string', () => {
    const parent = makeFakeLogger();
    const fakeId = { toString: () => 'objectid-string' };
    withPlayContext(parent, { playId: fakeId, userId: 42 });

    expect(parent.calls[0]).toEqual({
      playId: 'objectid-string',
      userId: '42'
    });
  });

  it('ignora claves no soportadas (no filtra a Loki labels desconocidos)', () => {
    const parent = makeFakeLogger();
    withPlayContext(parent, { playId: 'p1', random: 'value', email: 'pii@test.com' });

    expect(parent.calls[0]).toEqual({ playId: 'p1' });
  });

  it('produce child vacío cuando no se pasa contexto', () => {
    const parent = makeFakeLogger();
    withPlayContext(parent);

    expect(parent.calls[0]).toEqual({});
  });

  it('lanza si el parent logger no expone child()', () => {
    expect(() => withPlayContext(null)).toThrow(TypeError);
    expect(() => withPlayContext({})).toThrow(TypeError);
    expect(() => withPlayContext({ child: 'no-funcion' })).toThrow(TypeError);
  });
});
