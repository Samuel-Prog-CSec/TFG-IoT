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

const {
  getRedis,
  isRedisConnected,
  getKeyPrefix,
  getLuaScriptSHA,
  getLuaScriptSource
} = require('../config/redis');
const logger = require('../utils/logger').child({ component: 'redisService' });
const { CircuitBreaker } = require('../utils/circuitBreaker');
const { recordCommand, categoryForNamespace } = require('../utils/redisCommandTracker');

/**
 * Contabiliza `count` comandos Redis bajo la categoría derivada del namespace
 * (T-907 Fase D). Se invoca tras `redisBreaker.recordSuccess()` para que un
 * fallo previo a la red no infle el contador. La telemetría es best-effort:
 * cualquier excepción se silencia para no comprometer la operación principal.
 *
 * @param {string} namespace
 * @param {number} [count=1]
 */
const track = (namespace, count = 1) => {
  try {
    recordCommand(categoryForNamespace(namespace), count);
  } catch {
    // Best-effort, nunca propaga.
  }
};

/** Contabiliza 1 comando Lua (`EVAL`/`EVALSHA`) bajo la categoría 'lua'. */
const trackLua = () => {
  try {
    recordCommand('lua', 1);
  } catch {
    // Best-effort.
  }
};

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

  /** Cache de mecánicas de juego (TTL: 1h) */
  CACHE_MECHANIC: 'cache:mechanic',

  /** Cache de contextos temáticos (TTL: 30min) */
  CACHE_CONTEXT: 'cache:context',

  /** Cache de analytics de clase (TTL: 5min) */
  CACHE_ANALYTICS: 'cache:analytics',

  /** Cache de slim-user para middleware de autenticación (TTL: 60s) */
  AUTH_USER: 'auth:user',

  /** Lock distribuido de idempotencia para startPlay (TTL: 60s) */
  PLAY_INIT_LOCK: 'play:init',

  /** Contador sliding de intentos fallidos de login por email (TTL: window) */
  AUTH_FAILED: 'auth:fail',

  /** Cuenta bloqueada temporalmente por intentos fallidos (TTL: lockout duration) */
  AUTH_LOCKED: 'auth:lock',

  /** Anti-replay TOTP: marca step ya usado por un super_admin (TTL: 90s) */
  MFA_TOTP_USED: 'mfa:totp:used',

  /** Contador sliding de challenges MFA fallidos por userId (TTL: window) */
  MFA_CHALLENGE_FAILED: 'mfa:fail',

  /** Bloqueo temporal del challenge MFA por fuerza bruta (TTL: lockout duration) */
  MFA_CHALLENGE_LOCKED: 'mfa:lock'
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
    track(namespace, 1);
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
    track(namespace, 1);
    return true;
  } catch (error) {
    logger.error('Redis set error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Guarda un valor solo si la key no existe (SET NX).
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @param {string|number} value - Valor a guardar.
 * @param {number|null} [ttlSeconds=null] - TTL opcional en segundos.
 * @returns {Promise<boolean>} True si se adquirió/escribió, false si ya existía.
 */
const setIfNotExists = async (namespace, id, value, ttlSeconds = null) => {
  if (!checkRedisAvailable()) {
    return true;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);

    let result;
    if (ttlSeconds && Number.isInteger(ttlSeconds) && ttlSeconds > 0) {
      result = await redis.set(key, String(value), 'EX', ttlSeconds, 'NX');
    } else {
      result = await redis.set(key, String(value), 'NX');
    }

    redisBreaker.recordSuccess();
    track(namespace, 1);
    return result === 'OK';
  } catch (error) {
    logger.error('Redis setIfNotExists error:', { namespace, id, error: error.message });
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

    let commandCount = 0;
    for (const entry of entries) {
      if (!entry?.id) {
        continue;
      }
      const key = buildKey(namespace, entry.id);
      pipeline.set(key, String(entry.value));
      commandCount += 1;
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
      track(namespace, commandCount);
    }
    return !hasError;
  } catch (error) {
    logger.error('Redis setMany error:', { namespace, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Guarda múltiples valores solo si no existen (SET NX por entrada).
 * Si alguna entrada falla por colisión, revierte las entradas adquiridas en esta operación.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {{id:string, value:string|number}[]} entries - Entradas a guardar.
 * @returns {Promise<{ok:boolean, conflicts:string[], acquiredIds:string[]}>}
 */
const setManyIfNotExists = async (namespace, entries = [], ttlSeconds = null) => {
  if (!checkRedisAvailable()) {
    return { ok: true, conflicts: [], acquiredIds: [] };
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: true, conflicts: [], acquiredIds: [] };
  }

  const validEntries = entries.filter(e => e?.id);
  if (validEntries.length === 0) {
    return { ok: true, conflicts: [], acquiredIds: [] };
  }

  const redis = getRedis();
  if (!redis) {
    return { ok: false, conflicts: validEntries.map(e => e.id), acquiredIds: [] };
  }

  // B.5 (pre-v1.0.0): fallback transaccional con MULTI/EXEC + WATCH.
  // Antes este fallback iteraba secuencialmente con `setIfNotExists` —
  // sin atomicidad real, dos reservations concurrentes para la misma key
  // podían colarse ambas. Con WATCH + EXEC optimista, si alguna key
  // observada cambia entre WATCH y EXEC, la transacción se aborta y
  // devolvemos conflict. Idempotente: si Lua vuelve a estar disponible
  // (caso típico — esto solo se invoca tras SCRIPT FLUSH o en tests),
  // la próxima llamada usa el path Lua atómico.
  const keys = validEntries.map(e => buildKey(namespace, e.id));
  const acquiredIds = [];
  const conflicts = [];

  try {
    // 1) WATCH sobre todas las keys candidatas.
    await redis.watch(...keys);

    // 2) Pre-check: si alguna ya existe, no hay nada que adquirir.
    const existsResults = await redis.mget(...keys);
    const preConflicts = [];
    for (let i = 0; i < validEntries.length; i++) {
      if (existsResults[i] !== null) {
        preConflicts.push(validEntries[i].id);
      }
    }
    if (preConflicts.length > 0) {
      await redis.unwatch();
      track(namespace, 1 + keys.length); // watch + mget cuentan
      return { ok: false, conflicts: preConflicts, acquiredIds: [] };
    }

    // 3) MULTI: encolar SET para cada key + EXEC atómico.
    const multi = redis.multi();
    for (const entry of validEntries) {
      const key = buildKey(namespace, entry.id);
      if (ttlSeconds && ttlSeconds > 0) {
        multi.set(key, String(entry.value), 'EX', ttlSeconds, 'NX');
      } else {
        multi.set(key, String(entry.value), 'NX');
      }
    }
    const execResults = await multi.exec();

    // 4) Si EXEC devuelve null, otra escritura modificó una de las keys
    //    entre WATCH y EXEC — abortar.
    if (execResults === null) {
      track(namespace, 1 + keys.length); // watch + mget
      return { ok: false, conflicts: validEntries.map(e => e.id), acquiredIds: [] };
    }

    // 5) Procesar resultado por entry. SET NX retorna 'OK' si acquired,
    //    null si la key ya existía (race tras pre-check).
    for (let i = 0; i < validEntries.length; i++) {
      const [err, reply] = execResults[i];
      if (err || reply === null) {
        conflicts.push(validEntries[i].id);
      } else {
        acquiredIds.push(validEntries[i].id);
      }
    }

    // 6) Si hubo conflictos parciales, revertir las acquired.
    if (conflicts.length > 0 && acquiredIds.length > 0) {
      await delMany(namespace, acquiredIds);
      redisBreaker.recordSuccess();
      track(namespace, 1 + keys.length + acquiredIds.length);
      return { ok: false, conflicts, acquiredIds: [] };
    }

    redisBreaker.recordSuccess();
    track(namespace, 1 + keys.length + validEntries.length);
    return {
      ok: conflicts.length === 0,
      conflicts,
      acquiredIds
    };
  } catch (error) {
    logger.error('Redis setManyIfNotExists transactional error:', {
      namespace,
      error: error.message
    });
    redisBreaker.recordFailure();
    try {
      await redis.unwatch();
    } catch {
      // ignore
    }
    if (acquiredIds.length > 0) {
      await delMany(namespace, acquiredIds);
    }
    return {
      ok: false,
      conflicts: [...conflicts, ...validEntries.map(e => e.id)],
      acquiredIds: []
    };
  }
};

/**
 * Renueva TTL de una key existente.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @param {number} ttlSeconds - TTL en segundos.
 * @returns {Promise<boolean>} True si se renovó.
 */
const expire = async (namespace, id, ttlSeconds) => {
  if (!checkRedisAvailable()) {
    return true;
  }

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    return false;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    const result = await redis.expire(key, ttlSeconds);
    redisBreaker.recordSuccess();
    track(namespace, 1);
    return result === 1;
  } catch (error) {
    logger.error('Redis expire error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Renueva TTL de una key solo si el valor coincide con el esperado.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @param {string|number} expectedValue - Valor esperado.
 * @param {number} ttlSeconds - TTL en segundos.
 * @returns {Promise<boolean>} True si se renovó.
 */
const expireIfValueMatches = async (namespace, id, expectedValue, ttlSeconds) => {
  if (!checkRedisAvailable()) {
    return true;
  }

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    return false;
  }

  try {
    const currentValue = await get(namespace, id);
    if (currentValue === null || currentValue !== String(expectedValue)) {
      return false;
    }
    return await expire(namespace, id, ttlSeconds);
  } catch (error) {
    logger.error('Redis expireIfValueMatches error:', {
      namespace,
      id,
      error: error.message
    });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Renueva TTL de múltiples keys solo si su valor coincide con el esperado.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {{id:string, expectedValue:string|number}[]} entries - Entradas a renovar.
 * @param {number} ttlSeconds - TTL en segundos.
 * @returns {Promise<{ok:boolean, renewedIds:string[], skippedIds:string[]}>}
 */
const expireManyIfValueMatches = async (namespace, entries, ttlSeconds) => {
  if (!checkRedisAvailable()) {
    return { ok: true, renewedIds: [], skippedIds: [] };
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: true, renewedIds: [], skippedIds: [] };
  }

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    return {
      ok: false,
      renewedIds: [],
      skippedIds: entries.filter(entry => entry?.id).map(e => e.id)
    };
  }

  const renewedIds = [];
  const skippedIds = [];

  try {
    for (const entry of entries) {
      if (!entry?.id) {
        continue;
      }

      const renewed = await expireIfValueMatches(
        namespace,
        entry.id,
        entry.expectedValue,
        ttlSeconds
      );
      if (renewed) {
        renewedIds.push(entry.id);
      } else {
        skippedIds.push(entry.id);
      }
    }

    return { ok: true, renewedIds, skippedIds };
  } catch (error) {
    logger.error('Redis expireManyIfValueMatches error:', { namespace, error: error.message });
    redisBreaker.recordFailure();
    return { ok: false, renewedIds, skippedIds };
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
    track(namespace, 1);
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
    track(namespace, 1);
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
    track(namespace, 1);
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

    let commandCount = 0;
    for (const id of ids) {
      if (!id) {
        continue;
      }
      const key = buildKey(namespace, id);
      pipeline.del(key);
      commandCount += 1;
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
      track(namespace, commandCount);
    }
    return !hasError;
  } catch (error) {
    logger.error('Redis delMany error:', { namespace, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Elimina una key solo si su valor coincide con el esperado.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @param {string|number} expectedValue - Valor esperado.
 * @returns {Promise<boolean>} True si se eliminó.
 */
const delIfValueMatches = async (namespace, id, expectedValue) => {
  if (!checkRedisAvailable()) {
    return true;
  }

  try {
    const currentValue = await get(namespace, id);
    if (currentValue === null || currentValue !== String(expectedValue)) {
      return false;
    }
    return await del(namespace, id);
  } catch (error) {
    logger.error('Redis delIfValueMatches error:', {
      namespace,
      id,
      error: error.message
    });
    redisBreaker.recordFailure();
    return false;
  }
};

/**
 * Elimina múltiples keys solo si su valor coincide con el esperado.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {{id:string, expectedValue:string|number}[]} entries - Entradas a eliminar.
 * @returns {Promise<{ok:boolean, deletedIds:string[], skippedIds:string[]}>}
 */
const delManyIfValueMatches = async (namespace, entries = []) => {
  if (!checkRedisAvailable()) {
    return { ok: true, deletedIds: [], skippedIds: [] };
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: true, deletedIds: [], skippedIds: [] };
  }

  const deletedIds = [];
  const skippedIds = [];

  try {
    for (const entry of entries) {
      if (!entry?.id) {
        continue;
      }

      const deleted = await delIfValueMatches(namespace, entry.id, entry.expectedValue);
      if (deleted) {
        deletedIds.push(entry.id);
      } else {
        skippedIds.push(entry.id);
      }
    }

    return { ok: true, deletedIds, skippedIds };
  } catch (error) {
    logger.error('Redis delManyIfValueMatches error:', { namespace, error: error.message });
    redisBreaker.recordFailure();
    return { ok: false, deletedIds, skippedIds };
  }
};

/**
 * Incrementa atomicamente un contador. Si la key no existe, la crea con valor 1.
 * Opcionalmente establece TTL en el primer incremento (cuando newValue === 1).
 *
 * Usado por accountLockoutService para contar intentos fallidos de login.
 *
 * @param {string} namespace - Namespace de la key.
 * @param {string} id - Identificador único.
 * @param {number} [ttlSecondsIfNew] - TTL en segundos solo si la key se crea ahora.
 * @returns {Promise<number>} Valor tras incrementar. 0 si Redis no disponible.
 */
const incr = async (namespace, id, ttlSecondsIfNew = null) => {
  if (!checkRedisAvailable()) {
    return 0;
  }

  try {
    const redis = getRedis();
    const key = buildKey(namespace, id);
    const newValue = await redis.incr(key);

    // TTL con `EXPIRE ... NX` (Redis 7+): fija el TTL solo si la key aún no tiene
    // uno. Antes el EXPIRE se ejecutaba únicamente cuando newValue===1, de modo que
    // un crash entre INCR y EXPIRE en la primera escritura dejaba la key SIN TTL
    // para siempre (leak en Redis con `noeviction` + ventana de lockout que nunca
    // expiraba). Reintentarlo con NX en cada incremento es idempotente (NX no
    // reescribe un TTL ya fijado → la ventana sigue siendo fija desde el primer
    // fallo) y auto-cura ese caso límite.
    let extraCommands = 0;
    if (Number.isInteger(ttlSecondsIfNew) && ttlSecondsIfNew > 0) {
      await redis.expire(key, ttlSecondsIfNew, 'NX');
      extraCommands = 1;
    }

    redisBreaker.recordSuccess();
    track(namespace, 1 + extraCommands);
    return newValue;
  } catch (error) {
    logger.error('Redis incr error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return 0;
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
    track(namespace, 1);
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

    let extraCommands = 0;
    if (ttlSeconds) {
      await redis.expire(key, ttlSeconds);
      extraCommands = 1;
    }

    logger.debug(`Redis HSET: ${key} (${Object.keys(data).length} fields)`);
    redisBreaker.recordSuccess();
    track(namespace, 1 + extraCommands);
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
      redisBreaker.recordSuccess();
      track(namespace, 1);
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
    track(namespace, 1);
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
    track(namespace, 1);
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
    track(namespace, 1);
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
    track(namespace, 1);
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
    track(namespace, 1);
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
    track(namespace, 1);
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
    track(namespace, 1);
    return true;
  } catch (error) {
    logger.error('Redis srem error:', { namespace, id, error: error.message });
    redisBreaker.recordFailure();
    return false;
  }
};

// =============================================================================
// OPERACIONES PIPELINE NATIVAS (T-907 Fase D)
// =============================================================================

/**
 * Ejecuta una pipeline arbitraria de comandos. Útil cuando un caller necesita
 * agrupar lecturas heterogéneas (p. ej. middleware authenticate combinando
 * `EXISTS blacklist:<jti>` + `GET security:<userId>` + `GET auth:user:<userId>`
 * en un solo round-trip a Redis). Reduce 3 round-trips a Upstash a 1.
 *
 * El caller construye los comandos contra el cliente ioredis nativo y se
 * encarga de mapear los resultados. Esta función solo expone el cliente y
 * registra la telemetría (1 round-trip = N comandos en el contador pipeline).
 *
 * Si Redis no está disponible, devuelve `null` y el caller decide el fallback.
 *
 * @param {(redis: import('ioredis').Pipeline) => import('ioredis').Pipeline} buildFn
 * @param {string} [namespace='pipeline'] - Categoría telemetría (default 'pipeline').
 * @returns {Promise<Array<[Error|null, any]>|null>}
 */
const runPipeline = async (buildFn, namespace = 'pipeline') => {
  if (!checkRedisAvailable()) {
    return null;
  }

  try {
    const redis = getRedis();
    const pipeline = redis.pipeline();
    buildFn(pipeline);
    const results = await pipeline.exec();
    redisBreaker.recordSuccess();
    // Cada operación añadida cuenta como 1 comando.
    const count = Array.isArray(results) ? results.length : 0;
    track(namespace, count);
    return results;
  } catch (error) {
    logger.error('Redis runPipeline error:', { error: error.message });
    redisBreaker.recordFailure();
    return null;
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
      track(namespace, 1);
      return keys.map(k => k.replace(keyPrefix, ''));
    }

    const keys = [];

    // Usar scanStream para no bloquear. COUNT 100 reduce los round-trips
    // respecto al default 10 — clave en namespaces con muchas keys.
    const stream = redis.scanStream({
      match: fullPattern,
      count: 100
    });

    return new Promise((resolve, reject) => {
      let scanIterations = 0;
      stream.on('data', resultKeys => {
        // Eliminar el keyPrefix de las keys retornadas para mantener consistencia
        const strippedKeys = resultKeys.map(k => k.replace(keyPrefix, ''));
        keys.push(...strippedKeys);
        scanIterations += 1;
      });

      stream.on('end', () => {
        redisBreaker.recordSuccess();
        // Cada iteración del cursor es 1 SCAN real al servidor.
        track(namespace, Math.max(1, scanIterations));
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

    // Eliminar en batch (1 DEL multi-key = 1 round-trip).
    await redis.del(...keys);

    logger.info(`Redis FLUSH: ${namespace} (${keys.length} keys eliminadas)`);
    redisBreaker.recordSuccess();
    track(namespace, 1);
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

  // scanByNamespace ya registra cada SCAN; aquí solo confirmamos éxito del breaker.
  redisBreaker.recordSuccess();
  return stats;
};

// =============================================================================
// OPERACIONES ATÓMICAS LUA (Distributed Card Locks)
// =============================================================================

/**
 * Ejecuta un Lua script por SHA (EVALSHA) con fallback a EVAL directo.
 * Si el SHA no está cargado (p.ej. tras SCRIPT FLUSH o ioredis-mock en tests),
 * cae al fallback secuencial proporcionado.
 *
 * @param {string} scriptName - Nombre del script (sin .lua).
 * @param {number} numKeys - Número de KEYS.
 * @param {...(string|number)} args - KEYS seguido de ARGV.
 * @returns {Promise<*>} Resultado del script.
 * @throws {Error} Si no se puede ejecutar el script.
 */
const evalLuaScript = async (scriptName, numKeys, ...args) => {
  const redis = getRedis();
  if (!redis) {
    throw new Error('Redis no disponible para ejecutar Lua script');
  }

  // En test, ioredis-mock no soporta EVAL/EVALSHA (fengari crash) — forzar fallback
  if (process.env.NODE_ENV === 'test') {
    throw new Error(`Lua no disponible en entorno test (script: ${scriptName})`);
  }

  // Intentar EVALSHA primero (SHA cacheado por loadLuaScripts)
  const sha = getLuaScriptSHA(scriptName);
  if (sha) {
    try {
      const result = await redis.evalsha(sha, numKeys, ...args);
      trackLua();
      return result;
    } catch (error) {
      // NOSCRIPT = el SHA no está en caché del servidor (p.ej. tras restart Redis)
      if (error.message?.includes('NOSCRIPT')) {
        logger.warn(`Redis: EVALSHA NOSCRIPT para '${scriptName}', reintentando con EVAL`);
      } else {
        throw error;
      }
    }
  }

  // Fallback: EVAL con el source completo
  const source = getLuaScriptSource(scriptName);
  if (source) {
    const result = await redis.eval(source, numKeys, ...args);
    trackLua();
    return result;
  }

  throw new Error(`Lua script '${scriptName}' no disponible (ni SHA ni source)`);
};

/**
 * Reserva atómica all-or-nothing de tarjetas RFID usando Lua.
 * Si alguna tarjeta ya está reservada, no escribe nada y retorna conflictos.
 *
 * Resuelve P1 (race condition en reserva secuencial): dos instancias no pueden
 * adquirir parcialmente tarjetas solapadas porque EVAL es atómico en Redis.
 *
 * @param {string} namespace - Namespace (normalmente NAMESPACES.CARD).
 * @param {{id:string, value:string}[]} entries - Entradas {id: cardUid, value: playId}.
 * @param {number} [ttlSeconds=0] - TTL en segundos (0 = sin TTL).
 * @returns {Promise<{ok:boolean, conflicts:string[]}>}
 */
const reserveCardsAtomic = async (namespace, entries = [], ttlSeconds = 0) => {
  if (!checkRedisAvailable()) {
    return { ok: true, conflicts: [] };
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: true, conflicts: [] };
  }

  const playId = entries[0].value;

  try {
    // ioredis aplica `keyPrefix` automáticamente a las KEYS de EVAL/EVALSHA, así
    // que aquí construimos solo el sufijo "namespace:id"; el cliente añade el
    // prefijo de la instancia. Si añadiéramos el prefijo manualmente quedaría
    // duplicado tanto en Redis como en el listado de conflictos.
    const keys = entries.map(e => buildKey(namespace, e.id));

    const rawResult = await evalLuaScript(
      'reserveCards',
      keys.length,
      ...keys,
      playId,
      String(ttlSeconds)
    );

    const result = JSON.parse(rawResult);
    redisBreaker.recordSuccess();

    if (!result.ok) {
      // Extraer UIDs de los conflictos: la Lua devuelve las KEYS tal y como se
      // las pasamos, así que el namespace ya viene como "namespace:uid".
      const conflictPrefix = `${namespace}:`;
      result.conflicts = result.conflicts.map(k =>
        k.startsWith(conflictPrefix) ? k.slice(conflictPrefix.length) : k
      );
    }

    return result;
  } catch (error) {
    logger.warn('Redis reserveCardsAtomic: Lua no disponible, usando fallback secuencial', {
      error: error.message
    });
    // Fallback: operación secuencial original
    return await setManyIfNotExists(namespace, entries, ttlSeconds);
  }
};

/**
 * Anti-replay del counter RFID con compare-and-set atómico (Lua).
 *
 * Lee y avanza el counter monotónico por sensor en UNA sola ejecución, cerrando
 * la ventana TOCTOU del get-then-setex previo (dos scans del mismo sensor podían
 * leer el mismo `previous`, pasar ambos y reabrir la ventana de replay).
 * Fail-open si Redis/Lua no están disponibles: la firma HMAC sigue protegiendo;
 * solo se podría reutilizar un scan capturado durante el outage (degradación
 * consciente, alineada con `reserveCardsAtomic`).
 *
 * @param {string} namespace - Namespace del counter (p. ej. 'rfid:counter').
 * @param {string} sensorId - Identificador del sensor.
 * @param {number} counter - Counter entrante del firmware.
 * @param {number} ttlSeconds - TTL del key en segundos.
 * @returns {Promise<{accepted:boolean, degraded:boolean}>} accepted=false => replay.
 */
const rfidCounterCheckAndAdvance = async (namespace, sensorId, counter, ttlSeconds) => {
  if (!checkRedisAvailable()) {
    return { accepted: true, degraded: true };
  }
  try {
    const counterKey = buildKey(namespace, sensorId);
    const res = await evalLuaScript(
      'rfidCounterCas',
      1,
      counterKey,
      String(counter),
      String(ttlSeconds)
    );
    redisBreaker.recordSuccess();
    return { accepted: Number(res) === 1, degraded: false };
  } catch (error) {
    // Lua no disponible (entorno test con ioredis-mock, o fallo puntual): fallback
    // secuencial get-then-setex. Reintroduce la ventana TOCTOU SOLO en este camino
    // raro y no concurrente (en producción la CAS Lua es la vía normal), pero
    // preserva la semántica anti-replay en vez de hacer fail-open.
    logger.warn('Redis rfidCounterCheckAndAdvance: Lua no disponible, fallback get/set', {
      error: error.message
    });
    try {
      const previousRaw = await get(namespace, sensorId);
      const previous = previousRaw ? Number.parseInt(previousRaw, 10) : -1;
      if (Number.isFinite(previous) && counter <= previous) {
        return { accepted: false, degraded: false };
      }
      await setWithTTL(namespace, sensorId, String(counter), ttlSeconds);
      return { accepted: true, degraded: false };
    } catch (fallbackError) {
      logger.warn('Redis rfidCounterCheckAndAdvance: fallback get/set falló, fail-open', {
        error: fallbackError.message
      });
      return { accepted: true, degraded: true };
    }
  }
};

/**
 * Liberación condicional atómica de tarjetas RFID usando Lua.
 * Solo elimina keys cuyo valor coincide con el playId esperado (owner-aware).
 *
 * Resuelve P2 (race condition en liberación secuencial): GET+compare+DEL
 * se ejecutan como una sola operación atómica, sin ventana de carrera.
 *
 * @param {string} namespace - Namespace (normalmente NAMESPACES.CARD).
 * @param {{id:string, expectedValue:string}[]} entries - Entradas con id y playId esperado.
 * @returns {Promise<{ok:boolean, deletedCount:number}>}
 */
const releaseCardsAtomic = async (namespace, entries = []) => {
  if (!checkRedisAvailable()) {
    return { ok: true, deletedCount: 0 };
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: true, deletedCount: 0 };
  }

  const expectedPlayId = entries[0].expectedValue;

  try {
    // ioredis añade `keyPrefix` automáticamente a las KEYS de EVAL/EVALSHA.
    const keys = entries.map(e => buildKey(namespace, e.id));

    const deletedCount = await evalLuaScript('releaseCards', keys.length, ...keys, expectedPlayId);

    redisBreaker.recordSuccess();
    return { ok: true, deletedCount: Number(deletedCount) };
  } catch (error) {
    logger.warn('Redis releaseCardsAtomic: Lua no disponible, usando fallback secuencial', {
      error: error.message
    });
    // Fallback secuencial
    const result = await delManyIfValueMatches(namespace, entries);
    return { ok: result.ok, deletedCount: result.deletedIds.length };
  }
};

/**
 * Renovación atómica de lease (play key + card keys) usando Lua.
 * Consolida N×3 round-trips en 1 sola ejecución atómica.
 *
 * Resuelve P3 (heartbeat costoso): con 20 tarjetas, pasa de ~61 round-trips
 * a 1 solo EVALSHA. Reduce latencia y carga en Redis significativamente.
 *
 * @param {string} playNamespace - Namespace de plays (normalmente NAMESPACES.PLAY).
 * @param {string} playId - ID de la partida.
 * @param {string} cardNamespace - Namespace de cards (normalmente NAMESPACES.CARD).
 * @param {string[]} cardUids - UIDs de tarjetas asociadas a la partida.
 * @param {number} ttlSeconds - TTL en segundos.
 * @returns {Promise<{ok:boolean, playRenewed:boolean, cardsRenewed:number, cardsSkipped:number}>}
 */
const renewLeaseAtomic = async (playNamespace, playId, cardNamespace, cardUids, ttlSeconds) => {
  if (!checkRedisAvailable()) {
    return { ok: true, playRenewed: true, cardsRenewed: 0, cardsSkipped: 0 };
  }

  try {
    // ioredis añade `keyPrefix` automáticamente a las KEYS de EVAL/EVALSHA.
    // KEYS = [playKey, cardKey1, cardKey2, ...]
    const playKey = buildKey(playNamespace, playId);
    const cardKeys = cardUids.map(uid => buildKey(cardNamespace, uid));
    const allKeys = [playKey, ...cardKeys];

    const rawResult = await evalLuaScript(
      'renewLease',
      allKeys.length,
      ...allKeys,
      playId,
      String(ttlSeconds)
    );

    const result = JSON.parse(rawResult);
    redisBreaker.recordSuccess();
    return { ok: true, ...result };
  } catch (error) {
    logger.warn('Redis renewLeaseAtomic: Lua no disponible, usando fallback secuencial', {
      error: error.message
    });
    // Fallback secuencial
    const playRenewed = await expire(playNamespace, playId, ttlSeconds);
    const cardResult = await expireManyIfValueMatches(
      cardNamespace,
      cardUids.map(uid => ({ id: uid, expectedValue: playId })),
      ttlSeconds
    );
    return {
      ok: cardResult.ok,
      playRenewed,
      cardsRenewed: cardResult.renewedIds.length,
      cardsSkipped: cardResult.skippedIds.length
    };
  }
};

// =============================================================================
// OPERACIONES PIPELINE (Batch Reads)
// =============================================================================

/**
 * Verifica existencia de múltiples keys en batch usando pipeline.
 * Reduce N round-trips a 1 pipeline.
 *
 * Resuelve P4 (N+1 en recovery): las verificaciones individuales de keys
 * durante recoverOrphanedPlaysFromDB se consolidan en 1 pipeline.
 *
 * @param {string} namespace - Namespace.
 * @param {string[]} ids - Identificadores a verificar.
 * @returns {Promise<Map<string, boolean>>} Map de id → exists.
 */
const existsMany = async (namespace, ids = []) => {
  const resultMap = new Map();

  if (!checkRedisAvailable()) {
    return resultMap;
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return resultMap;
  }

  try {
    const redis = getRedis();
    const pipeline = redis.pipeline();

    let commandCount = 0;
    for (const id of ids) {
      if (!id) {
        continue;
      }
      const key = buildKey(namespace, id);
      pipeline.exists(key);
      commandCount += 1;
    }

    const results = await pipeline.exec();

    const validIds = ids.filter(id => id);
    for (let i = 0; i < validIds.length; i++) {
      const [error, result] = results[i] || [];
      resultMap.set(validIds[i], !error && result === 1);
    }

    redisBreaker.recordSuccess();
    track(namespace, commandCount);
    return resultMap;
  } catch (error) {
    // Fallback secuencial (ioredis-mock puede no soportar pipeline correctamente)
    logger.warn('Redis existsMany pipeline error, usando fallback secuencial', {
      namespace,
      error: error.message
    });
    try {
      for (const id of ids) {
        if (!id) {
          continue;
        }
        const found = await exists(namespace, id);
        resultMap.set(id, found);
      }
      return resultMap;
    } catch (fallbackError) {
      logger.error('Redis existsMany fallback error:', { namespace, error: fallbackError.message });
      redisBreaker.recordFailure();
      return resultMap;
    }
  }
};

/**
 * Obtiene HGETALL de múltiples keys en batch usando pipeline.
 * Reduce N round-trips a 1 pipeline.
 *
 * Usado en recovery para leer el estado completo de múltiples plays
 * en una sola operación de red.
 *
 * @param {string} namespace - Namespace.
 * @param {string[]} ids - Identificadores a leer.
 * @returns {Promise<Map<string, Object|null>>} Map de id → hash object o null.
 */
const hgetallMany = async (namespace, ids = []) => {
  const resultMap = new Map();

  if (!checkRedisAvailable()) {
    return resultMap;
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return resultMap;
  }

  try {
    const redis = getRedis();
    const pipeline = redis.pipeline();

    let commandCount = 0;
    for (const id of ids) {
      if (!id) {
        continue;
      }
      const key = buildKey(namespace, id);
      pipeline.hgetall(key);
      commandCount += 1;
    }

    const results = await pipeline.exec();

    const validIds = ids.filter(id => id);
    for (let i = 0; i < validIds.length; i++) {
      const [error, result] = results[i] || [];
      if (error || !result || Object.keys(result).length === 0) {
        resultMap.set(validIds[i], null);
      } else {
        resultMap.set(validIds[i], result);
      }
    }

    redisBreaker.recordSuccess();
    track(namespace, commandCount);
    return resultMap;
  } catch (error) {
    // Fallback secuencial (ioredis-mock puede no soportar pipeline correctamente)
    logger.warn('Redis hgetallMany pipeline error, usando fallback secuencial', {
      namespace,
      error: error.message
    });
    try {
      for (const id of ids) {
        if (!id) {
          continue;
        }
        const data = await hgetall(namespace, id);
        resultMap.set(id, data && Object.keys(data).length > 0 ? data : null);
      }
      return resultMap;
    } catch (fallbackError) {
      logger.error('Redis hgetallMany fallback error:', {
        namespace,
        error: fallbackError.message
      });
      redisBreaker.recordFailure();
      return resultMap;
    }
  }
};

module.exports = {
  // Namespaces
  NAMESPACES,

  // Utilidades
  buildKey,
  checkRedisAvailable,

  // Strings
  set,
  setIfNotExists,
  setMany,
  setManyIfNotExists,
  setWithTTL,
  get,
  exists,
  del,
  delIfValueMatches,
  delMany,
  delManyIfValueMatches,
  expire,
  expireIfValueMatches,
  expireManyIfValueMatches,
  incr,
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
  getStats,

  // Operaciones atómicas Lua (distributed card locks)
  reserveCardsAtomic,
  releaseCardsAtomic,
  renewLeaseAtomic,
  rfidCounterCheckAndAdvance,

  // Pipeline batch operations
  existsMany,
  hgetallMany,
  runPipeline,

  // Diagnóstico
  getCircuitBreakerState: () => redisBreaker.getState()
};
