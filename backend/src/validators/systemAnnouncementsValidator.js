/**
 * @fileoverview Schemas Zod para SystemAnnouncement (T-942).
 *
 * @module validators/systemAnnouncementsValidator
 */

const { z } = require('zod');
const { objectIdSchema, sanitizedString } = require('./commonValidator');
const { SYSTEM_ANNOUNCEMENT_CONFIG } = require('../config/systemAlerts');

const announcementIdParamsSchema = z.object({ id: objectIdSchema }).strict();

const listAnnouncementsQuerySchema = z
  .object({
    active: z
      .string()
      .optional()
      .transform(v => {
        if (v === undefined) {
          return undefined;
        }
        return v === 'true';
      }),
    audience: z.enum([...SYSTEM_ANNOUNCEMENT_CONFIG.audiences]).optional()
  })
  .strict();

const createAnnouncementBodySchema = z
  .object({
    title: sanitizedString({ min: 3, max: 120, label: 'title' }),
    body: sanitizedString({ min: 3, max: 500, label: 'body', allowMultiline: true }),
    severity: z
      .enum([...SYSTEM_ANNOUNCEMENT_CONFIG.severities])
      .optional()
      .default('info'),
    audience: z
      .enum([...SYSTEM_ANNOUNCEMENT_CONFIG.audiences])
      .optional()
      .default('all_teachers'),
    linkUrl: z.string().trim().max(240).url().optional().nullable(),
    linkLabel: sanitizedString({ min: 0, max: 40, label: 'linkLabel' }).optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable()
  })
  .strict();

const updateAnnouncementBodySchema = z
  .object({
    title: sanitizedString({ min: 3, max: 120, label: 'title' }).optional(),
    body: sanitizedString({ min: 3, max: 500, label: 'body', allowMultiline: true }).optional(),
    severity: z.enum([...SYSTEM_ANNOUNCEMENT_CONFIG.severities]).optional(),
    audience: z.enum([...SYSTEM_ANNOUNCEMENT_CONFIG.audiences]).optional(),
    linkUrl: z.string().trim().max(240).url().optional().nullable(),
    linkLabel: sanitizedString({ min: 0, max: 40, label: 'linkLabel' }).optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, { message: 'Sin cambios' });

module.exports = {
  announcementIdParamsSchema,
  listAnnouncementsQuerySchema,
  createAnnouncementBodySchema,
  updateAnnouncementBodySchema
};
