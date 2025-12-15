/**
 * @fileoverview Middleware de validación con Zod.
 * Valida req.body, req.query y req.params usando schemas de Zod.
 * @module middlewares/validation
 */

const { z } = require('zod');
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Middleware para validar el body de la petición.
 *
 * @param {import('zod').ZodSchema} schema - Schema de Zod para validar
 * @returns {Function} Middleware de Express
 *
 * @example
 * router.post('/users', validateBody(createUserSchema), createUser);
 */
const validateBody = schema => (req, res, next) => {
  try {
    // Validar y transformar datos
    const validated = schema.parse(req.body);
    req.body = validated; // Reemplazar con datos validados y transformados
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Formatear errores de Zod
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));

      logger.warn('Validación de body fallida', { errors: formattedErrors, path: req.path });

      return res.status(400).json({
        success: false,
        message: 'Error de validación',
        errors: formattedErrors
      });
    }
    next(error); // Otros errores van al errorHandler
  }
};

/**
 * Middleware para validar query params de la petición.
 *
 * @param {import('zod').ZodSchema} schema - Schema de Zod para validar
 * @returns {Function} Middleware de Express
 *
 * @example
 * router.get('/users', validateQuery(userQuerySchema), getUsers);
 */
const validateQuery = schema => (req, res, next) => {
  try {
    const validated = schema.parse(req.query);
    req.query = validated;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));

      logger.warn('Validación de query fallida', { errors: formattedErrors, path: req.path });

      return res.status(400).json({
        success: false,
        message: 'Parámetros de consulta inválidos',
        errors: formattedErrors
      });
    }
    next(error);
  }
};

/**
 * Middleware para validar params de la petición.
 *
 * @param {import('zod').ZodSchema} schema - Schema de Zod para validar
 * @returns {Function} Middleware de Express
 *
 * @example
 * const paramSchema = z.object({ id: objectIdSchema });
 * router.get('/users/:id', validateParams(paramSchema), getUser);
 */
const validateParams = schema => (req, res, next) => {
  try {
    const validated = schema.parse(req.params);
    req.params = validated;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));

      logger.warn('Validación de params fallida', { errors: formattedErrors, path: req.path });

      return res.status(400).json({
        success: false,
        message: 'Parámetros de ruta inválidos',
        errors: formattedErrors
      });
    }
    next(error);
  }
};

module.exports = {
  validateBody,
  validateQuery,
  validateParams
};
