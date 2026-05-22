/**
 * @fileoverview Schemas Zod para SystemAlert (T-942).
 *
 * @module validators/systemAlertsValidator
 */

const { z } = require('zod');
const { objectIdSchema } = require('./commonValidator');
const {
  SYSTEM_ALERT_TYPE_KEYS,
  SYSTEM_ALERT_SEVERITIES,
  SYSTEM_ALERT_STATUSES,
  SYSTEM_ALERT_SOURCES,
  SYSTEM_DISMISS_REASONS,
  SYSTEM_DETECTION_CONFIG
} = require('../config/systemAlerts');

const systemAlertIdParamsSchema = z.object({ id: objectIdSchema }).strict();

const listSystemAlertsQuerySchema = z
  .object({
    status: z
      .enum(['all', ...SYSTEM_ALERT_STATUSES])
      .optional()
      .default('active'),
    severity: z.enum([...SYSTEM_ALERT_SEVERITIES]).optional(),
    source: z.enum([...SYSTEM_ALERT_SOURCES]).optional(),
    type: z.enum([...SYSTEM_ALERT_TYPE_KEYS]).optional(),
    cursor: objectIdSchema.optional(),
    limit: z
      .string()
      .optional()
      .transform(v => (v ? Number.parseInt(v, 10) : 20))
      .pipe(z.number().int().min(1).max(100))
  })
  .strict();

const systemAlertsSummaryQuerySchema = z.object({}).strict().default({});

const systemAlertsEffectivenessQuerySchema = z
  .object({
    days: z
      .string()
      .optional()
      .transform(v => (v ? Number.parseInt(v, 10) : 30))
      .pipe(z.number().int().min(1).max(365))
  })
  .strict()
  .default({});

const dismissSystemAlertBodySchema = z
  .object({
    reason: z
      .enum([...SYSTEM_DISMISS_REASONS])
      .optional()
      .default('other')
  })
  .strict()
  .default({});

const snoozeSystemAlertBodySchema = z
  .object({
    untilHours: z.number().int().min(1).max(72).optional(),
    untilDays: z.number().int().min(1).max(30).optional(),
    untilDate: z.string().datetime({ message: 'untilDate debe ser ISO-8601' }).optional()
  })
  .strict()
  .refine(data => data.untilHours || data.untilDays || data.untilDate, {
    message: 'Especifica untilHours, untilDays o untilDate'
  });

const bulkSystemAlertActionBodySchema = z
  .object({
    ids: z.array(objectIdSchema).min(1).max(100),
    action: z.enum(['dismiss', 'resolve', 'snooze']),
    reason: z.enum([...SYSTEM_DISMISS_REASONS]).optional(),
    untilHours: z.number().int().min(1).max(72).optional(),
    untilDays: z.number().int().min(1).max(30).optional(),
    untilDate: z.string().datetime().optional()
  })
  .strict()
  .refine(data => data.action !== 'snooze' || data.untilHours || data.untilDays || data.untilDate, {
    message: 'snooze requiere untilHours, untilDays o untilDate'
  });

module.exports = {
  systemAlertIdParamsSchema,
  listSystemAlertsQuerySchema,
  systemAlertsSummaryQuerySchema,
  systemAlertsEffectivenessQuerySchema,
  dismissSystemAlertBodySchema,
  snoozeSystemAlertBodySchema,
  bulkSystemAlertActionBodySchema,
  _config: SYSTEM_DETECTION_CONFIG
};
