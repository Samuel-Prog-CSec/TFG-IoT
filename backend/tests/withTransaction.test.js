/**
 * @fileoverview Tests unitarios para utils/withTransaction (T-520 Fase B).
 * Usa mocks de mongoose.startSession para evitar dependencia de replica set.
 */

const mongoose = require('mongoose');
const { withTransaction } = require('../src/utils/withTransaction');

// Mock de logger para evitar output en tests
jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
}));

describe('withTransaction', () => {
  let mockSession;

  beforeEach(() => {
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn()
    };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debe iniciar sesión y transacción', async () => {
    await withTransaction(async () => 'ok');

    expect(mongoose.startSession).toHaveBeenCalledTimes(1);
    expect(mockSession.startTransaction).toHaveBeenCalledTimes(1);
  });

  it('debe hacer commit cuando el callback tiene éxito', async () => {
    const result = await withTransaction(async () => 'resultado');

    expect(result).toBe('resultado');
    expect(mockSession.commitTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.abortTransaction).not.toHaveBeenCalled();
  });

  it('debe hacer abort cuando el callback falla', async () => {
    const error = new Error('fallo en callback');

    await expect(
      withTransaction(async () => {
        throw error;
      })
    ).rejects.toThrow('fallo en callback');

    expect(mockSession.abortTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.commitTransaction).not.toHaveBeenCalled();
  });

  it('debe llamar endSession siempre (éxito)', async () => {
    await withTransaction(async () => 'ok');

    expect(mockSession.endSession).toHaveBeenCalledTimes(1);
  });

  it('debe llamar endSession siempre (error)', async () => {
    await expect(
      withTransaction(async () => {
        throw new Error('fail');
      })
    ).rejects.toThrow();

    expect(mockSession.endSession).toHaveBeenCalledTimes(1);
  });

  it('debe pasar session al callback', async () => {
    let receivedSession = null;

    await withTransaction(async session => {
      receivedSession = session;
    });

    expect(receivedSession).toBe(mockSession);
  });

  it('debe retornar el valor del callback', async () => {
    const data = { id: '123', name: 'test' };
    const result = await withTransaction(async () => data);

    expect(result).toEqual(data);
  });

  it('debe pasar exactamente el mock de session al callback', async () => {
    let capturedSession = null;

    await withTransaction(async session => {
      capturedSession = session;
    });

    // Verificamos que es el mismo objeto mock, no solo un objeto similar
    expect(capturedSession).toBe(mockSession);
    expect(capturedSession.startTransaction).toBeDefined();
    expect(capturedSession.commitTransaction).toBeDefined();
    expect(capturedSession.abortTransaction).toBeDefined();
    expect(capturedSession.endSession).toBeDefined();
  });

  it('debe capturar errores asíncronos del callback y abortar', async () => {
    const asyncError = new Error('error asíncrono en operación');

    await expect(
      withTransaction(async () => {
        // Simulamos una operación async que falla tras un await
        await Promise.resolve();
        throw asyncError;
      })
    ).rejects.toThrow('error asíncrono en operación');

    expect(mockSession.abortTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalledTimes(1);
  });

  it('debe capturar errores síncronos del callback y abortar', async () => {
    const syncError = new Error('error síncrono directo');

    await expect(
      withTransaction(async () => {
        throw syncError;
      })
    ).rejects.toThrow('error síncrono directo');

    expect(mockSession.abortTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalledTimes(1);
  });

  it('debe retornar el resultado de una operación async anidada', async () => {
    const nestedResult = await withTransaction(async () => {
      // Simulamos varias operaciones asíncronas anidadas
      const paso1 = await Promise.resolve({ id: 'abc' });
      const paso2 = await Promise.resolve({ ...paso1, nombre: 'test' });
      const paso3 = await Promise.resolve({ ...paso2, completo: true });
      return paso3;
    });

    expect(nestedResult).toEqual({ id: 'abc', nombre: 'test', completo: true });
    expect(mockSession.commitTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.abortTransaction).not.toHaveBeenCalled();
  });
});
