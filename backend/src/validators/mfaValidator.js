/**
 * @fileoverview Validadores Zod para endpoints MFA TOTP (T-905 B7).
 * @module validators/mfaValidator
 */

const { z } = require('zod');

/**
 * Código TOTP de 6 dígitos (RFC 6238, default algorithm). Algunas apps generan
 * 8 dígitos pero `otplib` por defecto usa 6 — alineamos con eso.
 */
const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'El código TOTP debe tener 6 dígitos numéricos');

/**
 * Backup code formato `XXXX-XXXX-XXXX-XXXX` (hex uppercase).
 * Se generan en setupVerify y se entregan al admin una sola vez en texto claro.
 */
const backupCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/, 'Formato de backup code inválido');

const setupVerifySchema = z
  .object({
    code: totpCodeSchema
  })
  .strict();

const challengeSchema = z
  .object({
    code: totpCodeSchema
  })
  .strict();

const verifyBackupCodeSchema = z
  .object({
    backupCode: backupCodeSchema
  })
  .strict();

const disableSchema = z
  .object({
    password: z.string().min(1, 'La contraseña es requerida')
  })
  .strict();

module.exports = {
  setupVerifySchema,
  challengeSchema,
  verifyBackupCodeSchema,
  disableSchema
};
