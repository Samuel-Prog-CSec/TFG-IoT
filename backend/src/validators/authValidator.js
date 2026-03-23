/**
 * @fileoverview Validadores Zod para autenticación y perfil.
 * @module validators/authValidator
 */

const { z } = require('zod');
const { emptyObjectSchema } = require('./commonValidator');
const { passwordSchema } = require('./userValidator');

/**
 * Schema para actualizar perfil (me).
 */
const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    profile: z
      .object({
        avatar: z.string().url('URL de avatar inválida').optional(),
        age: z.number().int().min(3).max(99).optional(),
        classroom: z.string().trim().max(50).optional(),
        birthdate: z.string().datetime().or(z.date()).optional()
      })
      .optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  });

/**
 * Schema para cambio de contraseña.
 */
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
    newPassword: passwordSchema
  })
  .strict();

/**
 * Schema para refresh token.
 */
const refreshTokenSchema = emptyObjectSchema;

module.exports = {
  updateProfileSchema,
  changePasswordSchema,
  refreshTokenSchema,
  emptyObjectSchema
};
