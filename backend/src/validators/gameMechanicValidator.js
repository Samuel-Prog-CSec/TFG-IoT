/**
 * @fileoverview Validadores Zod para GameMechanic.
 *
 * Las mecánicas son inmutables a nivel de API (solo definidas por seeders),
 * por lo que únicamente se exponen los validadores necesarios para las
 * operaciones de lectura: filtros de listado y resolución por id/name.
 *
 * @module validators/gameMechanicValidator
 */

const { z } = require('zod');
const { objectIdSchema, paginationSchema } = require('./commonValidator');

/**
 * Identificador alfanumérico de una mecánica (slug).
 * Permite resolver una mecánica por su `name` desde rutas tipo
 * GET /api/mechanics/association.
 */
const mechanicNameSchema = z
  .string()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(50, 'El nombre no puede exceder 50 caracteres')
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_-]+$/,
    'El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos'
  );

/**
 * Schema para query params de búsqueda de mecánicas.
 *
 * @example
 * GET /mechanics?page=1&limit=10&isActive=true&sortBy=name&order=asc
 */
const gameMechanicQuerySchema = paginationSchema.extend({
  sortBy: z.enum(['name', 'displayName', 'createdAt', 'updatedAt']).optional().default('createdAt'),

  isActive: z
    .string()
    .optional()
    .transform(val => {
      if (val === 'true') {
        return true;
      }
      if (val === 'false') {
        return false;
      }
      return undefined;
    })
    .pipe(z.boolean().optional())
});

/**
 * Schema para validar parámetros de ruta (:id), aceptando tanto un ObjectId
 * de MongoDB como el slug de la mecánica (`association`, `memory`, ...).
 */
const gameMechanicParamsSchema = z
  .object({
    id: z.union([objectIdSchema, mechanicNameSchema])
  })
  .strict();

module.exports = {
  gameMechanicQuerySchema,
  gameMechanicParamsSchema,
  mechanicNameSchema
};
