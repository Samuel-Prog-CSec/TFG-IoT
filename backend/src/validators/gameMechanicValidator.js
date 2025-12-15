/**
 * @fileoverview Validadores Zod para GameMechanic.
 * Define esquemas de validación para mecánicas de juego.
 * @module validators/gameMechanicValidator
 */

const { z } = require('zod');

/**
 * Schema para ObjectId de MongoDB
 */
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Formato de ObjectId inválido');

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
const createGameMechanicSchema = z.object({
  name: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(50, 'El nombre no puede exceder 50 caracteres')
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9_-]+$/,
      'El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos'
    ),

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
});

/**
 * Schema para actualizar una mecánica existente.
 * Todos los campos son opcionales excepto que al menos uno debe estar presente.
 */
const updateGameMechanicSchema = createGameMechanicSchema
  .partial()
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  });

/**
 * Schema para query params de búsqueda de mecánicas.
 *
 * @example
 * GET /mechanics?page=1&limit=10&isActive=true&sortBy=name&order=asc
 */
const gameMechanicQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().min(1)),

  limit: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),

  sortBy: z.enum(['name', 'displayName', 'createdAt', 'updatedAt']).optional().default('createdAt'),

  order: z.enum(['asc', 'desc']).optional().default('desc'),

  isActive: z
    .string()
    .optional()
    .transform(val => (val === 'true' ? true : val === 'false' ? false : undefined))
    .pipe(z.boolean().optional()),

  search: z.string().trim().optional()
});

/**
 * Schema para validar parámetros de ruta (:id)
 */
const gameMechanicParamsSchema = z.object({
  id: objectIdSchema
});

module.exports = {
  createGameMechanicSchema,
  updateGameMechanicSchema,
  gameMechanicQuerySchema,
  gameMechanicParamsSchema
};
