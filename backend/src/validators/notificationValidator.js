/**
 * @fileoverview Validadores Zod para los endpoints de notificaciones (T-955).
 * @module validators/notificationValidator
 */

const { z } = require('zod');
const { objectIdSchema } = require('./commonValidator');

/**
 * Query del listado: paginación cursor por `createdAt`.
 * - `limit` opcional, entero 1..100 (default 20).
 * - `before` opcional, ISO date string (cursor para "más antiguas que").
 */
const notificationListQuerySchema = z
  .object({
    limit: z
      .string()
      .optional()
      .transform(val => (val ? Number.parseInt(val, 10) : 20))
      .pipe(z.number().int().min(1).max(100)),
    before: z.string().datetime({ message: 'before debe ser una fecha ISO 8601 válida' }).optional()
  })
  .strict();

/**
 * Query vacía para endpoints que no aceptan parámetros (markAllRead, count).
 */
const emptyNotificationQuerySchema = z.object({}).strict();

/**
 * Params para endpoints que reciben `:id`.
 */
const notificationParamsSchema = z
  .object({
    id: objectIdSchema
  })
  .strict();

module.exports = {
  notificationListQuerySchema,
  emptyNotificationQuerySchema,
  notificationParamsSchema
};
