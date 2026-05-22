/**
 * @fileoverview Telemetría de comandos enviados a Redis, agrupados por categoría
 * funcional (T-907 Fase D, PROP-123).
 *
 * Objetivo: monitorizar el consumo de comandos del free tier Upstash (10K/día)
 * y detectar regresiones cuando un nuevo endpoint dispara muchos comandos por
 * petición. La granularidad por categoría permite identificar el namespace que
 * está costando más sin instrumentar caller a caller.
 *
 * Categorías mapeadas (a partir del namespace de la key):
 *   - `auth`         → `auth:user`, `auth:fail`, `auth:lock`
 *   - `blacklist`    → `blacklist`
 *   - `refresh`      → `refresh`, `used`, `tokenfamily`
 *   - `security`     → `security`
 *   - `cache-mechanic`  → `cache:mechanic`
 *   - `cache-context`   → `cache:context`
 *   - `cache-analytics` → `cache:analytics`
 *   - `play`         → `play`, `play:init`
 *   - `card`         → `card`
 *   - `ratelimit`    → `rl:*` (rate-limit-redis)
 *   - `ws`           → `rl:ws:*`, `rfid:mode`, `rfid:sensor`
 *   - `bullmq`       → `bull:*`
 *   - `lua`          → ejecuciones de scripts Lua (reserveCards, releaseCards, renewLease)
 *   - `pipeline`     → ejecuciones de pipelines explícitos (existsMany, hgetallMany, …)
 *   - `other`        → resto / desconocido
 *
 * Salida vía `/api/metrics`:
 *   redis.commandsByCategory: { auth: 1234, blacklist: 56, … }
 *   redis.commandsTotal: 12345
 *   redis.commandsEstimatedDaily: 234567   // extrapolación lineal desde uptime
 *
 * @module utils/redisCommandTracker
 */

// Logger opcional: si el módulo se carga antes que `utils/logger` esté
// inicializado (p. ej. en tests aislados), fallback a no-op. Usamos require
// dentro del helper para evitar ciclos al boot.
const getLogger = () => {
  try {
    return require('./logger').child({ component: 'redisCommandTracker' });
  } catch {
    return { debug: () => {} };
  }
};

const KNOWN_CATEGORIES = [
  'auth',
  'blacklist',
  'refresh',
  'security',
  'cache-mechanic',
  'cache-context',
  'cache-analytics',
  'play',
  'card',
  'ratelimit',
  'ws',
  'bullmq',
  'lua',
  'pipeline',
  'other'
];

const initialState = () => ({
  startedAt: Date.now(),
  total: 0,
  byCategory: Object.fromEntries(KNOWN_CATEGORIES.map(c => [c, 0]))
});

let state = initialState();

/**
 * Mapea un namespace canónico a su categoría de telemetría.
 * El namespace viene del enum `redisService.NAMESPACES` o del prefijo de la
 * key cuando se ejecuta un comando directo sin pasar por el servicio.
 *
 * @param {string} namespace
 * @returns {string} categoría
 */
const categoryForNamespace = namespace => {
  if (!namespace || typeof namespace !== 'string') {
    return 'other';
  }
  const ns = namespace.toLowerCase();

  if (ns.startsWith('auth:')) {
    return 'auth';
  }
  if (ns === 'blacklist') {
    return 'blacklist';
  }
  if (ns === 'refresh' || ns === 'used' || ns === 'tokenfamily') {
    return 'refresh';
  }
  if (ns === 'security') {
    return 'security';
  }
  if (ns === 'cache:mechanic') {
    return 'cache-mechanic';
  }
  if (ns === 'cache:context') {
    return 'cache-context';
  }
  if (ns === 'cache:analytics') {
    return 'cache-analytics';
  }
  if (ns === 'play' || ns === 'play:init') {
    return 'play';
  }
  if (ns === 'card') {
    return 'card';
  }
  if (ns.startsWith('rl:ws')) {
    return 'ws';
  }
  if (ns.startsWith('rl:')) {
    return 'ratelimit';
  }
  if (ns.startsWith('rfid:')) {
    return 'ws';
  }
  if (ns.startsWith('bull:')) {
    return 'bullmq';
  }

  return 'other';
};

/**
 * Registra `count` comandos asignados a `category`. Si se pasa un namespace en
 * vez de categoría (por compatibilidad con consumidores que ya tienen el
 * namespace a mano), se resuelve automáticamente.
 *
 * @param {string} categoryOrNamespace
 * @param {number} [count=1]
 */
const recordCommand = (categoryOrNamespace, count = 1) => {
  if (!Number.isFinite(count) || count <= 0) {
    // Trazamos los rechazos para postmortem (caller que pasa NaN, 0, negativos…).
    // `debug` evita ruido en boot pero deja la señal disponible al subir el nivel.
    getLogger().debug('recordCommand: rechazado por count inválido', {
      count,
      categoryOrNamespace
    });
    return;
  }
  const category = KNOWN_CATEGORIES.includes(categoryOrNamespace)
    ? categoryOrNamespace
    : categoryForNamespace(categoryOrNamespace);
  state.byCategory[category] = (state.byCategory[category] || 0) + count;
  state.total += count;
};

/**
 * Snapshot del contador. Incluye `estimatedDaily` linealizando los segundos
 * transcurridos desde el último reset; útil para detectar tempranamente si la
 * tasa actual rompería el free tier diario (10K Upstash) si se mantuviera 24h.
 *
 * @returns {{startedAt:number, uptimeSeconds:number, total:number, byCategory:Record<string,number>, estimatedDaily:number}}
 */
const getSnapshot = () => {
  const uptimeMs = Date.now() - state.startedAt;
  const uptimeSeconds = Math.max(1, Math.floor(uptimeMs / 1000));
  const estimatedDaily = Math.round((state.total / uptimeSeconds) * 86400);
  return {
    startedAt: state.startedAt,
    uptimeSeconds,
    total: state.total,
    byCategory: { ...state.byCategory },
    estimatedDaily
  };
};

/**
 * Reinicia los contadores. Útil para tests y para “zero” diario en producción
 * si decidimos resetear cada 24h (ahora mismo el snapshot ya extrapola).
 */
const reset = () => {
  state = initialState();
};

module.exports = {
  recordCommand,
  categoryForNamespace,
  getSnapshot,
  reset,
  KNOWN_CATEGORIES
};
