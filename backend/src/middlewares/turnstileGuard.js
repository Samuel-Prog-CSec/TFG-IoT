/**
 * @fileoverview Middleware de verificación CAPTCHA Cloudflare Turnstile (T-905 B6).
 *
 * Pensado para `POST /api/auth/login`. Se activa SOLO si:
 * - `TURNSTILE_SECRET` está configurada en env (sin ella, skip silencioso).
 * - El email tiene ≥3 intentos fallidos previos (consulta `accountLockoutService`).
 *
 * Cuando se activa:
 * - Requiere `req.body.captchaToken` (string).
 * - Verifica contra https://challenges.cloudflare.com/turnstile/v0/siteverify.
 * - Si falla o falta → 403 con código `CAPTCHA_REQUIRED` o `CAPTCHA_INVALID`.
 *
 * El frontend muestra el widget Turnstile tras 3 fallos (server-side checked).
 *
 * @module middlewares/turnstileGuard
 */

const accountLockoutService = require('../services/accountLockoutService');
const logger = require('../utils/logger').child({ component: 'turnstile' });
const { ForbiddenError } = require('../utils/errors');

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const FAILURE_THRESHOLD = Number.parseInt(process.env.TURNSTILE_FAILURE_THRESHOLD, 10) || 3;

/**
 * Middleware para `POST /api/auth/login`. Si no procede, pasa de largo silenciosamente.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
const requireCaptchaIfFlagged = async (req, _res, next) => {
  try {
    if (!process.env.TURNSTILE_SECRET) {
      return next(); // Feature opt-in: si no hay secret, no aplicamos.
    }
    const email = req.body?.email;
    if (typeof email !== 'string' || email.length === 0) {
      return next(); // El validador de login se encarga del 400.
    }

    const failureCount = await accountLockoutService.getFailureCount(email);
    if (failureCount < FAILURE_THRESHOLD) {
      return next();
    }

    const captchaToken = req.body.captchaToken;
    if (!captchaToken || typeof captchaToken !== 'string') {
      logger.warn(
        { email, failureCount, reason: 'CAPTCHA_REQUIRED' },
        'CAPTCHA requerido tras N fallos pero no presente'
      );
      throw new ForbiddenError('Se requiere verificación CAPTCHA', 'CAPTCHA_REQUIRED');
    }

    const valid = await verifyToken(captchaToken, req.ip);
    if (!valid) {
      logger.warn(
        { email, failureCount, reason: 'CAPTCHA_INVALID' },
        'CAPTCHA verification rechazada por Cloudflare'
      );
      throw new ForbiddenError('Verificación CAPTCHA inválida', 'CAPTCHA_INVALID');
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * POST a Cloudflare siteverify. Retorna `true` si Cloudflare valida el token.
 *
 * @param {string} token
 * @param {string} [remoteIp]
 * @returns {Promise<boolean>}
 */
const verifyToken = async (token, remoteIp) => {
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: token });
    if (remoteIp) {
      body.append('remoteip', remoteIp);
    }

    // `fetch` nativo de Node.js 22+; con timeout para no colgar el login.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response;
    try {
      response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        body,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Turnstile siteverify HTTP error');
      return false;
    }
    const result = await response.json();
    return result?.success === true;
  } catch (error) {
    logger.warn({ error: error.message }, 'Turnstile siteverify falló (network/timeout)');
    // Fail-closed: si no podemos verificar y el flag está activo, rechazamos.
    // El operador puede deshabilitar Turnstile desconfigurando TURNSTILE_SECRET.
    return false;
  }
};

module.exports = {
  requireCaptchaIfFlagged,
  verifyToken
};
