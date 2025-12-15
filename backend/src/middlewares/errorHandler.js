/**
 * @fileoverview Middleware centralizado de manejo de errores.
 * Procesa todos los errores de la aplicación y los formatea apropiadamente.
 * @module middlewares/errorHandler
 */

const { Sentry } = require('../config/sentry');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Middleware de manejo de errores centralizado.
 * Debe ser el ÚLTIMO middleware en server.js.
 *
 * Maneja:
 * - Errores operacionales (AppError y subclases)
 * - Errores de Mongoose (validación, cast, duplicados)
 * - Errores inesperados (500)
 *
 * @param {Error} err - Error capturado
 * @param {import('express').Request} req - Objeto de petición
 * @param {import('express').Response} res - Objeto de respuesta
 * @param {import('express').NextFunction} next - Función next
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  // Log del error
  if (error.statusCode === 500) {
    logger.error('Error interno del servidor', {
      message: error.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
  } else {
    logger.warn('Error operacional', {
      message: error.message,
      statusCode: error.statusCode,
      path: req.path,
      method: req.method
    });
  }

  // Errores de Mongoose - ValidationError
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map(e => e.message)
      .join(', ');
    error = {
      message: `Error de validación: ${message}`,
      statusCode: 400
    };
  }

  // Errores de Mongoose - CastError (ID inválido)
  if (err.name === 'CastError') {
    error = {
      message: `Formato de ID inválido: ${err.value}`,
      statusCode: 400
    };
  }

  // Errores de Mongoose - Duplicado (código 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    error = {
      message: `El valor para ${field} ya existe`,
      statusCode: 409
    };
  }

  // Errores de JWT
  if (err.name === 'JsonWebTokenError') {
    error = {
      message: 'Token inválido',
      statusCode: 401
    };
  }

  if (err.name === 'TokenExpiredError') {
    error = {
      message: 'Token expirado',
      statusCode: 401
    };
  }

  // Solo capturar en Sentry si es un error NO operacional (500)
  if (error.statusCode === 500 || !err.isOperational) {
    Sentry.captureException(err, {
      tags: {
        path: req.path,
        method: req.method,
        statusCode: error.statusCode
      },
      user: req.user
        ? {
            id: req.user._id,
            email: req.user.email
          }
        : undefined
    });
  }

  // Respuesta al cliente
  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    // Solo incluir stack trace en desarrollo
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Middleware para manejar rutas no encontradas (404).
 * Debe ir ANTES del errorHandler pero DESPUÉS de todas las rutas.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.path}`
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
};
