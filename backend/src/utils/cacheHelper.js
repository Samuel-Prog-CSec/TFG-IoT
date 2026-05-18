/**
 * @fileoverview Helper para patrón cache-aside con Redis.
 * Proporciona funciones genéricas para cachear resultados de queries
 * con TTL configurable y fallback transparente a la fuente de datos
 * cuando Redis no está disponible.
 *
 * @module utils/cacheHelper
 */

const redisService = require('../services/redisService');
const logger = require('./logger').child({ component: 'cacheHelper' });

/**
 * TTLs por defecto para cada tipo de cache (en segundos).
 * @readonly
 */
const DEFAULT_TTLS = {
  mechanic: 3600, // 1 hora — mecánicas cambian muy raramente
  context: 1800, // 30 minutos — contextos cambian poco
  analytics: 300 // 5 minutos — datos que cambian con cada partida
};

/**
 * Obtiene un valor del cache o lo calcula y cachea.
 * Patrón cache-aside: busca en Redis, si no existe ejecuta fetchFn,
 * guarda el resultado en Redis y lo retorna.
 *
 * Si Redis no está disponible, ejecuta fetchFn directamente (bypass transparente).
 *
 * @param {string} namespace - Namespace de Redis (usar NAMESPACES de redisService)
 * @param {string} key - Clave única dentro del namespace
 * @param {Function} fetchFn - Función async que obtiene los datos de la fuente original
 * @param {number} [ttlSeconds] - Tiempo de vida en segundos (usa DEFAULT_TTLS si no se especifica)
 * @returns {Promise<*>} Datos del cache o de fetchFn
 */
const cacheGet = async (namespace, key, fetchFn, ttlSeconds) => {
  const ttl = ttlSeconds || DEFAULT_TTLS[namespace.replace('cache:', '')] || 300;

  // Intentar obtener del cache
  const cached = await redisService.get(namespace, key);

  if (cached !== null) {
    logger.debug('Cache HIT', { namespace, key });
    try {
      return JSON.parse(cached);
    } catch {
      // Si el valor cacheado no es JSON válido, ignorar y refetch
      logger.warn('Cache: valor no parseable, refetching', { namespace, key });
    }
  }

  logger.debug('Cache MISS', { namespace, key });

  // Fetch desde la fuente original
  const data = await fetchFn();

  // Guardar en cache (fire-and-forget, no bloquea la respuesta)
  redisService.setWithTTL(namespace, key, JSON.stringify(data), ttl).catch(err => {
    logger.warn('Cache: error al guardar', { namespace, key, error: err.message });
  });

  return data;
};

/**
 * Invalida una key específica del cache.
 *
 * @param {string} namespace - Namespace de Redis
 * @param {string} key - Clave a invalidar
 * @returns {Promise<boolean>} True si se invalidó
 */
const cacheInvalidate = async (namespace, key) => {
  logger.debug('Cache INVALIDATE', { namespace, key });
  return redisService.del(namespace, key);
};

/**
 * Invalida todas las keys de un namespace.
 * Usa SCAN internamente para no bloquear Redis.
 *
 * @param {string} namespace - Namespace completo a invalidar
 * @returns {Promise<boolean>} True si se completó
 */
const cacheInvalidateNamespace = async namespace => {
  logger.debug('Cache INVALIDATE namespace', { namespace });
  try {
    const deletedCount = await redisService.flushNamespace(namespace);
    logger.info('Cache namespace invalidado', { namespace, deletedCount });
    return true;
  } catch (error) {
    logger.warn('Cache: error al invalidar namespace', { namespace, error: error.message });
    return false;
  }
};

/**
 * Invalida todas las keys de un namespace que coincidan con un patrón.
 * Útil para invalidación granular por sub-prefijo (ej: por teacherId)
 * sin tirar el cache completo del namespace.
 *
 * Las keys del SCAN llegan ya en formato `namespace:rest`. Las separamos
 * y borramos con `redisService.delMany` para reusar tracking + circuit breaker.
 *
 * @param {string} namespace - p.ej. 'cache:alerts'
 * @param {string} pattern - patrón glob dentro del namespace, p.ej. 'teacher:abc:*'
 * @returns {Promise<number>} Número de keys eliminadas
 */
const cacheInvalidatePattern = async (namespace, pattern) => {
  logger.debug('Cache INVALIDATE pattern', { namespace, pattern });
  try {
    const fullKeys = await redisService.scanByNamespace(namespace, pattern);
    if (!fullKeys.length) {
      return 0;
    }
    const prefix = `${namespace}:`;
    const ids = fullKeys.map(k => (k.startsWith(prefix) ? k.slice(prefix.length) : k));
    await redisService.delMany(namespace, ids);
    return ids.length;
  } catch (error) {
    logger.warn('Cache: error al invalidar pattern', {
      namespace,
      pattern,
      error: error.message
    });
    return 0;
  }
};

module.exports = {
  cacheGet,
  cacheInvalidate,
  cacheInvalidateNamespace,
  cacheInvalidatePattern,
  DEFAULT_TTLS
};
