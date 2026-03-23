/**
 * @fileoverview Validadores Zod para GameContext.
 * Define esquemas de validación para contextos temáticos de juego.
 * @module validators/gameContextValidator
 */

const { z } = require('zod');
const { objectIdSchema, paginationSchema } = require('./commonValidator');

const booleanQuerySchema = z.preprocess(val => {
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
}, z.boolean().optional());

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

    display: z
      .string()
      .min(1, 'El display del asset es requerido')
      .max(200, 'El display no puede exceder 200 caracteres')
      .trim(),

    value: z
      .string()
      .min(1, 'El valor del asset es requerido')
      .max(200, 'El valor no puede exceder 200 caracteres')
      .trim(),

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

const createGameContextSchema = z
  .object({
    contextId: contextIdSchema,

    name: z
      .string()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(100, 'El nombre no puede exceder 100 caracteres')
      .trim(),

    assets: z
      .array(assetSchema)
      .min(0)
      .max(30, 'No se pueden tener más de 30 assets')
      .optional()
      .default([])
  })
  .strict()
  .refine(
    data => {
      // Validar que las keys de los assets sean únicas (si hay alguno)
      const keys = (data.assets || []).map(asset => asset.key);
      const uniqueKeys = new Set(keys);
      return keys.length === uniqueKeys.size;
    },
    {
      message: 'Las claves (keys) de los assets deben ser únicas',
      path: ['assets']
    }
  );

/**
 * Schema para actualizar un contexto existente.
 * Permite actualización parcial pero valida unicidad de keys si se modifican assets.
 */
const updateGameContextSchema = z
  .object({
    contextId: contextIdSchema.optional(),

    name: z.string().min(2).max(100).trim().optional(),

    assets: z.array(assetSchema).min(0).max(30).optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  })
  .refine(
    data => {
      // Si se actualizan assets, validar unicidad
      if (data.assets) {
        const keys = data.assets.map(asset => asset.key);
        const uniqueKeys = new Set(keys);
        return keys.length === uniqueKeys.size;
      }
      return true;
    },
    {
      message: 'Las claves (keys) de los assets deben ser únicas',
      path: ['assets']
    }
  );

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

/**
 * Schema para añadir un asset a un contexto existente.
 *
 * @example
 * POST /contexts/:id/assets
 * { key: 'italy', display: '🇮🇹', value: 'Italia' }
 */
const addAssetSchema = assetSchema;

module.exports = {
  createGameContextSchema,
  updateGameContextSchema,
  gameContextQuerySchema,
  gameContextParamsSchema,
  gameContextIdParamsSchema,
  gameContextAssetParamsSchema,
  addAssetSchema,
  uploadAssetMetaSchema,
  contextIdSchema,
  assetSchema
};
