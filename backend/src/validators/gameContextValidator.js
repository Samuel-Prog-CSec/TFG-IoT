/**
 * @fileoverview Validadores Zod para GameContext.
 * Define esquemas de validación para contextos temáticos de juego.
 * @module validators/gameContextValidator
 */

const { z } = require('zod');
const { objectIdSchema, paginationSchema, sanitizedString } = require('./commonValidator');

// Zod 4 cambió la semántica de `z.preprocess(fn, schema.optional())`: el
// preprocess se invoca incluso cuando el valor entrante es `undefined` y
// pasa el resultado al schema interno, que termina rechazando el undefined
// con "expected nonoptional, received undefined". El patrón recomendado en
// Zod 4 es envolver el preprocess completo en `.optional()` para que el outer
// `ZodOptional` cortocircuite cuando el query param no viene presente
// (QA 2026-05-07: panel /admin/contexts crasheaba con 400 al cargar).
const booleanQuerySchema = z
  .preprocess(val => {
    if (typeof val === 'string') {
      const normalized = val.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
    return val;
  }, z.boolean())
  .optional();

/**
 * Schema para un asset individual dentro del contexto.
 *
 * Cada asset representa un elemento del contexto (ej: país, animal, color).
 * Puede incluir representaciones multimedia (audio, imagen).
 *
 * @example
 * {
 *   key: 'spain',
 *   display: '🇪🇸',
 *   value: 'España',
 *   audioUrl: 'https://storage.supabase.co/contexts/spain.mp3',
 *   imageUrl: 'https://storage.supabase.co/contexts/spain.jpg'
 * }
 */
const assetSchema = z
  .object({
    key: z
      .string()
      .min(1, 'La clave del asset es requerida')
      .max(100, 'La clave no puede exceder 100 caracteres')
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9_-]+$/,
        'La clave solo puede contener letras minúsculas, números, guiones y guiones bajos'
      ),

    display: sanitizedString({ min: 1, max: 200, label: 'El display del asset' }),

    value: sanitizedString({ min: 1, max: 200, label: 'El valor del asset' }),

    audioUrl: z.string().url({ message: 'La URL del audio debe ser válida' }).trim().optional(),

    imageUrl: z.string().url({ message: 'La URL de la imagen debe ser válida' }).trim().optional()
  })
  .strict();

/**
 * Schema para metadatos de asset en uploads (multipart).
 */
const uploadAssetMetaSchema = assetSchema
  .pick({
    key: true,
    value: true
  })
  .extend({
    display: assetSchema.shape.display.optional()
  })
  .strict();

/**
 * Schema para crear un nuevo contexto de juego.
 *
 * Un contexto define un tema completo (geografía, animales, colores, etc.)
 * con todos sus assets asociados. Es compatible con TODAS las mecánicas.
 *
 * Validaciones:
 * - contextId: Identificador único lowercase
 * - name: Nombre amigable
 * - assets: Array no vacío de assets válidos
 * - Keys de assets deben ser únicos
 *
 * @example
 * {
 *   contextId: 'geography',
 *   name: 'Geografía',
 *   assets: [
 *     { key: 'spain', display: '🇪🇸', value: 'España', audioUrl: '...' },
 *     { key: 'france', display: '🇫🇷', value: 'Francia', audioUrl: '...' }
 *   ]
 * }
 */
const contextIdSchema = z
  .string()
  .min(2, 'El contextId debe tener al menos 2 caracteres')
  .max(50, 'El contextId no puede exceder 50 caracteres')
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_-]+$/,
    'El contextId solo puede contener letras minúsculas, números, guiones y guiones bajos'
  );

// `assets` NO se acepta en la creación: el contexto se crea vacío y los assets se
// añaden después por los endpoints dedicados (upload con WebP + ownership por
// uploadedBy). Igual que en la actualización (ADR-197), esto impide inyectar URLs
// externas arbitrarias vía la API JSON saltándose el pipeline de imágenes.
const createGameContextSchema = z
  .object({
    contextId: contextIdSchema,

    name: sanitizedString({ min: 2, max: 100, label: 'El nombre' })
  })
  .strict();

/**
 * Schema para actualizar un contexto existente.
 * Permite actualización parcial pero valida unicidad de keys si se modifican assets.
 */
// NOTA SEGURIDAD (ADR-197): `assets` NO es actualizable por esta vía. Los assets se
// gestionan EXCLUSIVAMENTE por los endpoints dedicados (POST /images|/audio,
// DELETE .../:assetKey), que aplican validación de magic bytes, conversión WebP y
// ownership por `uploadedBy`. Permitir reemplazar el array `assets` aquí dejaba que un
// super_admin inyectara URLs externas arbitrarias (validadas solo como `z.string().url()`)
// que el frontend renderiza como `<img src>`, saltándose el pipeline, perdiendo el
// `uploadedBy` de los profesores y dejando archivos huérfanos en Storage.
const updateGameContextSchema = z
  .object({
    contextId: contextIdSchema.optional(),

    name: sanitizedString({ min: 2, max: 100, label: 'El nombre' }).optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  });

/**
 * Schema para query params de búsqueda de contextos.
 *
 * @example
 * GET /contexts?page=1&limit=10&sortBy=name&order=asc&search=geo
 */
const gameContextQuerySchema = paginationSchema.extend({
  sortBy: z.enum(['contextId', 'name', 'createdAt', 'updatedAt']).optional().default('createdAt'),
  isActive: booleanQuerySchema
});

/**
 * Schema para validar parámetros de ruta (:id)
 */
const gameContextParamsSchema = z
  .object({
    id: z.union([objectIdSchema, contextIdSchema])
  })
  .strict();

const gameContextIdParamsSchema = z
  .object({
    id: objectIdSchema
  })
  .strict();

/**
 * Schema para params con assetKey.
 */
const gameContextAssetParamsSchema = z
  .object({
    id: objectIdSchema,
    assetKey: assetSchema.shape.key
  })
  .strict();

module.exports = {
  createGameContextSchema,
  updateGameContextSchema,
  gameContextQuerySchema,
  gameContextParamsSchema,
  gameContextIdParamsSchema,
  gameContextAssetParamsSchema,
  uploadAssetMetaSchema,
  contextIdSchema,
  assetSchema
};
