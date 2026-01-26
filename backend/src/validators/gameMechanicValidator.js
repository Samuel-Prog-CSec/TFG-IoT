/**
 * @fileoverview Validadores Zod para GameMechanic.
 * Define esquemas de validación para mecánicas de juego.
 * @module validators/gameMechanicValidator
 */

const { z } = require('zod');
const { objectIdSchema, paginationSchema } = require('./commonValidator');

/**
 * Schema para crear una nueva mecánica de juego.
 *
 * Validaciones:
 * - name: Identificador único, lowercase, sin espacios
 * - displayName: Nombre amigable para UI
 * - description: Descripción detallada
 * - icon: Emoji o URL
 * - rules: Objeto flexible con reglas específicas
 * - isActive: Estado de disponibilidad
 *
 * @example
 * {
 *   name: 'association',
 *   displayName: 'Asociación',
 *   description: 'Empareja elementos relacionados',
 *   icon: '🔗',
 *   rules: { pairsRequired: true, allowMultipleAttempts: false },
 *   isActive: true
 * }
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

const createGameMechanicSchema = z
  .object({
    name: mechanicNameSchema,

    displayName: z
      .string()
      .min(2, 'El nombre de visualización debe tener al menos 2 caracteres')
      .max(100, 'El nombre de visualización no puede exceder 100 caracteres')
      .trim(),

    description: z
      .string()
      .min(10, 'La descripción debe tener al menos 10 caracteres')
      .max(500, 'La descripción no puede exceder 500 caracteres')
      .trim(),

    icon: z.string().trim().optional(),

    rules: z.record(z.any()).optional().default({}),

    isActive: z.boolean().default(true)
  })
  .strict();

/**
 * Schema para actualizar una mecánica existente.
 * Todos los campos son opcionales excepto que al menos uno debe estar presente.
 */
const updateGameMechanicSchema = createGameMechanicSchema
  .partial()
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  });

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
    .transform(val => (val === 'true' ? true : val === 'false' ? false : undefined))
    .pipe(z.boolean().optional())
});

/**
 * Schema para validar parámetros de ruta (:id)
 */
const gameMechanicParamsSchema = z
  .object({
    id: z.union([objectIdSchema, mechanicNameSchema])
  })
  .strict();

const gameMechanicIdParamsSchema = z
  .object({
    id: objectIdSchema
  })
  .strict();

module.exports = {
  createGameMechanicSchema,
  updateGameMechanicSchema,
  gameMechanicQuerySchema,
  gameMechanicParamsSchema,
  gameMechanicIdParamsSchema,
  mechanicNameSchema
};
