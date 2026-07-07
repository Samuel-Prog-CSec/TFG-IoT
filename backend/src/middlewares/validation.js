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
 * Escribe el valor validado en la request sombreando cualquier getter heredado.
 *
 * En Express 5 `req.query` es un getter SIN setter definido en el prototype de la
 * request. Una asignación directa (`req.query = parsed`) es un NO-OP silencioso en
 * modo sloppy (los módulos CommonJS no son strict por defecto): la validación de
 * Zod se ejecuta y rechaza entradas inválidas, pero los `.default()`, las coerciones
 * (`z.coerce.number()`) y el stripping de claves NUNCA llegaban al controller, que
 * acababa leyendo el query crudo. `defineProperty` crea una propiedad de datos
 * PROPIA en la request que sombrea el getter del prototype, de modo que el controller
 * recibe el objeto ya validado y coaccionado. `req.body`/`req.params` son propiedades
 * propias escribibles, pero usamos el mismo mecanismo por uniformidad e idempotencia.
 *
 * @param {import('express').Request} req
 * @param {'body'|'query'|'params'} key
 * @param {unknown} value - Valor validado por Zod
 */
const assignValidated = (req, key, value) => {
  Object.defineProperty(req, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
};

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
    assignValidated(req, 'body', schema.parse(req.body));
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
    assignValidated(req, 'query', schema.parse(req.query));
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
    assignValidated(req, 'params', schema.parse(req.params));
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
