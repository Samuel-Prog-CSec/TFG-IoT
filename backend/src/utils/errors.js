/**
 * @fileoverview Clases de errores personalizados para el manejo consistente de errores.
 * Todos los errores heredan de AppError y tienen códigos de estado HTTP apropiados.
 * @module utils/errors
 */

/**
 * Clase base para todos los errores de la aplicación.
 * Los errores operacionales (esperados) deben heredar de esta clase.
 *
 * @class AppError
 * @extends Error
 */
class AppError extends Error {
  /**
   * Crea una nueva instancia de AppError.
   *
   * @param {string} message - Mensaje de error descriptivo
   * @param {number} statusCode - Código de estado HTTP
   */
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // Indica que es un error esperado/manejable
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error de validación de datos (400 Bad Request).
 * Se lanza cuando los datos de entrada no cumplen con los requisitos.
 *
 * @class ValidationError
 * @extends AppError
 *
 * @example
 * throw new ValidationError('El email es inválido');
 */
class ApiValidationError extends AppError {
  /**
   * @param {string} message - Descripción de la validación fallida
   */
  constructor(message) {
    super(message, 400);
  }
}

/**
 * Error de recurso no encontrado (404 Not Found).
 * Se lanza cuando un recurso solicitado no existe en la base de datos.
 *
 * @class NotFoundError
 * @extends AppError
 *
 * @example
 * throw new NotFoundError('GameSession');
 * // Resultado: "GameSession not found" (404)
 */
class NotFoundError extends AppError {
  /**
   * @param {string} resource - Nombre del recurso que no se encontró
   */
  constructor(resource) {
    super(`${resource} no encontrado`, 404);
  }
}

/**
 * Error de autenticación/autorización (401 Unauthorized).
 * Se lanza cuando el usuario no está autenticado o no tiene permisos.
 *
 * @class UnauthorizedError
 * @extends AppError
 *
 * @example
 * throw new UnauthorizedError('Token inválido');
 */
class UnauthorizedError extends AppError {
  /**
   * @param {string} [message='No autorizado'] - Mensaje de error personalizado
   */
  constructor(message = 'No autorizado') {
    super(message, 401);
  }
}

/**
 * Error de permisos insuficientes (403 Forbidden).
 * Se lanza cuando el usuario está autenticado pero no tiene permisos para la acción.
 *
 * @class ForbiddenError
 * @extends AppError
 *
 * @example
 * throw new ForbiddenError('Solo los profesores pueden crear sesiones');
 */
class ForbiddenError extends AppError {
  /**
   * @param {string} [message='Acceso denegado'] - Mensaje de error personalizado
   */
  constructor(message = 'Acceso denegado') {
    super(message, 403);
  }
}

/**
 * Error de conflicto de recursos (409 Conflict).
 * Se lanza cuando hay un conflicto con el estado actual del recurso.
 *
 * @class ConflictError
 * @extends AppError
 *
 * @example
 * throw new ConflictError('La tarjeta RFID ya está registrada');
 */
class ConflictError extends AppError {
  /**
   * @param {string} message - Descripción del conflicto
   */
  constructor(message) {
    super(message, 409);
  }
}

/**
 * Error de entidad no procesable (422 Unprocessable Entity).
 * Se lanza cuando la petición está bien formada pero contiene errores semánticos.
 *
 * @class UnprocessableEntityError
 * @extends AppError
 *
 * @example
 * throw new UnprocessableEntityError('No se puede iniciar una sesión ya completada');
 */
class UnprocessableEntityError extends AppError {
  /**
   * @param {string} message - Descripción del error semántico
   */
  constructor(message) {
    super(message, 422);
  }
}

/**
 * Error interno del servidor (500 Internal Server Error).
 * Se lanza cuando ocurre un error inesperado que no es operacional.
 *
 * @class InternalServerError
 * @extends AppError
 *
 * @example
 * throw new InternalServerError('Error al procesar el pago');
 */
class InternalServerError extends AppError {
  /**
   * @param {string} [message='Error interno del servidor'] - Mensaje de error
   */
  constructor(message = 'Error interno del servidor') {
    super(message, 500);
    this.isOperational = false; // Errores 500 no son operacionales
  }
}

module.exports = {
  AppError,
  ValidationError: ApiValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  UnprocessableEntityError,
  InternalServerError
};
