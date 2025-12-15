/**
 * @fileoverview Validadores Zod para el modelo Card.
 * Define esquemas de validación para crear y actualizar tarjetas RFID.
 * @module validators/cardValidator
 */

const { z } = require('zod');

/**
 * Schema para validar UID de tarjeta RFID.
 * Debe ser 8 o 14 caracteres hexadecimales (MIFARE/NTAG).
 * @type {import('zod').ZodString}
 */
const uidSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-F]{8}$|^[0-9A-F]{14}$/, 'UID debe ser 8 o 14 caracteres hexadecimales');

/**
 * Schema para crear una nueva tarjeta RFID.
 */
const createCardSchema = z.object({
  uid: uidSchema,

  type: z
    .enum(['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN'], {
      errorMap: () => ({ message: 'Tipo de tarjeta inválido' })
    })
    .default('UNKNOWN'),

  status: z
    .enum(['active', 'inactive', 'lost'], {
      errorMap: () => ({ message: 'Estado de tarjeta inválido' })
    })
    .default('active'),

  metadata: z
    .object({
      color: z.string().trim().optional(),
      icon: z.string().trim().optional()
    })
    .optional()
});

/**
 * Schema para actualizar una tarjeta existente.
 * Todos los campos son opcionales excepto el UID (no se puede cambiar).
 */
const updateCardSchema = z.object({
  type: z.enum(['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN']).optional(),

  status: z.enum(['active', 'inactive', 'lost']).optional(),

  metadata: z
    .object({
      color: z.string().trim().optional(),
      icon: z.string().trim().optional()
    })
    .optional()
});

/**
 * Schema para query de búsqueda de tarjetas.
 */
const cardQuerySchema = z.object({
  uid: uidSchema.optional(),
  type: z.enum(['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN']).optional(),
  status: z.enum(['active', 'inactive', 'lost']).optional(),
  page: z
    .string()
    .transform(val => parseInt(val, 10))
    .pipe(z.number().int().min(1).default(1))
    .optional(),
  limit: z
    .string()
    .transform(val => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100).default(20))
    .optional(),
  sortBy: z.enum(['createdAt', 'uid', 'type']).default('createdAt').optional(),
  order: z.enum(['asc', 'desc']).default('desc').optional()
});

module.exports = {
  createCardSchema,
  updateCardSchema,
  cardQuerySchema,
  uidSchema
};
