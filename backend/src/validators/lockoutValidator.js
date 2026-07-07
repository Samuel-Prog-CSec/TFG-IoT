/**
 * @fileoverview Validadores Zod para endpoints de account lockout.
 * @module validators/lockoutValidator
 */

const { z } = require('zod');

/**
 * Schema para body del endpoint `POST /api/admin/lockouts/unlock`.
 * Email normalizado a lowercase + trim para consistencia con accountLockoutService.
 */
const unlockEmailSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Email inválido').max(254, 'Email demasiado largo')
  })
  .strict();

module.exports = {
  unlockEmailSchema
};
