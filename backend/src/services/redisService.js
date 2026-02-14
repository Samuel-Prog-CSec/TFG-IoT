/**
 * @fileoverview Servicio de abstracción para operaciones Redis.
 *
 * Proporciona una capa de abstracción sobre ioredis para:
 * - Operaciones CRUD básicas con prefijo automático
 * - Manejo de TTL para expiración automática
 * - Operaciones con Hashes para objetos complejos
 * - Operaciones con Sets para colecciones
 * - Fallback graceful cuando Redis no está disponible
 *
 * @module services/redisService
 * @author Samuel Blanchart Pérez
 * @version 1.0.0
 */

const { getRedis, isRedisConnected, getKeyPrefix } = require('../config/redis');
const logger = require('../utils/logger').child({ component: 'redisService' });
const { CircuitBreaker } = require('../utils/circuitBreaker');

const redisBreaker = new CircuitBreaker({
  name: 'redis',
  failureThreshold: Number.parseInt(process.env.REDIS_BREAKER_THRESHOLD, 10) || 5,
  successThreshold: Number.parseInt(process.env.REDIS_BREAKER_SUCCESS_THRESHOLD, 10) || 2,
  resetTimeoutMs: Number.parseInt(process.env.REDIS_BREAKER_TIMEOUT_MS, 10) || 15000
});

/**
 * Namespaces para organizar keys en Redis.
 * Cada namespace representa un dominio lógico del sistema.
 *
 * @readonly
 * @enum {string}
 */
const NAMESPACES = {
  /** Blacklist de access tokens revocados */
  BLACKLIST: 'blacklist',

  /** Refresh tokens activos */
  REFRESH: 'refresh',

  /** Refresh tokens ya rotados (para detectar robo) */
  USED: 'used',

  /** Estado de partidas activas */
  PLAY: 'play',

  /** Mapeo de UID de tarjeta a playId */
  CARD: 'card',

  /** Flags de seguridad (logout forzado) */
  SECURITY: 'security',

  /** Familias de tokens por usuario */
  TOKEN_FAMILY: 'tokenfamily'
};

/**
 * Construye una key con namespace.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @returns {string} Key formateada (el prefijo lo añade ioredis automáticamente).
 */
const buildKey = (namespace, id) => `${namespace}:${id}`;

/**
 * Verifica si Redis está disponible.
 * Registra warning si no está conectado.
 *
 * @returns {boolean} True si Redis está disponible.
 */
const checkRedisAvailable = () => {
  if (!redisBreaker.canRequest()) {
    logger.warn('Redis: Circuito abierto, operacion omitida');
    return false;
  }

  if (!isRedisConnected()) {
    logger.warn('Redis: Operación ignorada - Redis no está conectado');
    return false;
  }
  return true;
};

// =============================================================================
// OPERACIONES BÁSICAS (Strings)
// =============================================================================

/**
 * Guarda un valor con TTL (Time To Live).
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @param {string|number} value - Valor a guardar.
 * @param {number} ttlSeconds - Tiempo de vida en segundos.
 * @returns {Promise<boolean>} True si se guardó correctamente.
 */
