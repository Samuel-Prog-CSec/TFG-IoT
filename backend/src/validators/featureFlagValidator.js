/**
 * @fileoverview Validadores Zod para los endpoints de feature flags.
 * @module validators/featureFlagValidator
 */

const { z } = require('zod');

/**
 * Nombre de flag: kebab o camelCase, 3-50 caracteres alfanuméricos (con - y _).
 * Evita conflictos con el FLAG_INDEX_KEY (__registry__).
 */
const flagNameSchema = z
  .string()
  .trim()
  .min(3, 'El nombre debe tener al menos 3 caracteres')
  .max(50, 'El nombre no puede exceder 50 caracteres')
  .regex(/^[a-z][\w-]*$/i, 'El nombre solo admite letras, números, - y _')
  .refine(name => !name.startsWith('__'), 'Los nombres con prefijo __ están reservados');

const flagNameParamsSchema = z
  .object({
    name: flagNameSchema
  })
  .strict();

/**
 * Cuerpo para crear o actualizar una flag (PATCH /api/admin/flags/:name).
 */
const upsertFlagSchema = z
  .object({
    enabled: z.boolean(),
    rolloutPct: z.number().int().min(0).max(100).default(0),
    whitelist: z
      .array(z.string().trim().min(1).max(64))
      .max(500, 'La whitelist no puede exceder 500 entradas')
      .default([]),
    reason: z.string().trim().max(280, 'La razón no puede exceder 280 caracteres').default('')
  })
  .strict();

module.exports = {
  flagNameSchema,
  flagNameParamsSchema,
  upsertFlagSchema
};
