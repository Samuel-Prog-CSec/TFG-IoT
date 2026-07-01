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
const { recordCacheLayerOutcome } = require('./runtimeMetrics');
const { mechanicCache, contextCache } = require('./inMemoryCache');

/**
 * (B3) L1 en memoria del proceso para namespaces de baja cardinalidad y muy
 * pocas escrituras. Estas instancias LRU (TTL 60s, ver inMemoryCache.js) estaban
 * definidas pero `cacheGet` nunca las consultaba: cada lectura de mecánicas o
 * contextos golpeaba Redis aunque el mismo proceso ya tuviera el valor. Al
 * leerlas como L1 antes de Redis ahorramos un GET a Upstash por lectura (se
 * ejecutan en casi cada carga de dashboard / crear-sesión) bajo el free-tier.
 *
 * Consistencia: TTL corto (60s) + limpieza explícita de L1 en las funciones de
 * invalidación (cacheInvalidate / *Namespace / *Pattern) y en el invalidador de
 * contextos. Las mecánicas son de solo lectura vía API (no hay create/update/delete),
 * así que su L1 nunca necesita invalidarse.
 * @type {Record<string, import('./inMemoryCache').InMemoryCache>}
 */
const L1_BY_NAMESPACE = {
  'cache:mechanic': mechanicCache,
  'cache:context': contextCache
};

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
 * B.2 (pre-v1.0.0): aplica jitter ±10% al TTL para mitigar thundering herd.
 * Si 30 dashboards de profes están abiertos al mismo tiempo y todos cachean
 * `getClassroomSummary` en el mismo segundo, sin jitter expiran en bloque y
 * disparan 30 aggregations Mongo concurrentes. Con ±10% el storm se diluye
 * sobre ≈10% del TTL. Floor en 30s para no degenerar.
 *
 * @param {number} ttlSeconds
 * @returns {number} TTL con jitter aplicado, mínimo 30s.
 */
const withTtlJitter = ttlSeconds =>
  // Math.random aquí es performance (jitter contra thundering herd), no
  // criptografía — sonarjs/pseudo-random no aplica.
  // eslint-disable-next-line sonarjs/pseudo-random
  Math.max(30, Math.floor(ttlSeconds + (Math.random() - 0.5) * ttlSeconds * 0.2));

/**
 * Mapa de promesas en vuelo para single-flight (deduplicación de misses
 * concurrentes sobre la MISMA clave). El jitter de `withTtlJitter` desincroniza
 * la expiración entre claves distintas, pero NO protege una clave caliente
 * individual: cuando `teacherSessions:<id>` o un facet de analytics expira y
 * llegan N requests del mismo dashboard en esa ventana, sin esto las N ejecutan
 * la misma aggregation Mongo (`$lookup`+`$facet`) a la vez — el escenario que
 * más puede degradar Atlas free-tier bajo carga concurrente. Con el inFlight,
 * la primera calcula y las demás esperan a su promesa (single-instance basta:
 * en multi-instancia cada réplica recalcula a lo sumo una vez, no N).
 *
 * @type {Map<string, Promise<*>>}
 */
const inFlight = new Map();

/**
 * Obtiene un valor del cache o lo calcula y cachea.
 * Patrón cache-aside con single-flight: busca en Redis, si no existe ejecuta
 * fetchFn (coalesciendo misses concurrentes de la misma clave), guarda el
 * resultado en Redis y lo retorna.
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
  const baseTtl = ttlSeconds || DEFAULT_TTLS[namespace.replace('cache:', '')] || 300;
  const l1 = L1_BY_NAMESPACE[namespace];

  // (B3) L1 en memoria: si el mismo proceso ya tiene el valor fresco (TTL 60s),
  // se sirve sin tocar Redis. Ahorra un GET Upstash por lectura de mecánica/contexto.
  if (l1) {
    const l1Value = l1.get(key);
    if (l1Value !== undefined) {
      recordCacheLayerOutcome(namespace, 'hit');
      return l1Value;
    }
  }

  // Intentar obtener del cache Redis
  const cached = await redisService.get(namespace, key);

  if (cached !== null) {
    logger.debug('Cache HIT', { namespace, key });
    try {
      const parsed = JSON.parse(cached);
      // B.1: hit/miss para diagnosticar eficacia del cache por namespace.
      recordCacheLayerOutcome(namespace, 'hit');
      // Poblar L1 para servir las siguientes lecturas del mismo proceso sin Redis.
      if (l1) {
        l1.set(key, parsed);
      }
      return parsed;
    } catch {
      // Si el valor cacheado no es JSON válido, ignorar y refetch
      logger.warn('Cache: valor no parseable, refetching', { namespace, key });
    }
  }

  logger.debug('Cache MISS', { namespace, key });
  recordCacheLayerOutcome(namespace, 'miss');

  // Single-flight: si ya hay un cálculo en vuelo para esta clave, esperar a su
  // promesa en vez de disparar otra aggregation idéntica (anti cache stampede).
  const flightKey = `${namespace}:${key}`;
  const pending = inFlight.get(flightKey);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    // Fetch desde la fuente original
    const data = await fetchFn();

    // Poblar L1 (síncrono) para que la siguiente lectura del proceso lo sirva.
    if (l1) {
      l1.set(key, data);
    }

    // Guardar en cache Redis (fire-and-forget, no bloquea la respuesta).
    // B.2: jitter ±10% sobre el TTL para evitar invalidaciones en bloque.
    const jitteredTtl = withTtlJitter(baseTtl);
    redisService.setWithTTL(namespace, key, JSON.stringify(data), jitteredTtl).catch(err => {
      logger.warn('Cache: error al guardar', { namespace, key, error: err.message });
    });

    return data;
  })().finally(() => inFlight.delete(flightKey));

  inFlight.set(flightKey, promise);
  return promise;
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
  // (B3) Limpiar también la L1 en memoria para que el mismo proceso no siga
  // sirviendo el valor viejo hasta el TTL de 60s tras una mutación.
  const l1 = L1_BY_NAMESPACE[namespace];
  if (l1) {
    l1.delete(key);
  }
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
  // (B3) Vaciar la L1 del namespace: no podemos saber qué claves cachea, así que
  // limpiamos entera (LRU pequeña, coste despreciable).
  const l1 = L1_BY_NAMESPACE[namespace];
  if (l1) {
    l1.clear();
  }
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
  // (B3) La L1 no soporta match por patrón; ante una invalidación selectiva de
  // Redis vaciamos la L1 entera del namespace (segura por su tamaño reducido).
  const l1 = L1_BY_NAMESPACE[namespace];
  if (l1) {
    l1.clear();
  }
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
