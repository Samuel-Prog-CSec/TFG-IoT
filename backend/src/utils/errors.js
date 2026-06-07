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
   * @param {Object|null} [data=null] - Datos adicionales de contexto para la respuesta (ej: entidad en conflicto)
   */
  constructor(message, statusCode, data = null) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
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
   * @param {Array<{field: string, message: string}>} [errors=[]] - Errores detallados por campo
   * @param {Object|null} [data=null] - Datos adicionales de contexto
   */
  constructor(message, errors = [], data = null) {
    super(message, 400, data);
    this.errors = errors;
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
   * @param {string|null} [code=null] - Código semántico para el cliente (ej: TOKEN_EXPIRED, TOKEN_REVOKED)
   */
  constructor(message = 'No autorizado', code = null) {
    super(message, 401);
    if (code) {
      this.code = code;
    }
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
   * @param {string} [code] - Código semántico opcional para que el cliente
   *   distinga subtipos (`CAPTCHA_REQUIRED`, `CAPTCHA_INVALID`, etc.).
   */
  constructor(message = 'Acceso denegado', code) {
    super(message, 403);
    if (code) {
      this.code = code;
    }
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
   * @param {Object|null} [data=null] - Datos adicionales de contexto (ej: entidad existente en conflicto)
   */
  constructor(message, data = null) {
    super(message, 409, data);
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
 * Error de demasiadas peticiones (429 Too Many Requests).
 * Se lanza cuando se supera un límite de intentos en una ventana de tiempo
 * (ej: lockout per-user del challenge MFA frente a fuerza bruta del código TOTP).
 *
 * @class TooManyRequestsError
 * @extends AppError
 *
 * @example
 * throw new TooManyRequestsError('Demasiados intentos MFA fallidos', 'MFA_LOCKED');
 */
class TooManyRequestsError extends AppError {
  /**
   * @param {string} [message='Demasiadas peticiones'] - Mensaje de error
   * @param {string} [code] - Código semántico opcional para el cliente
   */
  constructor(message = 'Demasiadas peticiones', code) {
    super(message, 429);
    if (code) {
      this.code = code;
    }
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
  TooManyRequestsError,
  InternalServerError
};
