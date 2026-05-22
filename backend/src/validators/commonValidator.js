/**
 * @fileoverview Esquemas Zod comunes reutilizables.
 * Centraliza validaciones estándar (ObjectId, paginación, búsqueda, sanitización Unicode).
 * @module validators/commonValidator
 */

const { z } = require('zod');
const { ROLES, USER_STATUS } = require('../constants/enums');

/**
 * Schema para validar ObjectId de MongoDB.
 * @type {import('zod').ZodString}
 */
const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, 'ID de MongoDB inválido');

/**
 * Schema para validar UID de tarjeta RFID (8 o 14 hex).
 * @type {import('zod').ZodString}
 */
const uidSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-F]{8}$|^[0-9A-F]{14}$/, 'UID debe ser 8 o 14 caracteres hexadecimales');

// Codepoints Unicode peligrosos para campos user-facing renderizados en la UI.
// Listados por número para evitar tener caracteres invisibles en el source — el
// parser de JS los rechaza dentro de regex literales y ensucian el diff.
//
// Cubre:
// - Zero-width: 0x200B..0x200D, 0xFEFF (BOM), 0x2060..0x2064 (WJ + invisible math)
// - Direccionales (RTL/LTR override): 0x200E, 0x200F, 0x202A..0x202E, 0x2066..0x2069
// - Separadores invisibles de línea/párrafo: 0x2028, 0x2029
//
// Estos códigos permiten ataques de homógrafo, falsificación visual de nombres
// (ej. "Maria" seguido de RTL override + texto malicioso) y rotura de layout
// cuando se inyectan en listados.
const UNICODE_INVISIBLE_CODEPOINTS = new Set([
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff
]);

/**
 * Comprueba si una cadena contiene caracteres Unicode invisibles o direccionales.
 * @param {string} value
 * @returns {boolean}
 */
const containsInvisibleUnicode = value => {
  for (let i = 0; i < value.length; i += 1) {
    if (UNICODE_INVISIBLE_CODEPOINTS.has(value.charCodeAt(i))) {
      return true;
    }
  }
  return false;
};

// Caracteres de control ASCII (\x00-\x1F + \x7F) excepto \t (\x09), \n (\x0A), \r (\x0D)
// que son legítimos en textos multilínea (descripciones, etc.).
// Detectarlos en input user-facing es intencional, por eso desactivamos las
// reglas que sugieren omitir control-chars o usar \v/\f explícitos.
// eslint-disable-next-line no-control-regex, regexp/control-character-escape -- detección defensiva de control chars
const CONTROL_CHARS_MULTILINE_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

// eslint-disable-next-line no-control-regex -- detección defensiva de control chars
const CONTROL_CHARS_STRICT_REGEX = /[\x00-\x1F\x7F]/;

/**
 * Genera un schema Zod para strings user-facing (nombres, descripciones, displayName,
 * fallbackLabel) con sanitización contra caracteres Unicode invisibles/direccionales
 * y caracteres de control ASCII.
 *
 * Rechaza explícitamente:
 * - Zero-width (U+200B, U+200C, U+200D, U+FEFF, U+2060..U+2064)
 * - RTL/LTR override (U+202A..U+202E, U+2066..U+2069)
 * - Separadores invisibles (U+2028, U+2029)
 * - Caracteres de control ASCII (\x00-\x1F + \x7F); si `allowMultiline=true`
 *   se permiten \t \n \r para descripciones largas.
 *
 * Aplica `.trim()` automáticamente y enforce `min`/`max` con mensajes en español.
 *
 * @param {Object} opts
 * @param {number} [opts.min=1] - longitud mínima tras trim
 * @param {number} [opts.max=200] - longitud máxima
 * @param {string} [opts.label='valor'] - nombre del campo para mensajes
 * @param {boolean} [opts.allowMultiline=false] - permite saltos de línea
 * @returns {import('zod').ZodString}
 *
 * @example
 *   name: sanitizedString({ min: 2, max: 100, label: 'nombre' })
 *   description: sanitizedString({ min: 0, max: 500, label: 'descripción', allowMultiline: true })
 */
const sanitizedString = ({ min = 1, max = 200, label = 'valor', allowMultiline = false } = {}) => {
  let schema = z.string().trim();

  if (min > 0) {
    schema = schema.min(min, `${label} debe tener al menos ${min} caracteres`);
  }
  schema = schema.max(max, `${label} no puede exceder ${max} caracteres`);

  return schema.superRefine((value, ctx) => {
    if (containsInvisibleUnicode(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} contiene caracteres invisibles o direccionales no permitidos`
      });
      return;
    }

    const controlRegex = allowMultiline
      ? CONTROL_CHARS_MULTILINE_REGEX
      : CONTROL_CHARS_STRICT_REGEX;

    if (controlRegex.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} contiene caracteres de control no permitidos`
      });
    }
  });
};

/**
 * Schema para mapeo de token RFID fungible a valor de juego (ADR-012).
 * Consolidado desde gameSessionValidator y cardDeckValidator (DRY pre-v1.0.0).
 *
 * Relaciona una tarjeta RFID (UID hex) con un valor del contexto.
 *
 * @example
 *   {
 *     uid: '32B8FA05',
 *     assignedValue: 'España',
 *     displayData: { display: '...', audioUrl: '...' }
 *   }
 */
const cardMappingSchema = z
  .object({
    uid: uidSchema,
    assignedValue: sanitizedString({ min: 1, max: 200, label: 'El valor asignado' }),
    displayData: z.record(z.string(), z.any()).optional().default({})
  })
  .strict();

/**
 * Schema base para paginación y búsqueda.
 * - page, limit: numéricos
 * - sortBy: se especifica en cada endpoint
 * - order: asc|desc
 * - search: texto libre (sanitizado en controller)
 */
const paginationSchema = z
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
      .pipe(z.number().int().min(1).max(100)),

    sortBy: z.enum(['createdAt', 'updatedAt']).optional().default('createdAt'),

    order: z.enum(['asc', 'desc']).optional().default('desc'),

    search: z.string().trim().max(100, 'search no puede exceder 100 caracteres').optional()
  })
  .strict();

/**
 * Schema para filtros de usuarios con paginación.
 */
const userFiltersSchema = paginationSchema.extend({
  role: z.enum([...ROLES]).optional(),
  status: z.enum([...USER_STATUS]).optional(),
  classroom: z.string().trim().max(50).optional(),
  createdBy: objectIdSchema.optional()
});

/**
 * Schema vacío (rechaza parámetros desconocidos).
 */
const emptyObjectSchema = z.object({}).strict().default({});

module.exports = {
  objectIdSchema,
  uidSchema,
  sanitizedString,
  cardMappingSchema,
  paginationSchema,
  userFiltersSchema,
  emptyObjectSchema,
  // Exports internos para tests / consumidores avanzados
  containsInvisibleUnicode,
  UNICODE_INVISIBLE_CODEPOINTS,
  CONTROL_CHARS_MULTILINE_REGEX,
  CONTROL_CHARS_STRICT_REGEX
};
