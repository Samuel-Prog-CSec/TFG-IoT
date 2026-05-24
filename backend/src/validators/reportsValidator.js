/**
 * @fileoverview Validadores Zod para endpoints de informes (T-942 Fase B).
 *
 * Cubre dos colecciones:
 * - `ReportTemplate` (plantillas predefinidas — listado, creación y borrado).
 * - `GeneratedReport` (informes persistidos del docente — listar, abrir,
 *   guardar y borrar).
 *
 * Mensajes de error en español; identificadores en inglés.
 *
 * @module validators/reportsValidator
 */

const { z } = require('zod');
const { objectIdSchema, sanitizedString } = require('./commonValidator');

/**
 * Schema reutilizado por templates y generated reports: el bloque "defaults"
 * con `reportType`, `period` y `format`.
 */
const reportDefaultsSchema = z
  .object({
    reportType: z.enum(['classroom', 'student']),
    period: z.enum(['7d', '30d', '90d']),
    format: z.enum(['summary', 'detailed'])
  })
  .strict();

// ────────────────── ReportTemplate ──────────────────

/**
 * Body para POST /api/reports/templates (super_admin).
 *
 * `isSystem` no se acepta del cliente: las plantillas creadas via API son
 * siempre custom (no del sistema) para que sean borrables.
 */
const createTemplateBodySchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, 'La clave es obligatoria')
      .max(50, 'La clave no puede exceder 50 caracteres')
      .regex(/^[a-z0-9-]+$/, 'La clave solo puede contener letras minúsculas, números y guiones'),
    name: sanitizedString({ min: 2, max: 100, label: 'El nombre' }),
    description: sanitizedString({
      min: 0,
      max: 280,
      label: 'La descripción',
      allowMultiline: true
    }).optional(),
    icon: z
      .string()
      .trim()
      .max(40, 'El icono no puede exceder 40 caracteres')
      .optional()
      .default('FileText'),
    defaults: reportDefaultsSchema
  })
  .strict();

const templateIdParamsSchema = z.object({ id: objectIdSchema }).strict();

// ────────────────── GeneratedReport ──────────────────

const generatedReportIdParamsSchema = z.object({ id: objectIdSchema }).strict();

/**
 * Query para GET /api/reports/recent.
 *
 * `limit` está topado en 50 para evitar payloads desorbitados (la UI muestra
 * 5-20 normalmente). `page` opcional para paginación futura.
 */
const recentReportsQuerySchema = z
  .object({
    page: z
      .string()
      .optional()
      .transform(val => (val ? Number.parseInt(val, 10) : 1))
      .pipe(z.number().int().min(1)),
    limit: z
      .string()
      .optional()
      .transform(val => (val ? Number.parseInt(val, 10) : 20))
      .pipe(z.number().int().min(1).max(50))
  })
  .strict();

/**
 * Body para POST /api/reports.
 *
 * `payload` es `unknown` (Mixed en Mongoose) — la estructura depende del
 * `reportType` + `format` y se valida implícitamente porque la fuente es
 * `reportDataService` que sí está tipado.
 */
const saveGeneratedBodySchema = z
  .object({
    reportType: z.enum(['classroom', 'student']),
    period: z.enum(['7d', '30d', '90d']),
    format: z.enum(['summary', 'detailed']),
    templateKey: z
      .string()
      .trim()
      .max(50, 'La clave de plantilla no puede exceder 50 caracteres')
      .optional(),
    title: sanitizedString({ min: 2, max: 200, label: 'El título' }),
    studentId: objectIdSchema.optional(),
    payload: z.unknown().refine(val => val !== null && val !== undefined, {
      message: 'El contenido del informe es obligatorio'
    }),
    metadata: z
      .object({
        contextIds: z.array(objectIdSchema).optional(),
        mechanicIds: z.array(objectIdSchema).optional()
      })
      .strict()
      .optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.reportType === 'student' && !value.studentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['studentId'],
        message: 'studentId es obligatorio cuando reportType=student'
      });
    }
  });

module.exports = {
  reportDefaultsSchema,
  createTemplateBodySchema,
  templateIdParamsSchema,
  generatedReportIdParamsSchema,
  recentReportsQuerySchema,
  saveGeneratedBodySchema
};
