/**
 * @fileoverview Servicio de account lockout per-user contra credential stuffing.
 *
 * Defensa en profundidad complementaria a authRateLimiter (que limita por IP).
 * Si un atacante distribuye intentos desde múltiples IPs apuntando a un único email,
 * el rate limiter por IP no lo detecta — este servicio sí (key = email lowercase).
 *
 * Estrategia:
 * - INCR `auth:fail:<email>` con TTL inicial = window. Sliding window por TTL.
 * - Si counter alcanza MAX_ATTEMPTS → SET `auth:lock:<email>` TTL = lockout duration.
 * - Login OK → DEL ambas keys.
 * - Fail-open: si Redis no disponible, NO bloquea logins (evita lockout total durante outages).
 *
 * Mensaje al cliente: SIEMPRE genérico "Credenciales inválidas" — nunca revelar
 * si el usuario existe o si está bloqueado (defensa contra enumeración).
 *
 * @module services/accountLockoutService
 */

const redisService = require('./redisService');
const logger = require('../utils/logger').child({ component: 'accountLockout' });
const { logSecurityEvent } = require('../utils/securityLogger');

/**
 * Configuración por env vars (con defaults razonables).
 */
const CONFIG = {
  /** Máximo intentos fallidos antes de bloquear. */
  MAX_ATTEMPTS: Number.parseInt(process.env.ACCOUNT_LOCKOUT_MAX_ATTEMPTS, 10) || 5,
  /** Ventana sliding del contador de intentos fallidos (ms). */
  WINDOW_MS: Number.parseInt(process.env.ACCOUNT_LOCKOUT_WINDOW_MS, 10) || 15 * 60 * 1000,
  /** Duración del bloqueo tras alcanzar el límite (ms). */
  DURATION_MS: Number.parseInt(process.env.ACCOUNT_LOCKOUT_DURATION_MS, 10) || 15 * 60 * 1000
};

/**
 * Normaliza un email a key estable (lowercase + trim).
 * Si el input no es un string, retorna null.
 *
 * @param {unknown} email
 * @returns {string|null}
 */
const normalizeEmail = email => {
  if (typeof email !== 'string') {
    return null;
  }
  const trimmed = email.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * Comprueba si una cuenta está actualmente bloqueada.
 * Fail-open: si Redis no responde, retorna `false` (no bloquea).
 *
 * @param {string} email
 * @returns {Promise<boolean>}
 */
const isLocked = async email => {
  const key = normalizeEmail(email);
  if (!key) {
    return false;
  }
  try {
    return await redisService.exists(redisService.NAMESPACES.AUTH_LOCKED, key);
  } catch (error) {
    logger.debug('isLocked: Redis no disponible, fail-open', { error: error.message });
    return false;
  }
};

/**
 * Registra un intento fallido. Si tras incrementar el counter alcanza el límite,
 * activa el lockout y registra evento de seguridad.
 *
 * @param {string} email
 * @param {object} [meta] - contexto del request para logging (ip, userAgent…)
 * @returns {Promise<{locked: boolean, attempts: number}>}
 */
const recordFailedAttempt = async (email, meta = {}) => {
  const key = normalizeEmail(email);
  if (!key) {
    return { locked: false, attempts: 0 };
  }
  try {
    const windowSeconds = Math.ceil(CONFIG.WINDOW_MS / 1000);
    const attempts = await redisService.incr(
      redisService.NAMESPACES.AUTH_FAILED,
      key,
      windowSeconds
    );

    if (attempts >= CONFIG.MAX_ATTEMPTS) {
      const durationSeconds = Math.ceil(CONFIG.DURATION_MS / 1000);
      const lockSet = await redisService.setWithTTL(
        redisService.NAMESPACES.AUTH_LOCKED,
        key,
        Date.now().toString(),
        durationSeconds
      );
      if (lockSet) {
        logSecurityEvent('AUTH_ACCOUNT_LOCKED', {
          ...meta,
          email: key,
          attempts,
          durationMs: CONFIG.DURATION_MS
        });
      }
      return { locked: true, attempts };
    }

    return { locked: false, attempts };
  } catch (error) {
    // Fail-open: si Redis falla, no bloquear el flujo de auth
    logger.warn('recordFailedAttempt: Redis no disponible, fail-open', {
      error: error.message
    });
    return { locked: false, attempts: 0 };
  }
};

/**
 * Limpia contador + lockout tras login exitoso.
 * Fire-and-forget: errores en Redis se logean a debug y no se propagan.
 *
 * @param {string} email
 * @returns {Promise<void>}
 */
const clearLockout = async email => {
  const key = normalizeEmail(email);
  if (!key) {
    return;
  }
  try {
    await Promise.all([
      redisService.del(redisService.NAMESPACES.AUTH_FAILED, key),
      redisService.del(redisService.NAMESPACES.AUTH_LOCKED, key)
    ]);
  } catch (error) {
    logger.debug('clearLockout: Redis no disponible (ignorado)', { error: error.message });
  }
};

/**
 * Devuelve el número actual de intentos fallidos registrados para un email.
 * Útil para integraciones (ej. mostrar CAPTCHA tras N fallos en B6).
 *
 * @param {string} email
 * @returns {Promise<number>}
 */
const getFailureCount = async email => {
  const key = normalizeEmail(email);
  if (!key) {
    return 0;
  }
  try {
    const value = await redisService.get(redisService.NAMESPACES.AUTH_FAILED, key);
    return value ? Number.parseInt(value, 10) || 0 : 0;
  } catch {
    return 0;
  }
};

/**
 * Desbloquea manualmente una cuenta (endpoint admin de emergencia).
 *
 * @param {string} email
 * @param {object} [meta]
 * @returns {Promise<boolean>} True si efectivamente había un lockout (informativo para el caller).
 */
const forceUnlock = async (email, meta = {}) => {
  const key = normalizeEmail(email);
  if (!key) {
    return false;
  }
  const wasLocked = await redisService.exists(redisService.NAMESPACES.AUTH_LOCKED, key);
  await redisService.del(redisService.NAMESPACES.AUTH_LOCKED, key);
  await redisService.del(redisService.NAMESPACES.AUTH_FAILED, key);
  if (wasLocked) {
    logSecurityEvent('AUTH_ACCOUNT_LOCKOUT_BYPASS', {
      ...meta,
      email: key
    });
  }
  return wasLocked;
};

module.exports = {
  CONFIG,
  isLocked,
  recordFailedAttempt,
  clearLockout,
  getFailureCount,
  forceUnlock
};