const setWithTTL = async (namespace, id, value, ttlSeconds) => {
  if (!checkRedisAvailable()) {
    return false;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    await redis.setex(key, ttlSeconds, String(value));
    logger.debug(`Redis SET: ${key} (TTL: ${ttlSeconds}s)`);
    redisBreaker.recordSuccess();
    return true;
  } catch (error) {
    logger.error('Redis setWithTTL error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Guarda un valor sin expiración.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @param {string|number} value - Valor a guardar.
 * @returns {Promise<boolean>} True si se guardó correctamente.
 */
const set = async (namespace, id, value) => {
  if (!checkRedisAvailable()) {
    return false;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    await redis.set(key, String(value));
    logger.debug(`Redis SET: ${key}`);
    redisBreaker.recordSuccess();
    return true;
  } catch (error) {
    logger.error('Redis set error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Guarda multiples valores en batch.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {{id:string, value:string|number}[]} entries - Entradas a guardar.
 * @returns {Promise<boolean>} True si el batch fue exitoso.
 */
const setMany = async (namespace, entries = []) => {
  if (!checkRedisAvailable()) {
    return false;
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return true;
  }

  try {
    const redis = getRedis();
    const pipeline = redis.pipeline();

    for (const entry of entries) {
      if (!entry || !entry.id) {
        continue;
      }
      const key = buildKey(namespace, entry.id);
      pipeline.set(key, String(entry.value));
    }

    const results = await pipeline.exec();
    const hasError = results?.some(([error]) => error);
    if (hasError) {
      logger.error('Redis setMany error: fallos en pipeline', { namespace });
    }
    if (hasError) {
      redisBreaker.recordFailure();
    } else {
      redisBreaker.recordSuccess();
    }
    return !hasError;
  } catch (error) {
    logger.error('Redis setMany error:', { namespace, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Obtiene un valor.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @returns {Promise<string|null>} Valor o null si no existe.
 */
const get = async (namespace, id) => {
  if (!checkRedisAvailable()) {
    return null;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    const value = await redis.get(key);
    redisBreaker.recordSuccess();
    return value;
  } catch (error) {
    logger.error('Redis get error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return null;
  }
};

/**
 * Verifica si una key existe.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @returns {Promise<boolean>} True si existe.
 */
const exists = async (namespace, id) => {
  if (!checkRedisAvailable()) {
    return false;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    const result = await redis.exists(key);
    redisBreaker.recordSuccess();
    return result === 1;
  } catch (error) {
    logger.error('Redis exists error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Elimina una key.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @returns {Promise<boolean>} True si se eliminó.
 */
const del = async (namespace, id) => {
  if (!checkRedisAvailable()) {
    return false;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    await redis.del(key);
    logger.debug(`Redis DEL: ${key}`);
    redisBreaker.recordSuccess();
    return true;
  } catch (error) {
    logger.error('Redis del error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Elimina multiples keys en batch.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string[]} ids - Identificadores a eliminar.
 * @returns {Promise<boolean>} True si el batch fue exitoso.
 */
const delMany = async (namespace, ids = []) => {
  if (!checkRedisAvailable()) {
    return false;
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return true;
  }

  try {
    const redis = getRedis();
    const pipeline = redis.pipeline();

    for (const id of ids) {
      if (!id) {
        continue;
      }
      const key = buildKey(namespace, id);
      pipeline.del(key);
    }

    const results = await pipeline.exec();
    const hasError = results?.some(([error]) => error);
    if (hasError) {
      logger.error('Redis delMany error: fallos en pipeline', { namespace });
    }
    if (hasError) {
      redisBreaker.recordFailure();
    } else {
      redisBreaker.recordSuccess();
    }
    return !hasError;
  } catch (error) {
    logger.error('Redis delMany error:', { namespace, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Obtiene el TTL restante de una key.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @returns {Promise<number>} TTL en segundos, -1 si no tiene, -2 si no existe.
 */
const ttl = async (namespace, id) => {
  if (!checkRedisAvailable()) {
    return -2;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    const value = await redis.ttl(key);
    redisBreaker.recordSuccess();
    return value;
  } catch (error) {
    logger.error('Redis ttl error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return -2;
  }
};

// =============================================================================
// OPERACIONES CON HASHES (Objetos)
// =============================================================================

/**
 * Guarda múltiples campos en un Hash.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @param {Object} data - Objeto con campos a guardar.
 * @param {number} [ttlSeconds] - TTL opcional en segundos.
 * @returns {Promise<boolean>} True si se guardó correctamente.
 */
const hset = async (namespace, id, data, ttlSeconds = null) => {
  if (!checkRedisAvailable()) {
    return false;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);

    // Convertir objeto a array de [field, value, field, value, ...]
    const fields = [];
    for (const [field, value] of Object.entries(data)) {
      fields.push(field, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }

    await redis.hset(key, ...fields);

    if (ttlSeconds) {
      await redis.expire(key, ttlSeconds);
    }

    logger.debug(`Redis HSET: ${key} (${Object.keys(data).length} fields)`);
    redisBreaker.recordSuccess();
    return true;
  } catch (error) {
    logger.error('Redis hset error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Obtiene todos los campos de un Hash.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @returns {Promise<Object|null>} Objeto con todos los campos o null.
 */
const hgetall = async (namespace, id) => {
  if (!checkRedisAvailable()) {
    return null;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    const data = await redis.hgetall(key);

    // hgetall devuelve {} si la key no existe
    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    // Intentar parsear campos JSON
    const parsed = {};
    for (const [field, value] of Object.entries(data)) {
      try {
        parsed[field] = JSON.parse(value);
      } catch {
        parsed[field] = value;
      }
    }

    redisBreaker.recordSuccess();
    return parsed;
  } catch (error) {
    logger.error('Redis hgetall error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return null;
  }
};

/**
 * Obtiene un campo específico de un Hash.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @param {string} field - Nombre del campo.
 * @returns {Promise<string|null>} Valor del campo o null.
 */
const hget = async (namespace, id, field) => {
  if (!checkRedisAvailable()) {
    return null;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    const value = await redis.hget(key, field);
    redisBreaker.recordSuccess();
    return value;
  } catch (error) {
    logger.error('Redis hget error:', { namespace, id, field, error: error.message });
    redisBreaker.recordFailure();
    return null;
  }
};

/**
 * Elimina un campo de un Hash.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @param {string} field - Nombre del campo a eliminar.
 * @returns {Promise<boolean>} True si se eliminó.
 */
const hdel = async (namespace, id, field) => {
  if (!checkRedisAvailable()) {
    return false;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    await redis.hdel(key, field);
    redisBreaker.recordSuccess();
    return true;
  } catch (error) {
    logger.error('Redis hdel error:', { namespace, id, field, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

// =============================================================================
// OPERACIONES CON SETS (Colecciones)
// =============================================================================

/**
 * Añade un elemento a un Set.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador del Set.
 * @param {string} member - Elemento a añadir.
 * @returns {Promise<boolean>} True si se añadió.
 */
const sadd = async (namespace, id, member) => {
  if (!checkRedisAvailable()) {
    return false;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    await redis.sadd(key, member);
    redisBreaker.recordSuccess();
    return true;
  } catch (error) {
    logger.error('Redis sadd error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Obtiene todos los elementos de un Set.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador del Set.
 * @returns {Promise<string[]>} Array de elementos.
 */
const smembers = async (namespace, id) => {
  if (!checkRedisAvailable()) {
    return [];
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    const value = await redis.smembers(key);
    redisBreaker.recordSuccess();
    return value;
  } catch (error) {
    logger.error('Redis smembers error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return [];
  }
};

/**
 * Verifica si un elemento pertenece a un Set.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador del Set.
 * @param {string} member - Elemento a verificar.
 * @returns {Promise<boolean>} True si pertenece.
 */
const sismember = async (namespace, id, member) => {
  if (!checkRedisAvailable()) {
    return false;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    const result = await redis.sismember(key, member);
    redisBreaker.recordSuccess();
    return result === 1;
  } catch (error) {
    logger.error('Redis sismember error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Elimina un elemento de un Set.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador del Set.
 * @param {string} member - Elemento a eliminar.
 * @returns {Promise<boolean>} True si se eliminó.
 */
const srem = async (namespace, id, member) => {
  if (!checkRedisAvailable()) {
    return false;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    await redis.srem(key, member);
    redisBreaker.recordSuccess();
    return true;
  } catch (error) {
    logger.error('Redis srem error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

// =============================================================================
// OPERACIONES DE BÚSQUEDA Y LIMPIEZA
// =============================================================================

/**
 * Busca keys por patrón usando SCAN (no bloqueante).
 * En entorno de test usa KEYS como fallback debido a limitaciones de ioredis-mock.
 *
 * @param {string} namespace - Namespace a buscar.
 * @param {string} [pattern='*'] - Patrón de búsqueda (sin prefijo).
 * @returns {Promise<string[]>} Array de keys encontradas (sin keyPrefix).
 */
const scanByNamespace = async (namespace, pattern = '*') => {
  if (!checkRedisAvailable()) {
    return [];
  }

  try {
    const redis = getRedis();
    // SCAN no aplica keyPrefix automáticamente, hay que añadirlo
    const keyPrefix = getKeyPrefix();
    const fullPattern = `${keyPrefix}${namespace}:${pattern}`;

    // En entorno de test, usar KEYS en lugar de SCAN por limitaciones de ioredis-mock
    if (process.env.NODE_ENV === 'test') {
      const keys = await redis.keys(fullPattern);
      redisBreaker.recordSuccess();
      return keys.map(k => k.replace(keyPrefix, ''));
    }

    const keys = [];

    // Usar scanStream para no bloquear
    const stream = redis.scanStream({
      match: fullPattern,
      count: 100
    });

    return new Promise((resolve, reject) => {
      stream.on('data', resultKeys => {
        // Eliminar el keyPrefix de las keys retornadas para mantener consistencia
        const strippedKeys = resultKeys.map(k => k.replace(keyPrefix, ''));
        keys.push(...strippedKeys);
      });

      stream.on('end', () => {
        redisBreaker.recordSuccess();
        resolve(keys);
      });

      stream.on('error', error => {
        redisBreaker.recordFailure();
        reject(error);
      });
    });
  } catch (error) {
    logger.error('Redis scanByNamespace error:', { namespace, pattern, error: error.message });
    redisBreaker.recordFailure();
    return [];
  }
};

/**
 * Elimina todas las keys de un namespace.
 * ¡USAR CON CUIDADO!
 *
 * @param {string} namespace - Namespace a limpiar.
 * @returns {Promise<number>} Número de keys eliminadas.
 */
const flushNamespace = async namespace => {
  if (!checkRedisAvailable()) {
    return 0;
  }

  try {
    const redis = getRedis();
    const keys = await scanByNamespace(namespace);

    if (keys.length === 0) {
      return 0;
    }

    // Eliminar en batch
    await redis.del(...keys);

    logger.info(`Redis FLUSH: ${namespace} (${keys.length} keys eliminadas)`);
    redisBreaker.recordSuccess();
    return keys.length;
  } catch (error) {
    logger.error('Redis flushNamespace error:', { namespace, error: error.message });
    redisBreaker.recordFailure();
    return 0;
  }
};

/**
 * Obtiene estadísticas de uso por namespace.
 *
 * @returns {Promise<Object>} Objeto con conteo por namespace.
 */
const getStats = async () => {
  if (!checkRedisAvailable()) {
    return { connected: false, namespaces: {} };
  }

  const stats = {
    connected: true,
    namespaces: {}
  };

  for (const namespace of Object.values(NAMESPACES)) {
    const keys = await scanByNamespace(namespace);
    stats.namespaces[namespace] = keys.length;
  }

  redisBreaker.recordSuccess();
  return stats;
};

module.exports = {
  // Namespaces
  NAMESPACES,

  // Utilidades
  buildKey,
  checkRedisAvailable,

  // Strings
  set,
  setMany,
  setWithTTL,
  get,
  exists,
  del,
  delMany,
  ttl,

  // Hashes
  hset,
  hgetall,
  hget,
  hdel,

  // Sets
  sadd,
  smembers,
  sismember,
  srem,

  // Búsqueda y limpieza
  scanByNamespace,
  flushNamespace,
  getStats
};
