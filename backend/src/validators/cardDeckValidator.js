/**
 * @fileoverview Validadores Zod para CardDeck (mazos de cartas).
 * Permite a un profesor definir y reutilizar mapeos de tarjetas RFID dentro de un contexto.
 *
 * NOTA: Este validador se deja preparado para usarse en rutas más adelante.
 * @module validators/cardDeckValidator
 */

const { z } = require('zod');
const {
  objectIdSchema,
  paginationSchema,
  uidSchema,
  cardMappingSchema,
  sanitizedString
} = require('./commonValidator');
const { DECK_STATUS } = require('../constants/enums');
const {
  MIN_CARD_MM,
  MAX_CARD_WIDTH_MM,
  MAX_CARD_HEIGHT_MM,
  DEFAULT_CARD_WIDTH_MM,
  DEFAULT_CARD_HEIGHT_MM
} = require('../constants/print');

// `cardDeckMappingSchema` se mantiene como alias del cardMappingSchema consolidado
// en commonValidator para preservar el API público existente (otros módulos
// pueden importarlo desde aquí).
const cardDeckMappingSchema = cardMappingSchema;

/**
 * Schema para crear un mazo.
 *
 * Reglas clave:
 * - Un mazo pertenece a un profesor (createdBy se infiere del JWT, por eso es opcional aquí)
 * - Un mazo se asocia a un contexto (contextId)
 * - Debe contener entre 2 y 20 cardMappings
 * - No puede repetir el mismo UID. El `assignedValue` SÍ puede repetirse: Memoria
 *   usa parejas (dos cartas con el mismo valor) y la corrección de Asociación
 *   valida por valor (no por UID), así que los valores duplicados se manejan
 *   correctamente en ambas mecánicas. (La unicidad de `assignedValue` NO se exige
 *   ni aquí ni en el controlador; el comentario anterior la afirmaba en falso.)
 */
const createCardDeckSchema = z
  .object({
    name: sanitizedString({ min: 2, max: 100, label: 'El nombre' }),

    description: sanitizedString({
      min: 0,
      max: 500,
      label: 'La descripción',
      allowMultiline: true
    }).optional(),

    contextId: objectIdSchema,

    cardMappings: z
      .array(cardDeckMappingSchema)
      .min(2, 'Debe haber al menos 2 cardMappings')
      .max(20, 'No pueden haber más de 20 cardMappings'),

    status: z
      .enum([...DECK_STATUS])
      .optional()
      .default('active'),

    createdBy: objectIdSchema.optional()
  })
  .strict()
  .refine(
    data => {
      const uids = data.cardMappings.map(m => m.uid);
      return uids.length === new Set(uids).size;
    },
    {
      message:
        'Los UIDs en cardMappings deben ser únicos (no se puede usar la misma tarjeta dos veces)',
      path: ['cardMappings']
    }
  );

/**
 * Schema para actualizar un mazo.
 * Permite actualizar name/description/contextId/cardMappings/status.
 */
const updateCardDeckSchema = z
  .object({
    name: sanitizedString({ min: 2, max: 100, label: 'El nombre' }).optional(),

    description: sanitizedString({
      min: 0,
      max: 500,
      label: 'La descripción',
      allowMultiline: true
    }).optional(),

    contextId: objectIdSchema.optional(),

    cardMappings: z
      .array(cardDeckMappingSchema)
      .min(2, 'Debe haber al menos 2 cardMappings')
      .max(20, 'No pueden haber más de 20 cardMappings')
      .optional(),

    status: z.enum([...DECK_STATUS]).optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  })
  .refine(
    data => {
      if (!data.cardMappings) {
        return true;
      }
      const uids = data.cardMappings.map(m => m.uid);
      return uids.length === new Set(uids).size;
    },
    {
      message: 'Los UIDs en cardMappings deben ser únicos',
      path: ['cardMappings']
    }
  );

/**
 * Schema para query params de listado/búsqueda de mazos.
 */
const cardDeckQuerySchema = paginationSchema.extend({
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'status']).optional().default('createdAt'),

  contextId: objectIdSchema.optional(),

  status: z.enum([...DECK_STATUS]).optional(),

  search: z.string().trim().min(1).max(100).optional()
});

/**
 * Schema para validar parámetros de ruta (:id)
 */
const cardDeckParamsSchema = z
  .object({
    id: objectIdSchema
  })
  .strict();

/**
 * Schema para verificar si un UID existe en otros mazos activos (ADR-022).
 * Usado en GET /api/decks/check-card?uid=...
 */
const checkCardQuerySchema = z
  .object({
    uid: uidSchema,
    excludeDeckId: objectIdSchema.optional()
  })
  .strict();

/**
 * Schema para generar el PDF imprimible de un mazo (POST /api/decks/:id/print).
 *
 * Los tamaños se expresan en milímetros (el frontend convierte desde cm). Actúan
 * como cota MÁXIMA de cada tarjeta: la imagen se escala sin deformarse dentro de
 * ese rectángulo. Los rangos garantizan que quepa al menos una tarjeta en A4.
 * `cardUids` permite imprimir solo un subconjunto (ahorro de papel al reimprimir).
 */
const printDeckSchema = z
  .object({
    cardWidthMm: z
      .number()
      .min(MIN_CARD_MM, `El ancho mínimo es ${MIN_CARD_MM} mm`)
      .max(MAX_CARD_WIDTH_MM, `El ancho máximo es ${MAX_CARD_WIDTH_MM} mm`)
      .optional()
      .default(DEFAULT_CARD_WIDTH_MM),

    cardHeightMm: z
      .number()
      .min(MIN_CARD_MM, `El alto mínimo es ${MIN_CARD_MM} mm`)
      .max(MAX_CARD_HEIGHT_MM, `El alto máximo es ${MAX_CARD_HEIGHT_MM} mm`)
      .optional()
      .default(DEFAULT_CARD_HEIGHT_MM),

    cardUids: z.array(uidSchema).min(1).max(20).optional(),

    showLabel: z.boolean().optional().default(false),

    cropMarks: z.boolean().optional().default(true),

    orientation: z.enum(['auto', 'portrait', 'landscape']).optional().default('auto')
  })
  .strict()
  .refine(
    ({ cardWidthMm, cardHeightMm }) => {
      const fitsPortrait = cardWidthMm <= MAX_CARD_WIDTH_MM && cardHeightMm <= MAX_CARD_HEIGHT_MM;
      const fitsLandscape = cardWidthMm <= MAX_CARD_HEIGHT_MM && cardHeightMm <= MAX_CARD_WIDTH_MM;
      return fitsPortrait || fitsLandscape;
    },
    {
      message: 'El tamaño de tarjeta indicado no cabe en una página A4',
      path: ['cardWidthMm']
    }
  );

module.exports = {
  objectIdSchema,
  uidSchema,
  cardDeckMappingSchema,
  createCardDeckSchema,
  updateCardDeckSchema,
  cardDeckQuerySchema,
  cardDeckParamsSchema,
  checkCardQuerySchema,
  printDeckSchema
};
