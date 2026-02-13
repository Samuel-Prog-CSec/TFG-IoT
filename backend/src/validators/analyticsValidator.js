/**
 * @fileoverview Validadores Zod para endpoints de analiticas.
 * @module validators/analyticsValidator
 */

const { z } = require('zod');
const { objectIdSchema } = require('./commonValidator');

const analyticsStudentParamsSchema = z
  .object({
    id: objectIdSchema
  })
  .strict();

const analyticsTimeRangeQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d']).optional()
  })
  .strict();

module.exports = {
  analyticsStudentParamsSchema,
  analyticsTimeRangeQuerySchema
};
