/**
 * @fileoverview Schemas Zod para SystemAnnouncement (T-942).
 *
 * @module validators/systemAnnouncementsValidator
 */

const { z } = require('zod');
const { objectIdSchema } = require('./commonValidator');
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
    title: z.string().trim().min(3).max(120),
    body: z.string().trim().min(3).max(500),
    severity: z
      .enum([...SYSTEM_ANNOUNCEMENT_CONFIG.severities])
      .optional()
      .default('info'),
    audience: z
      .enum([...SYSTEM_ANNOUNCEMENT_CONFIG.audiences])
      .optional()
      .default('all_teachers'),
    linkUrl: z.string().trim().max(240).url().optional().nullable(),
    linkLabel: z.string().trim().max(40).optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable()
  })
  .strict();

const updateAnnouncementBodySchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    body: z.string().trim().min(3).max(500).optional(),
    severity: z.enum([...SYSTEM_ANNOUNCEMENT_CONFIG.severities]).optional(),
    audience: z.enum([...SYSTEM_ANNOUNCEMENT_CONFIG.audiences]).optional(),
    linkUrl: z.string().trim().max(240).url().optional().nullable(),
    linkLabel: z.string().trim().max(40).optional().nullable(),
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
