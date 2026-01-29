/**
 * @fileoverview Validadores Zod para el modelo Card.
 * Define esquemas de validación para crear y actualizar tarjetas RFID.
 * @module validators/cardValidator
 */

const { z } = require('zod');
const { objectIdSchema, paginationSchema, uidSchema } = require('./commonValidator');

/**
 * Schema para validar UID de tarjeta RFID.
 * Debe ser 8 o 14 caracteres hexadecimales (MIFARE/NTAG).
 * @type {import('zod').ZodString}
 */
const cardUidSchema = uidSchema;

/**
 * Schema para crear una nueva tarjeta RFID.
 */
const createCardSchema = z
  .object({
    uid: cardUidSchema,

    type: z
      .enum(['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN'], {
        errorMap: () => ({ message: 'Tipo de tarjeta inválido' })
      })
      .default('UNKNOWN'),

    status: z
      .enum(['active', 'inactive', 'lost'], {
        errorMap: () => ({ message: 'Estado de tarjeta inválido' })
      })
      .default('active')
  })
  .strict();

/**
 * Schema para actualizar una tarjeta existente.
 * Todos los campos son opcionales excepto el UID (no se puede cambiar).
 */
const updateCardSchema = z
  .object({
    type: z.enum(['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN']).optional(),

    status: z.enum(['active', 'inactive', 'lost']).optional()
  })
  .strict();

/**
 * Schema para query de búsqueda de tarjetas.
 */
const cardQuerySchema = paginationSchema.extend({
  uid: cardUidSchema.optional(),
  type: z.enum(['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN']).optional(),
  status: z.enum(['active', 'inactive', 'lost']).optional(),
  sortBy: z.enum(['createdAt', 'uid', 'type']).default('createdAt').optional()
});

/**
 * Schema para params en GET /api/cards/:id (ObjectId o UID).
 */
const cardIdOrUidParamsSchema = z
  .object({
    id: z.union([objectIdSchema, cardUidSchema])
  })
  .strict();

/**
 * Schema para params en PUT/DELETE /api/cards/:id (solo ObjectId).
 */
const cardIdParamsSchema = z
  .object({
    id: objectIdSchema
  })
  .strict();

/**
 * Schema para registrar tarjetas en batch.
 */
const createCardsBatchSchema = z
  .object({
    cards: z
      .array(
        z
          .object({
            uid: cardUidSchema,
            type: z.enum(['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN']).optional(),
            status: z.enum(['active', 'inactive', 'lost']).optional()
          })
          .strict()
      )
      .min(1, 'Debe proporcionar al menos una tarjeta')
      .max(500, 'No se pueden registrar más de 500 tarjetas por batch')
  })
  .strict();

module.exports = {
  createCardSchema,
  updateCardSchema,
  cardQuerySchema,
  uidSchema: cardUidSchema,
  cardIdOrUidParamsSchema,
  cardIdParamsSchema,
  createCardsBatchSchema
};
