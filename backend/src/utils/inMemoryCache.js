/**
 * @fileoverview Cache LRU con TTL en memoria del proceso (T-907 Fase D).
 *
 * Complementa el cache Redis: cuando una clave (p. ej. `auth:user:<id>`) se
 * consulta varias veces en pocos segundos desde la misma instancia del backend,
 * la lectura va a memoria local en vez de Upstash. Reduce comandos al free tier
 * sin sacrificar consistencia significativa porque el TTL es muy corto (≤30s) y
 * la invalidación explícita en mutaciones también limpia esta capa.
 *
 * Características:
 *   - LRU verdadero: las claves más usadas se mueven al final del Map cuando se
 *     leen para que las menos usadas se expulsen primero al llegar al `max`.
 *   - TTL por instancia (no por entrada): todas las entradas comparten el mismo
 *     TTL definido en el constructor. Si se necesitan TTLs distintos, crear
 *     instancias diferentes (es lo que hacemos: una para `auth:user`, otra para
 *     `cache:mechanic`, otra para `cache:context`).
 *   - Métrica hit/miss: contadores expuestos para integrarse en runtimeMetrics.
 *
 * No es una dependencia externa para minimizar superficie de ataque y dependency
 * weight. La implementación es deliberadamente pequeña.
 *
 * @module utils/inMemoryCache
 */

class InMemoryCache {
  /**
   * @param {Object} opts
   * @param {string} opts.name        - Identificador (para métricas).
   * @param {number} [opts.max=500]   - Tamaño máximo (LRU).
   * @param {number} [opts.ttlMs=30000] - TTL en milisegundos.
   */
  constructor({ name, max = 500, ttlMs = 30000 } = {}) {
    if (!name) {
      throw new Error('InMemoryCache requires a name');
    }
    this.name = name;
    this.max = max;
    this.ttlMs = ttlMs;
    /** @type {Map<string, {value: any, expiresAt: number}>} */
    this.store = new Map();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Devuelve el valor cacheado o `undefined` si no existe o está expirado.
   * Marca el acceso como reciente (LRU bump).
   *
   * @param {string} key
   * @returns {any|undefined}
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      this.misses += 1;
      return undefined;
    }
    // Re-insertar para mover al final (más reciente).
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  /**
   * Guarda `value` bajo `key`. Aplica eviction LRU si se supera `max`.
   *
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.max) {
      // Map mantiene orden de inserción; la primera key es la más antigua.
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
        this.evictions += 1;
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /**
   * Elimina una entrada explícitamente. Devuelve `true` si existía.
   *
   * @param {string} key
   * @returns {boolean}
   */
  delete(key) {
    return this.store.delete(key);
  }

  /**
   * Vacía el cache completo.
   */
  clear() {
    this.store.clear();
  }

  /**
   * Snapshot de métricas para `/api/metrics`.
   */
  stats() {
    const totalLookups = this.hits + this.misses;
    const hitRate = totalLookups === 0 ? 0 : Math.round((this.hits / totalLookups) * 1000) / 10;
    return {
      name: this.name,
      size: this.store.size,
      max: this.max,
      ttlMs: this.ttlMs,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRatePercent: hitRate
    };
  }

  /**
   * Reinicia contadores (no el contenido). Para tests.
   */
  resetStats() {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}

// =============================================================================
// Instancias singleton por dominio
// =============================================================================
//
// Se exponen instancias preconfiguradas para los tres usos principales del
// proyecto. Quien necesite otra TTL/size puede crear su propia instancia con
// `new InMemoryCache(...)`. Los TTLs se pueden override por env var sin
// recompilar para tuning en producción.

const AUTH_USER_CACHE_TTL_MS = Number.parseInt(process.env.IN_MEMORY_AUTH_USER_TTL_MS, 10) || 30000;
const AUTH_USER_CACHE_MAX = Number.parseInt(process.env.IN_MEMORY_AUTH_USER_MAX, 10) || 500;

const CACHE_MECHANIC_TTL_MS = Number.parseInt(process.env.IN_MEMORY_MECHANIC_TTL_MS, 10) || 60000;
const CACHE_MECHANIC_MAX = Number.parseInt(process.env.IN_MEMORY_MECHANIC_MAX, 10) || 50;

const CACHE_CONTEXT_TTL_MS = Number.parseInt(process.env.IN_MEMORY_CONTEXT_TTL_MS, 10) || 60000;
const CACHE_CONTEXT_MAX = Number.parseInt(process.env.IN_MEMORY_CONTEXT_MAX, 10) || 100;

const authUserCache = new InMemoryCache({
  name: 'auth:user',
  max: AUTH_USER_CACHE_MAX,
  ttlMs: AUTH_USER_CACHE_TTL_MS
});

const mechanicCache = new InMemoryCache({
  name: 'cache:mechanic',
  max: CACHE_MECHANIC_MAX,
  ttlMs: CACHE_MECHANIC_TTL_MS
});

const contextCache = new InMemoryCache({
  name: 'cache:context',
  max: CACHE_CONTEXT_MAX,
  ttlMs: CACHE_CONTEXT_TTL_MS
});

/**
 * Devuelve el snapshot agregado de todas las instancias singleton.
 */
const getAllStats = () => ({
  authUser: authUserCache.stats(),
  mechanic: mechanicCache.stats(),
  context: contextCache.stats()
});

module.exports = {
  InMemoryCache,
  authUserCache,
  mechanicCache,
  contextCache,
  getAllStats
};
