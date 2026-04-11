/**
 * @fileoverview Middleware de validación con Zod.
 * Valida req.body, req.query y req.params usando schemas de Zod.
 * Los errores de validación se delegan al errorHandler centralizado
 * mediante next(new ValidationError(...)) para garantizar logging
 * estructurado (Pino), formato de respuesta unificado y evaluación por Sentry.
 * @module middlewares/validation
 */

const { z } = require('zod');
const { ValidationError } = require('../utils/errors');

/**
 * Formatea los issues de Zod en un array de errores con campo y mensaje.
 *
 * @param {import('zod').ZodIssue[]} issues - Issues de validación de Zod
 * @returns {Array<{field: string, message: string}>} Errores formateados
 */
const formatZodErrors = issues =>
  issues.map(issue => ({
    field: issue.path.join('.'),
    message: issue.message
  }));

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
    req.body = schema.parse(req.body);
    return next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new ValidationError('Error de validación', formatZodErrors(error.issues)));
    }
    return next(error);
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
    req.query = schema.parse(req.query);
    return next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new ValidationError('Parámetros de consulta inválidos', formatZodErrors(error.issues))
      );
    }
    return next(error);
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
    req.params = schema.parse(req.params);
    return next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new ValidationError('Parámetros de ruta inválidos', formatZodErrors(error.issues))
      );
    }
    return next(error);
  }
};

module.exports = {
  validateBody,
  validateQuery,
  validateParams
};
