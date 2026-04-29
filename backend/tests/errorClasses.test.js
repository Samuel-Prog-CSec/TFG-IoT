/**
 * @fileoverview Tests unitarios para las clases de error personalizadas.
 * Verifica statusCode, isOperational, herencia y propiedades de cada clase.
 */

const {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  UnprocessableEntityError,
  InternalServerError
} = require('../src/utils/errors');

describe('Error Classes', () => {
  describe('AppError', () => {
    it('sets message, statusCode, data and isOperational', () => {
      const error = new AppError('something failed', 418, { context: 'test' });

      expect(error.message).toBe('something failed');
      expect(error.statusCode).toBe(418);
      expect(error.data).toEqual({ context: 'test' });
      expect(error.isOperational).toBe(true);
    });

    it('defaults data to null', () => {
      const error = new AppError('fail', 400);

      expect(error.data).toBeNull();
    });

    it('is an instance of Error', () => {
      const error = new AppError('fail', 400);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });

    it('captures stack trace', () => {
      const error = new AppError('fail', 400);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    it('sets name to the constructor name', () => {
      const error = new AppError('fail', 400);

      expect(error.name).toBe('AppError');
    });
  });

  describe('ValidationError', () => {
    it('has status 400 and accepts field errors', () => {
      const fieldErrors = [{ field: 'email', message: 'El email es inválido' }];
      const error = new ValidationError('Datos inválidos', fieldErrors);

      expect(error.statusCode).toBe(400);
      expect(error.errors).toEqual(fieldErrors);
      expect(error.isOperational).toBe(true);
    });

    it('defaults errors to empty array', () => {
      const error = new ValidationError('Datos inválidos');

      expect(error.errors).toEqual([]);
    });

    it('inherits from AppError', () => {
      const error = new ValidationError('fail');

      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('NotFoundError', () => {
    it('has status 404 with resource name in message', () => {
      const error = new NotFoundError('GameSession');

      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('GameSession');
      expect(error.isOperational).toBe(true);
    });
  });

  describe('UnauthorizedError', () => {
    it('has status 401 with default message', () => {
      const error = new UnauthorizedError();

      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('No autorizado');
    });

    it('accepts custom message', () => {
      const error = new UnauthorizedError('Token expirado');

      expect(error.message).toBe('Token expirado');
    });
  });

  describe('ForbiddenError', () => {
    it('has status 403 with default message', () => {
      const error = new ForbiddenError();

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Acceso denegado');
    });

    it('accepts custom message', () => {
      const error = new ForbiddenError('Solo profesores');

      expect(error.message).toBe('Solo profesores');
    });
  });

  describe('ConflictError', () => {
    it('has status 409 and accepts data', () => {
      const data = { existingId: '123' };
      const error = new ConflictError('La tarjeta ya existe', data);

      expect(error.statusCode).toBe(409);
      expect(error.data).toEqual(data);
    });

    it('defaults data to null', () => {
      const error = new ConflictError('Conflicto');

      expect(error.data).toBeNull();
    });
  });

  describe('UnprocessableEntityError', () => {
    it('has status 422', () => {
      const error = new UnprocessableEntityError('No se puede iniciar sesión completada');

      expect(error.statusCode).toBe(422);
      expect(error.isOperational).toBe(true);
    });
  });

  describe('InternalServerError', () => {
    it('has status 500 and isOperational false', () => {
      const error = new InternalServerError();

      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });

    it('uses default message', () => {
      const error = new InternalServerError();

      expect(error.message).toBe('Error interno del servidor');
    });

    it('accepts custom message', () => {
      const error = new InternalServerError('DB crash');

      expect(error.message).toBe('DB crash');
      expect(error.isOperational).toBe(false);
    });
  });
});
