/**
 * @fileoverview Validadores Zod para CardDeck (mazos de cartas).
 * Permite a un profesor definir y reutilizar mapeos de tarjetas RFID dentro de un contexto.
 *
 * NOTA: Este validador se deja preparado para usarse en rutas más adelante.
 * @module validators/cardDeckValidator
 */

const { z } = require('zod');

/**
 * Schema para ObjectId de MongoDB
 */
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Formato de ObjectId inválido');

/**
 * Schema para validar UID de tarjeta RFID.
 * Debe ser 8 o 14 caracteres hexadecimales (MIFARE/NTAG).
 */
const uidSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-F]{8}$|^[0-9A-F]{14}$/, 'UID debe ser 8 o 14 caracteres hexadecimales');

/**
 * Schema para un mapeo de tarjeta dentro de un mazo.
 *
 * @example
 * {
 *   cardId: '507f1f77bcf86cd799439011',
 *   uid: '32B8FA05',
 *   assignedValue: 'España',
 *   displayData: { display: '🇪🇸', audioUrl: '...' }
 * }
 */
const cardDeckMappingSchema = z.object({
  cardId: objectIdSchema,

  uid: uidSchema,

  assignedValue: z
    .string()
    .min(1, 'El valor asignado es requerido')
    .max(200, 'El valor asignado no puede exceder 200 caracteres')
    .trim(),

  displayData: z.record(z.any()).optional().default({})
});

/**
 * Schema para crear un mazo.
 *
 * Reglas clave:
 * - Un mazo pertenece a un profesor (createdBy se infiere del JWT, por eso es opcional aquí)
 * - Un mazo se asocia a un contexto (contextId)
 * - Debe contener entre 2 y 20 cardMappings
 * - No puede repetir la misma tarjeta (uid/cardId) ni el mismo assignedValue dentro del mazo
 */
const createCardDeckSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(100, 'El nombre no puede exceder 100 caracteres'),

    description: z
      .string()
      .trim()
      .max(500, 'La descripción no puede exceder 500 caracteres')
      .optional(),

    contextId: objectIdSchema,

    cardMappings: z
      .array(cardDeckMappingSchema)
      .min(2, 'Debe haber al menos 2 cardMappings')
      .max(20, 'No pueden haber más de 20 cardMappings'),

    status: z.enum(['active', 'archived']).optional().default('active'),

    createdBy: objectIdSchema.optional()
  })
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
  )
  .refine(
    data => {
      const cardIds = data.cardMappings.map(m => m.cardId);
      return cardIds.length === new Set(cardIds).size;
    },
    {
      message: 'Los cardIds en cardMappings deben ser únicos',
      path: ['cardMappings']
    }
  )
  .refine(
    data => {
      const assignedValues = data.cardMappings.map(m => m.assignedValue);
      return assignedValues.length === new Set(assignedValues).size;
    },
    {
      message: 'No puede haber valores asignados duplicados en cardMappings',
      path: ['cardMappings']
    }
  );

/**
 * Schema para actualizar un mazo.
 * Permite actualizar name/description/contextId/cardMappings/status.
 */
const updateCardDeckSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(100, 'El nombre no puede exceder 100 caracteres')
      .optional(),

    description: z
      .string()
      .trim()
      .max(500, 'La descripción no puede exceder 500 caracteres')
      .optional(),

    contextId: objectIdSchema.optional(),

    cardMappings: z
      .array(cardDeckMappingSchema)
      .min(2, 'Debe haber al menos 2 cardMappings')
      .max(20, 'No pueden haber más de 20 cardMappings')
      .optional(),

    status: z.enum(['active', 'archived']).optional()
  })
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
  )
  .refine(
    data => {
      if (!data.cardMappings) {
        return true;
      }
      const cardIds = data.cardMappings.map(m => m.cardId);
      return cardIds.length === new Set(cardIds).size;
    },
    {
      message: 'Los cardIds en cardMappings deben ser únicos',
      path: ['cardMappings']
    }
  )
  .refine(
    data => {
      if (!data.cardMappings) {
        return true;
      }
      const assignedValues = data.cardMappings.map(m => m.assignedValue);
      return assignedValues.length === new Set(assignedValues).size;
    },
    {
      message: 'No puede haber valores asignados duplicados en cardMappings',
      path: ['cardMappings']
    }
  );

/**
 * Schema para query params de listado/búsqueda de mazos.
 */
const cardDeckQuerySchema = z.object({
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

  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'status']).optional().default('createdAt'),

  order: z.enum(['asc', 'desc']).optional().default('desc'),

  contextId: objectIdSchema.optional(),

  status: z.enum(['active', 'archived']).optional(),

  search: z.string().trim().min(1).max(100).optional()
});

/**
 * Schema para validar parámetros de ruta (:id)
 */
const cardDeckParamsSchema = z.object({
  id: objectIdSchema
});

module.exports = {
  objectIdSchema,
  uidSchema,
  cardDeckMappingSchema,
  createCardDeckSchema,
  updateCardDeckSchema,
  cardDeckQuerySchema,
  cardDeckParamsSchema
};
