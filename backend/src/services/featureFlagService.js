/**
 * @fileoverview Servicio de feature flags distribuidos.
 *
 * Mantiene un catálogo de flags en Redis (Hash por nombre) con:
 * - `enabled` (kill switch): '1' o '0'.
 * - `rolloutPct`: 0-100, evaluado por FNV-1a determinístico del userId.
 * - `whitelist`: lista de userIds separados por coma que siempre reciben la flag activa.
 * - Metadatos: `reason`, `updatedBy`, `updatedAt`.
 *
 * Las lecturas pasan por `cacheGet` con TTL corto (30s) para minimizar latencia,
 * manteniendo buena responsividad ante cambios desde el panel admin.
 *
 * @module services/featureFlagService
 */

const redisService = require('./redisService');
const { cacheGet, cacheInvalidate } = require('../utils/cacheHelper');
const { bucketPct } = require('../utils/fnv1a');
const logger = require('../utils/logger').child({ component: 'featureFlagService' });

/** Namespace Redis para los Hashes de flags (`feature:<name>`). */
const FLAG_NAMESPACE = 'feature';
/** Namespace cache para lecturas evaluadas por flag. */
const FLAG_CACHE_NAMESPACE = 'cache:flags';
/** TTL del cache local de flags en segundos. Breve para aceptar cambios rápidos desde el panel. */
const FLAG_CACHE_TTL = 30;

/**
 * Nombre del flag reservado para marcar una flag como "conocida" aunque no tenga valor activo.
 * No se expone al cliente; su presencia permite que el panel admin liste todos los nombres
 * registrados incluso si están deshabilitados.
 */
const FLAG_INDEX_KEY = '__registry__';

/**
 * Convierte un string "uid1,uid2,uid3" en un Set para lookup O(1).
 *
 * @param {string|undefined|null} raw
 * @returns {Set<string>}
 */
const parseWhitelist = raw => {
  if (!raw || typeof raw !== 'string') {
    return new Set();
  }
  return new Set(
    raw
      .split(',')
      .map(uid => uid.trim())
      .filter(Boolean)
  );
};

/**
 * `redisService.hgetall` intenta JSON.parse cada campo, lo que convierte
 * strings numéricos ('1', '50') en números y strings JSON en objetos.
 * Para un contrato estable con el resto del servicio, normalizamos todo a string.
 *
 * @param {Object|null} raw
 * @returns {Object|null}
 */
const normalizeRawFlag = raw => {
  if (!raw) {
    return null;
  }
  const out = {};
  for (const [field, value] of Object.entries(raw)) {
    if (value === null || value === undefined) {
      out[field] = '';
    } else if (typeof value === 'string') {
      out[field] = value;
    } else {
      out[field] = String(value);
    }
  }
  return out;
};

const isTruthyFlag = value => value === '1' || value === 1 || value === true;

/**
 * Lee el Hash raw de la flag desde Redis, sin cache.
 *
 * @param {string} name - Nombre de la flag.
 * @returns {Promise<Object|null>} Objeto normalizado a strings o null si no existe.
 */
const loadFlagFromRedis = async name => {
  const raw = await redisService.hgetall(FLAG_NAMESPACE, name);
  return normalizeRawFlag(raw);
};

/**
 * Obtiene una flag cacheada (30s). Devuelve los raw strings tal como los guarda Redis.
 * Solo se cachea para reducir la latencia de `isEnabled`; la mutación invalida explícitamente.
 *
 * @param {string} name
 * @returns {Promise<Object|null>}
 */
const getFlagCached = async name =>
  cacheGet(FLAG_CACHE_NAMESPACE, name, () => loadFlagFromRedis(name), FLAG_CACHE_TTL);

/**
 * Evalúa si una flag está activa para un usuario concreto.
 *
 * Orden de evaluación:
 *  1. Si la flag no existe → `false` (default seguro).
 *  2. Si `enabled` === '0' → `false` (kill switch).
 *  3. Si el userId está en whitelist → `true`.
 *  4. Si `rolloutPct` > 0 y FNV1a(userId) % 100 < rolloutPct → `true`.
 *  5. Si no hay userId (llamada de sistema) y `rolloutPct` === 100 → `true`.
 *  6. Cualquier otro caso → `false`.
 *
 * @param {string} name - Nombre de la flag.
 * @param {string|null} [userId] - userId para evaluar rollout y whitelist.
 * @returns {Promise<boolean>}
 */
const isEnabled = async (name, userId = null) => {
  if (!name || typeof name !== 'string') {
    return false;
  }

  try {
    const flag = await getFlagCached(name);
    if (!flag) {
      return false;
    }

    if (!isTruthyFlag(flag.enabled)) {
      return false;
    }

    // La entrada de registry no es una flag propiamente dicha
    if (name === FLAG_INDEX_KEY) {
      return false;
    }

    const whitelist = parseWhitelist(flag.whitelist);
    if (userId && whitelist.has(String(userId))) {
      return true;
    }

    const rolloutPct = Number.parseInt(flag.rolloutPct, 10);
    if (Number.isFinite(rolloutPct) && rolloutPct > 0) {
      if (rolloutPct >= 100) {
        return true;
      }
      if (userId) {
        return bucketPct(String(userId)) < rolloutPct;
      }
      // Sin userId no se puede evaluar el bucket: la flag solo se activa para sistema
      // si rolloutPct === 100 (comprobado arriba).
      return false;
    }

    return false;
  } catch (error) {
    logger.warn('featureFlag evaluación fallida, devolviendo false', {
      name,
      error: error.message
    });
    return false;
  }
};

