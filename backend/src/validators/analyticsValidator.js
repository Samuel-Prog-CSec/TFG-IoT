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
    classroom: z.string().trim().max(50).optional(),
    contextId: objectIdSchema.optional(),
    mechanicId: objectIdSchema.optional()
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/summary
 *
 * T-942 Fase E: el resumen de KPIs acepta los mismos filtros que el resto del
 * Dashboard (contexto/mecánica/rango). Antes la ruta usaba `emptyObjectSchema`,
 * que rechazaba cualquier query param.
 */
const classroomSummaryQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d', '90d']).optional(),
    contextId: objectIdSchema.optional(),
    mechanicId: objectIdSchema.optional()
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/distribution
 *
 * T-942 Fase E: acepta filtros opcionales de contexto/mecánica y `90d`
 * (el Dashboard mapea "Trimestre actual" → 90d).
 */
const classroomDistributionQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d', '90d']).optional(),
    contextId: objectIdSchema.optional(),
    mechanicId: objectIdSchema.optional()
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/trends
 *
 * T-942 Fase E: acepta filtros opcionales de contexto/mecánica y `90d`
 * (el Dashboard mapea "Trimestre actual" → 90d).
 */
const classroomTrendsQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d', '90d']).optional().default('7d'),
    contextId: objectIdSchema.optional(),
    mechanicId: objectIdSchema.optional()
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/comparison
 *
 * QA 2026-05-30: la ruta usaba `analyticsTimeRangeQuerySchema` (7d/30d), pero el
 * selector temporal del Dashboard ofrece 90d ("Trimestre actual" → 90d) y los
 * filtros de contexto/mecánica. Sin este schema dedicado, elegir 90d devolvía
 * 400 y la línea "Rendimiento de Clase (Tendencia)" quedaba vacía. Acepta 90d y
 * los filtros de contenido para que la tendencia responda al mismo subconjunto
 * que los KPIs (decisión de producto: la tendencia sí filtra).
 */
const classroomComparisonQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d', '90d']).optional(),
    contextId: objectIdSchema.optional(),
    mechanicId: objectIdSchema.optional()
  })
  .strict();

/**
 * Query params para GET /api/analytics/student/:id/summary
 *
 * QA 2026-05-30: el selector temporal del perfil de alumno ofrece 90d, pero el
 * schema solo aceptaba 7d/30d → 400 al elegir "Últimos 90 días". `getDateRange`
 * (servicio) ya soporta 90d, así que basta ampliar el enum.
 */
const studentSummaryQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d', '90d']).optional().default('30d')
  })
  .strict();

/**
 * Query params para GET /api/analytics/classroom/heatmap
 *
 * QA 2026-05-30: el selector del Dashboard ofrece 90d ("Trimestre actual"), pero
 * el schema solo aceptaba 7d/30d → 400 y "Actividad Semanal" quedaba vacía.
 * `getDateRange` (servicio) ya soporta 90d, así que basta ampliar el enum.
 */
const classroomHeatmapQuerySchema = z
  .object({
    timeRange: z.enum(['7d', '30d', '90d']).optional().default('30d')
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
    groupBy: z.enum(['context', 'mechanic', 'cross']).optional().default('context'),
    includeEmpty: z.coerce.boolean().optional().default(false)
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

// (alertsQuerySchema reemplazado por listAlertsQuerySchema en
//  validators/alertsValidator.js — T-941)

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
  classroomSummaryQuerySchema,
  classroomDistributionQuerySchema,
  classroomTrendsQuerySchema,
  classroomComparisonQuerySchema,
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
  reportQuerySchema,
  reportExportQuerySchema
};
