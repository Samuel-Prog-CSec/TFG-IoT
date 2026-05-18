/**
 * @fileoverview Contadores sliding-window de eventos de seguridad (T-942).
 *
 * Usados por los detectores de alertas de sistema (auth_failed_spike,
 * account_lockout_spike, token_theft_detected) para responder en O(1) sin
 * tener que escanear logs.
 *
 * Implementación: sorted set Redis con score=timestamp y member=correlationId.
 * Cada llamada a `increment(eventType)` añade una entrada; `countInLastHour`
 * llama a `ZRANGEBYSCORE` con el rango `[now-1h, now]` y devuelve la cuenta.
 * Una limpieza perezosa (ZREMRANGEBYSCORE) se ejecuta cada N llamadas.
 *
 * Fail-open: si Redis no responde, increment y count NO lanzan; count devuelve
 * 0 y los detectores asumen "todo bien" (mejor falso negativo que falsa alarma).
 *
 * @module services/security/securityCountersService
 */

const crypto = require('crypto');
const { getRedis, isRedisConnected, getKeyPrefix } = require('../../config/redis');
const logger = require('../../utils/logger').child({ component: 'securityCounters' });

const NAMESPACE = 'security:counter';
const WINDOW_MS = 60 * 60 * 1000;
const CLEAN_EVERY_N = 50;

const SUPPORTED_EVENTS = Object.freeze([
  'auth_failed',
  'account_locked',
  'token_theft',
  'consent_withdrawn'
]);

let callCount = 0;

const buildKey = eventType => `${getKeyPrefix()}${NAMESPACE}:${eventType}`;

/**
 * Incrementa el contador para un tipo de evento. No lanza ante fallos.
 *
 * @param {string} eventType - uno de SUPPORTED_EVENTS
 * @param {number} [now=Date.now()]
 * @returns {Promise<boolean>}
 */
const increment = async (eventType, now = Date.now()) => {
  if (!SUPPORTED_EVENTS.includes(eventType)) {
    logger.warn('securityCounters: eventType no soportado', { eventType });
    return false;
  }
  if (!isRedisConnected()) {
    return false;
  }
  try {
    const redis = getRedis();
    const key = buildKey(eventType);
    const member = `${now}:${crypto.randomBytes(4).toString('hex')}`;
    await redis.zadd(key, now, member);
    await redis.expire(key, Math.ceil((WINDOW_MS * 2) / 1000));

    callCount += 1;
    if (callCount % CLEAN_EVERY_N === 0) {
      // Limpieza perezosa.
      await redis.zremrangebyscore(key, '-inf', now - WINDOW_MS);
    }
    return true;
  } catch (error) {
    logger.warn('securityCounters: increment falló', { eventType, error: error.message });
    return false;
  }
};

/**
 * Cuenta eventos en la última ventana (default 1h).
 *
 * @param {string} eventType
 * @param {object} [opts]
 * @param {number} [opts.windowMs]
 * @param {number} [opts.now=Date.now()]
 * @returns {Promise<number>}
 */
const countInWindow = async (eventType, { windowMs = WINDOW_MS, now = Date.now() } = {}) => {
  if (!SUPPORTED_EVENTS.includes(eventType)) {
    return 0;
  }
  if (!isRedisConnected()) {
    return 0;
  }
  try {
    const redis = getRedis();
    const key = buildKey(eventType);
    const count = await redis.zcount(key, now - windowMs, now);
    return Number.parseInt(count, 10) || 0;
  } catch (error) {
    logger.warn('securityCounters: countInWindow falló', { eventType, error: error.message });
    return 0;
  }
};

/**
 * Atajo: cuenta eventos en la última hora.
 *
 * @param {string} eventType
 * @returns {Promise<number>}
 */
const countInLastHour = eventType => countInWindow(eventType, { windowMs: WINDOW_MS });

/**
 * Limpia entradas antiguas (mantenimiento explícito).
 *
 * @param {string} eventType
 * @param {number} [now=Date.now()]
 * @returns {Promise<number>}
 */
const prune = async (eventType, now = Date.now()) => {
  if (!SUPPORTED_EVENTS.includes(eventType)) {
    return 0;
  }
  if (!isRedisConnected()) {
    return 0;
  }
  try {
    const redis = getRedis();
    const key = buildKey(eventType);
    const removed = await redis.zremrangebyscore(key, '-inf', now - WINDOW_MS);
    return Number.parseInt(removed, 10) || 0;
  } catch (error) {
    logger.debug('securityCounters: prune falló (ignorado)', { eventType, error: error.message });
    return 0;
  }
};

module.exports = {
  increment,
  countInWindow,
  countInLastHour,
  prune,
  SUPPORTED_EVENTS,
  WINDOW_MS
};
