/**
 * @fileoverview Middleware centralizado de manejo de errores.
 * TODOS los errores HTTP de la aplicación fluyen por aquí para garantizar
 * logging estructurado (Pino), formato de respuesta unificado y captura
 * selectiva en Sentry (delegada a shouldHandleError en config/sentry.js).
 * @module middlewares/errorHandler
 */

const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Middleware de manejo de errores centralizado.
 * Debe ser el ÚLTIMO middleware en server.js.
 *
 * Maneja:
 * - Errores operacionales (AppError y subclases, incluidos ValidationError con array errors)
 * - Errores de Mongoose (validación, cast, duplicados)
 * - Errores de JWT (token inválido, token expirado)
 * - Errores inesperados (500)
 *
 * @param {Error} err - Error capturado
 * @param {import('express').Request} req - Objeto de petición
 * @param {import('express').Response} res - Objeto de respuesta
 * @param {import('express').NextFunction} _next - Función next (requerida por Express para identificar error middleware)
 */
const errorHandler = (err, req, res, _next) => {
  // Variables para construir la respuesta — se rellenan según el tipo de error.
  // No usar spread ({ ...err }) porque pierde la cadena de prototipos
  // (name, isOperational, data, errors) de las clases de error personalizadas.
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Error interno del servidor';
  let errors = null;
  let data = null;
  let code = null;

  // 1. Errores operacionales (AppError y subclases) — prioridad máxima
  if (err.isOperational) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors || null;
    data = err.data || null;
    code = err.code || null;
  }

  // 2. Mongoose ValidationError (tiene err.name === 'ValidationError' pero NO isOperational)
  else if (err.name === 'ValidationError' && err.errors && !err.isOperational) {
    statusCode = 400;
    message = `Error de validación: ${Object.values(err.errors)
      .map(e => e.message)
      .join(', ')}`;
  }

  // 3. Mongoose CastError (ID inválido)
  else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Formato de ID inválido: ${err.value}`;
  }

  // 4. MongoDB duplicate key (código 11000)
  else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern)[0];
    message = `El valor para ${field} ya existe`;
  }

  // 5. Errores de JWT
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token inválido';
    code = 'TOKEN_INVALID';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expirado';
    code = 'TOKEN_EXPIRED';
  }

  // --- Logging estructurado con Pino ---
  if (statusCode >= 500) {
    logger.error('Error interno del servidor', {
      message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
  } else {
    logger.warn('Error operacional', {
      message,
      statusCode,
      path: req.path,
      method: req.method,
      ...(errors && { errors })
    });
  }

  // Sentry: la captura se delega a setupExpressErrorHandler({ shouldHandleError })
  // configurado en config/sentry.js. No se llama Sentry.captureException() aquí
  // para evitar doble-captura.

  // --- Respuesta al cliente ---
  res.status(statusCode).json({
    success: false,
    message,
    ...(code && { code }),
    ...(errors && errors.length > 0 && { errors }),
    ...(data && { data }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Middleware para manejar rutas no encontradas (404).
 * Construye un AppError y lo delega al errorHandler centralizado
 * para que se registre en Pino y tenga formato de respuesta unificado.
 *
 * Debe ir ANTES del errorHandler pero DESPUÉS de todas las rutas en server.js.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const notFoundHandler = (req, res, next) => {
  next(new AppError(`Ruta no encontrada: ${req.method} ${req.path}`, 404));
};

module.exports = {
  errorHandler,
  notFoundHandler
};
