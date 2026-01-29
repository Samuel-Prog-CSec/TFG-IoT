/**
 * @fileoverview Esquemas Zod comunes reutilizables.
 * Centraliza validaciones estándar (ObjectId, paginación, búsqueda).
 * @module validators/commonValidator
 */

const { z } = require('zod');

/**
 * Schema para validar ObjectId de MongoDB.
 * @type {import('zod').ZodString}
 */
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID de MongoDB inválido');

/**
 * Schema para validar UID de tarjeta RFID (8 o 14 hex).
 * @type {import('zod').ZodString}
 */
const uidSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-F]{8}$|^[0-9A-F]{14}$/, 'UID debe ser 8 o 14 caracteres hexadecimales');

/**
 * Schema base para paginación y búsqueda.
 * - page, limit: numéricos
 * - sortBy: se especifica en cada endpoint
 * - order: asc|desc
 * - search: texto libre (sanitizado en controller)
 */
const paginationSchema = z
  .object({
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

    sortBy: z.string().optional(),

    order: z.enum(['asc', 'desc']).optional().default('desc'),

    search: z.string().trim().max(100, 'search no puede exceder 100 caracteres').optional()
  })
  .strict();

/**
 * Schema para filtros de usuarios con paginación.
 */
const userFiltersSchema = paginationSchema.extend({
  role: z.enum(['super_admin', 'teacher', 'student']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  classroom: z.string().trim().max(50).optional(),
  createdBy: objectIdSchema.optional()
});

/**
 * Schema vacío (rechaza parámetros desconocidos).
 */
const emptyObjectSchema = z.object({}).strict().default({});

module.exports = {
  objectIdSchema,
  uidSchema,
  paginationSchema,
  userFiltersSchema,
  emptyObjectSchema
};
