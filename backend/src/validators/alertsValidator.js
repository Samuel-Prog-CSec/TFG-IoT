/**
 * @fileoverview Schemas Zod para el módulo de alertas inteligentes (T-941).
 *
 * Centraliza la validación de query/body/params de los endpoints REST de
 * SmartAlert. Los enums concretos viven en `config/alerts.js` (única fuente
 * de verdad).
 *
 * @module validators/alertsValidator
 */

const { z } = require('zod');
const { objectIdSchema } = require('./commonValidator');
const {
  ALERT_TYPE_KEYS,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  ALERT_PERIODS,
  DISMISS_REASONS,
  DETECTION_CONFIG
} = require('../config/alerts');

const alertIdParamsSchema = z.object({ id: objectIdSchema }).strict();

const listAlertsQuerySchema = z
  .object({
    status: z
      .enum(['all', ...ALERT_STATUSES])
      .optional()
      .default('active'),
    severity: z.enum([...ALERT_SEVERITIES]).optional(),
    type: z.enum([...ALERT_TYPE_KEYS]).optional(),
    studentId: objectIdSchema.optional(),
    period: z.enum([...ALERT_PERIODS]).optional(),
    cursor: objectIdSchema.optional(),
    limit: z
      .string()
      .optional()
      .transform(v => (v ? Number.parseInt(v, 10) : 20))
      .pipe(z.number().int().min(1).max(100))
  })
  .strict();

const alertsSummaryQuerySchema = z.object({}).strict().default({});

const alertsEffectivenessQuerySchema = z
  .object({
    days: z
      .string()
      .optional()
      .transform(v => (v ? Number.parseInt(v, 10) : 30))
      .pipe(z.number().int().min(1).max(365))
  })
  .strict()
  .default({});

const dismissAlertBodySchema = z
  .object({
    reason: z
      .enum([...DISMISS_REASONS])
      .optional()
      .default('other')
  })
  .strict()
  .default({});

const snoozeAlertBodySchema = z
  .object({
    untilDays: z.number().int().min(1).max(30).optional(),
    untilDate: z.string().datetime({ message: 'untilDate debe ser ISO-8601' }).optional()
  })
  .strict()
  .refine(data => data.untilDays || data.untilDate, {
    message: 'Especifica untilDays o untilDate'
  });

const bulkAlertActionBodySchema = z
  .object({
    ids: z.array(objectIdSchema).min(1).max(100),
    action: z.enum(['dismiss', 'resolve', 'snooze']),
    reason: z.enum([...DISMISS_REASONS]).optional(),
    untilDays: z.number().int().min(1).max(30).optional(),
    untilDate: z.string().datetime().optional()
  })
  .strict()
  .refine(data => data.action !== 'snooze' || data.untilDays || data.untilDate, {
    message: 'snooze requiere untilDays o untilDate'
  });

module.exports = {
  alertIdParamsSchema,
  listAlertsQuerySchema,
  alertsSummaryQuerySchema,
  alertsEffectivenessQuerySchema,
  dismissAlertBodySchema,
  snoozeAlertBodySchema,
  bulkAlertActionBodySchema,
  // Exponemos también la config útil para tests
  _config: DETECTION_CONFIG
};
