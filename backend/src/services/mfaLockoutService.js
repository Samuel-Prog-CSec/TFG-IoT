/**
 * @fileoverview Lockout per-user del challenge MFA (defensa anti fuerza bruta TOTP).
 *
 * Complementa al rate limiter por IP de `/api/auth/mfa/challenge` y
 * `/verify-backup-code`. Si un atacante con un access token de super_admin
 * robado rota IPs para sortear el límite por IP, ese límite no lo detecta —
 * este servicio sí, contando los fallos por `userId` en lugar de por IP.
 *
 * Estrategia (idéntica a accountLockoutService pero keyed por userId):
 * - INCR `mfa:fail:<userId>` con TTL = window. Ventana sliding por TTL.
 * - Si el contador alcanza MAX_ATTEMPTS → SET `mfa:lock:<userId>` TTL = duración.
 * - Verificación MFA correcta → DEL ambas keys.
 * - Fail-open: si Redis no responde, NO bloquea (evita lockout total en outage).
 *
 * El código TOTP tiene su propio guard anti-replay (90 s); aquí solo contamos
 * códigos INVÁLIDOS (intentos de adivinación), nunca reusos de un código válido.
 *
 * @module services/mfaLockoutService
 */

const redisService = require('./redisService');
const logger = require('../utils/logger').child({ component: 'mfaLockout' });
const { logSecurityEvent } = require('../utils/securityLogger');

/**
 * Configuración por env vars (con defaults razonables).
 */
const CONFIG = {
  /** Máximo de challenges MFA fallidos antes de bloquear. */
  MAX_ATTEMPTS: Number.parseInt(process.env.MFA_LOCKOUT_MAX_ATTEMPTS, 10) || 5,
  /** Ventana sliding del contador de intentos fallidos (ms). */
  WINDOW_MS: Number.parseInt(process.env.MFA_LOCKOUT_WINDOW_MS, 10) || 15 * 60 * 1000,
  /** Duración del bloqueo tras alcanzar el límite (ms). */
  DURATION_MS: Number.parseInt(process.env.MFA_LOCKOUT_DURATION_MS, 10) || 15 * 60 * 1000
};

/**
 * Normaliza un userId a key estable. Si el input no es válido, retorna null.
 *
 * @param {unknown} userId
 * @returns {string|null}
 */
const normalizeUserId = userId => {
  if (userId === null || userId === undefined) {
    return null;
  }
  const str = String(userId).trim();
  return str.length === 0 ? null : str;
};

/**
 * Comprueba si el challenge MFA de un usuario está bloqueado.
 * Fail-open: si Redis no responde, retorna `false` (no bloquea).
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const isLocked = async userId => {
  const key = normalizeUserId(userId);
  if (!key) {
    return false;
  }
  try {
    return await redisService.exists(redisService.NAMESPACES.MFA_CHALLENGE_LOCKED, key);
  } catch (error) {
    logger.debug('isLocked: Redis no disponible, fail-open', { error: error.message });
    return false;
  }
};

/**
 * Registra un challenge MFA fallido. Si tras incrementar alcanza el límite,
 * activa el lockout y registra evento de seguridad.
 *
 * @param {string} userId
 * @param {object} [meta] - contexto del request para logging (ip, userAgent…)
 * @returns {Promise<{locked: boolean, attempts: number}>}
 */
const recordFailedAttempt = async (userId, meta = {}) => {
  const key = normalizeUserId(userId);
  if (!key) {
    return { locked: false, attempts: 0 };
  }
  try {
    const windowSeconds = Math.ceil(CONFIG.WINDOW_MS / 1000);
    const attempts = await redisService.incr(
      redisService.NAMESPACES.MFA_CHALLENGE_FAILED,
      key,
      windowSeconds
    );

    if (attempts >= CONFIG.MAX_ATTEMPTS) {
      const durationSeconds = Math.ceil(CONFIG.DURATION_MS / 1000);
      const lockSet = await redisService.setWithTTL(
        redisService.NAMESPACES.MFA_CHALLENGE_LOCKED,
        key,
        Date.now().toString(),
        durationSeconds
      );
      if (lockSet) {
        logSecurityEvent('MFA_CHALLENGE_LOCKED', {
          ...meta,
          userId: key,
          attempts,
          durationMs: CONFIG.DURATION_MS
        });
      }
      return { locked: true, attempts };
    }

    return { locked: false, attempts };
  } catch (error) {
    // Fail-open: si Redis falla, no bloquear el flujo MFA.
    logger.warn('recordFailedAttempt: Redis no disponible, fail-open', { error: error.message });
    return { locked: false, attempts: 0 };
  }
};

/**
 * Limpia el contador + lockout tras una verificación MFA correcta.
 * Fire-and-forget: errores en Redis se logean a debug y no se propagan.
 *
 * @param {string} userId
 * @returns {Promise<void>}
 */
const clearAttempts = async userId => {
  const key = normalizeUserId(userId);
  if (!key) {
    return;
  }
  try {
    await Promise.all([
      redisService.del(redisService.NAMESPACES.MFA_CHALLENGE_FAILED, key),
      redisService.del(redisService.NAMESPACES.MFA_CHALLENGE_LOCKED, key)
    ]);
  } catch (error) {
    logger.debug('clearAttempts: Redis no disponible (ignorado)', { error: error.message });
  }
};

module.exports = {
  CONFIG,
  isLocked,
  recordFailedAttempt,
  clearAttempts
};
