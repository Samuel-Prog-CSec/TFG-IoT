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
 * - No puede repetir el mismo UID ni el mismo assignedValue dentro del mazo
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

module.exports = {
  objectIdSchema,
  uidSchema,
  cardDeckMappingSchema,
  createCardDeckSchema,
  updateCardDeckSchema,
  cardDeckQuerySchema,
  cardDeckParamsSchema,
  checkCardQuerySchema
};
