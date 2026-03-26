/**
 * @fileoverview Validadores Zod para endpoints de analiticas.
 * @module validators/analyticsValidator
 */

const { z } = require('zod');
const { objectIdSchema } = require('./commonValidator');

// ────────────────── Schemas existentes ──────────────────

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

// ────────────── Nuevos schemas (T-601) ─────────────────

/**
 * Query params para GET /api/analytics/classroom/students
 */
const classroomStudentsQuerySchema = z
  .object({
    sort: z.enum(['name', 'score', 'lastPlayed', 'accuracy']).optional().default('name'),
    order: z.enum(['asc', 'desc']).optional().default('asc'),
    tier: z.enum(['risk', 'average', 'good', 'excellent']).optional(),
    classroom: z.string().trim().max(50).optional()
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/distribution
 */
const classroomDistributionQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d']).optional()
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/trends
 */
const classroomTrendsQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d']).optional().default('7d')
  })
  .strict();

/**
 * Query params para GET /api/analytics/student/:id/summary
 */
const studentSummaryQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d']).optional().default('30d')
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/heatmap
 */
const classroomHeatmapQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d']).optional().default('30d')
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/rankings
 */
const classroomRankingsQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d']).optional().default('30d'),
    limit: z.coerce.number().int().min(1).max(20).optional().default(5)
  })
  .strict();

module.exports = {
  analyticsStudentParamsSchema,
  analyticsTimeRangeQuerySchema,
  classroomStudentsQuerySchema,
  classroomDistributionQuerySchema,
  classroomTrendsQuerySchema,
  studentSummaryQuerySchema,
  classroomHeatmapQuerySchema,
  classroomRankingsQuerySchema
};
