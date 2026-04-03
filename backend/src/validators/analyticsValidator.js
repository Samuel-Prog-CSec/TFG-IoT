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

// ────────────── Schemas avanzados (Analytics Expansion) ─────────────────

/**
 * TimeRange extendido con soporte para 90 días.
 * Los endpoints existentes solo aceptan 7d/30d; los nuevos también aceptan 90d.
 */
const extendedTimeRangeQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d', '90d']).optional().default('30d')
  })
  .strict();

/**
 * Query params para GET /api/analytics/student/:id/trajectory
 */
const trajectoryQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d', '90d']).optional().default('30d'),
    granularity: z.enum(['daily', 'weekly', 'monthly']).optional()
  })
  .strict();

/**
 * Query params para GET /api/analytics/student/:id/velocity
 */
const velocityQuerySchema = z
  .object({
    timeRange: z.enum(['30d', '90d']).optional().default('30d'),
    windowDays: z.coerce.number().int().min(3).max(14).optional().default(7)
  })
  .strict();

/**
 * Query params para GET /api/analytics/student/:id/plateaus
 */
const plateauQuerySchema = z
  .object({
    timeRange: z.enum(['30d', '90d']).optional().default('30d'),
    minDays: z.coerce.number().int().min(3).max(30).optional().default(7)
  })
  .strict();

/**
 * Query params para GET /api/analytics/student/:id/evolution
 */
const evolutionQuerySchema = z
  .object({
    timeRange: z.enum(['30d', '90d']).optional().default('30d'),
    groupBy: z.enum(['context', 'mechanic']).optional().default('context')
  })
  .strict();

/**
 * Params para endpoints que reciben un GamePlay ID.
 */
const gameplayParamsSchema = z
  .object({
    id: objectIdSchema
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/card-analysis
 */
const cardAnalysisQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d']).optional().default('30d'),
    contextId: objectIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20)
  })
  .strict();

/**
 * Query params para GET /api/analytics/student/:id/struggles
 */
const strugglesQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d']).optional().default('30d'),
    minConsecutiveErrors: z.coerce.number().int().min(2).max(5).optional().default(2)
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/fatigue
 */
const fatigueQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d']).optional().default('30d')
  })
  .strict();

/**
 * Query params para GET /api/analytics/student/:id/engagement
 */
const engagementQuerySchema = z
  .object({
    timeRange: z.enum(['30d', '90d']).optional().default('30d')
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/engagement
 */
const classroomEngagementQuerySchema = z
  .object({
    timeRange: z.enum(['30d', '90d']).optional().default('30d'),
    sort: z
      .enum(['engagementScore', 'completionRate', 'playFrequency'])
      .optional()
      .default('engagementScore'),
    order: z.enum(['asc', 'desc']).optional().default('desc')
  })
  .strict();

/**
 * Query params para GET /api/analytics/student/:id/play-patterns
 */
const playPatternsQuerySchema = z
  .object({
    timeRange: z.enum(['30d', '90d']).optional().default('30d')
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/content-effectiveness
 */
const contentEffectivenessQuerySchema = z
  .object({
    timeRange: z.enum(['30d', '90d']).optional().default('30d'),
    groupBy: z.enum(['context', 'mechanic']).optional().default('context')
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/card-difficulty
 */
const cardDifficultyQuerySchema = z
  .object({
    timeRange: z.enum(['30d', '90d']).optional().default('30d'),
    contextId: objectIdSchema.optional(),
    threshold: z.coerce.number().min(10).max(90).optional().default(40)
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/learning-curves
 */
const learningCurvesQuerySchema = z
  .object({
    timeRange: z.enum(['90d']).optional().default('90d'),
    contextId: objectIdSchema.optional(),
    mechanicId: objectIdSchema.optional()
  })
  .strict();

/**
 * Query params para GET /api/analytics/alerts
 */
const alertsQuerySchema = z
  .object({
    severity: z.enum(['critical', 'warning', 'info']).optional(),
    type: z
      .enum([
        'declining_performance',
        'inactivity',
        'sudden_score_drop',
        'consistent_timeout',
        'improving_fast',
        'plateau_detected',
        'high_abandonment'
      ])
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20)
  })
  .strict();

/**
 * Query params para GET /api/analytics/reports/student/:id y /reports/classroom
 */
const reportQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d', '90d']).optional().default('30d'),
    format: z.enum(['summary', 'detailed']).optional().default('summary')
  })
  .strict();

/**
 * Query params para GET /api/analytics/reports/classroom/export
 */
const reportExportQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d', '90d']).optional().default('30d')
  })
  .strict();

module.exports = {
  // Schemas existentes
  analyticsStudentParamsSchema,
  analyticsTimeRangeQuerySchema,
  classroomStudentsQuerySchema,
  classroomDistributionQuerySchema,
  classroomTrendsQuerySchema,
  studentSummaryQuerySchema,
  classroomHeatmapQuerySchema,
  classroomRankingsQuerySchema,
  // Schemas avanzados
  extendedTimeRangeQuerySchema,
  trajectoryQuerySchema,
  velocityQuerySchema,
  plateauQuerySchema,
  evolutionQuerySchema,
  gameplayParamsSchema,
  cardAnalysisQuerySchema,
  strugglesQuerySchema,
  fatigueQuerySchema,
  engagementQuerySchema,
  classroomEngagementQuerySchema,
  playPatternsQuerySchema,
  contentEffectivenessQuerySchema,
  cardDifficultyQuerySchema,
  learningCurvesQuerySchema,
  alertsQuerySchema,
  reportQuerySchema,
  reportExportQuerySchema
};
