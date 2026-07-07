/**
 * @fileoverview Validadores Zod para endpoints de administración.
 *
 * Centraliza schemas reutilizables por el área super_admin. Mantiene el
 * fichero `analyticsValidator.js` enfocado al docente (T-942 Fase B).
 *
 * @module validators/adminValidator
 */

const { z } = require('zod');

/**
 * Query params para GET /api/admin/analytics/overview.
 *
 * `timeRange` controla la ventana de agregación de partidas y top profesores.
 * Se acepta 7d/30d/90d, alineado con el selector temporal del frontend.
 */
const adminOverviewQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d', '90d']).optional().default('30d')
  })
  .strict();

module.exports = {
  adminOverviewQuerySchema
};