/**
 * Lista todas las flags registradas con sus valores raw.
 * Se usa en el panel admin. Escanea keys `feature:*` y hace HGETALL de cada una.
 *
 * @returns {Promise<Array<{name:string, enabled:boolean, rolloutPct:number, whitelist:string[], reason:string, updatedAt:string, updatedBy:string}>>}
 */
const listFlags = async () => {
  const ids = await redisService.scanByNamespace(FLAG_NAMESPACE);
  const names = ids
    .map(key => key.replace(`${FLAG_NAMESPACE}:`, ''))
    .filter(name => name && name !== FLAG_INDEX_KEY);

  const results = [];
  for (const name of names) {
    const flag = await loadFlagFromRedis(name);
    if (!flag) {
      continue;
    }
    results.push(toFlagDTO(name, flag));
  }

  // Ordenar alfabéticamente por nombre para estabilidad del panel
  return results.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Obtiene una flag por nombre con valores parseados (para el panel admin).
 *
 * @param {string} name
 * @returns {Promise<Object|null>}
 */
const getFlag = async name => {
  const raw = await loadFlagFromRedis(name);
  if (!raw) {
    return null;
  }
  return toFlagDTO(name, raw);
};

/**
 * Crea o actualiza una flag. Invalida la cache local tras escribir.
 *
 * @param {string} name - Nombre de la flag (kebab o camelCase, validar en capa superior).
 * @param {Object} input
 * @param {boolean} input.enabled
 * @param {number} [input.rolloutPct=0]
 * @param {string[]} [input.whitelist=[]]
 * @param {string} [input.reason='']
 * @param {string|null} [updatedBy]
 * @returns {Promise<Object>} DTO de la flag actualizada.
 */
const setFlag = async (name, input, updatedBy = null) => {
  const data = {
    enabled: input.enabled ? '1' : '0',
    rolloutPct: String(Math.max(0, Math.min(100, Number.parseInt(input.rolloutPct, 10) || 0))),
    whitelist: Array.isArray(input.whitelist) ? input.whitelist.join(',') : '',
    reason: typeof input.reason === 'string' ? input.reason : '',
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ? String(updatedBy) : ''
  };

  await redisService.hset(FLAG_NAMESPACE, name, data);
  await cacheInvalidate(FLAG_CACHE_NAMESPACE, name);

  logger.info('Feature flag actualizada', {
    name,
    enabled: data.enabled,
    rolloutPct: data.rolloutPct,
    whitelistCount: parseWhitelist(data.whitelist).size,
    updatedBy
  });

  return toFlagDTO(name, data);
};

/**
 * Elimina una flag del registro. Invalida el cache.
 *
 * @param {string} name
 * @returns {Promise<boolean>} True si se eliminó.
 */
const deleteFlag = async name => {
  const ok = await redisService.del(FLAG_NAMESPACE, name);
  await cacheInvalidate(FLAG_CACHE_NAMESPACE, name);
  if (ok) {
    logger.info('Feature flag eliminada', { name });
  }
  return ok;
};

/**
 * Evalúa todas las flags para un userId concreto. Útil para el endpoint /api/me/flags
 * que el frontend consume al iniciar sesión.
 *
 * @param {string|null} userId
 * @returns {Promise<Record<string, boolean>>}
 */
const evaluateAllForUser = async userId => {
  const flags = await listFlags();
  const result = {};
  for (const flag of flags) {
    result[flag.name] = await isEnabled(flag.name, userId);
  }
  return result;
};

/**
 * Convierte el raw storage format en un DTO seguro para el cliente.
 *
 * @param {string} name
 * @param {Object} raw
 * @returns {{name:string, enabled:boolean, rolloutPct:number, whitelist:string[], reason:string, updatedAt:string, updatedBy:string}}
 */
const toFlagDTO = (name, raw) => ({
  name,
  enabled: isTruthyFlag(raw.enabled),
  rolloutPct: Number.parseInt(raw.rolloutPct, 10) || 0,
  whitelist:
    typeof raw.whitelist === 'string' && raw.whitelist
      ? raw.whitelist.split(',').filter(Boolean)
      : [],
  reason: raw.reason || '',
  updatedAt: raw.updatedAt || '',
  updatedBy: raw.updatedBy || ''
});

module.exports = {
  isEnabled,
  listFlags,
  getFlag,
  setFlag,
  deleteFlag,
  evaluateAllForUser,
  // Exportados para tests unitarios
  _parseWhitelist: parseWhitelist,
  FLAG_NAMESPACE,
  FLAG_CACHE_NAMESPACE,
  FLAG_CACHE_TTL
};
