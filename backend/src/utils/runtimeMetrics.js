/**
 * @fileoverview Métricas runtime en memoria (HTTP + RFID + WebSocket + Redis)
 * para observabilidad. Se expone vía endpoint protegido /api/metrics.
 *
 * NOTA: Esto NO sustituye Prometheus/OpenTelemetry; es un MVP interno suficiente
 * para el TFG. Incluye telemetría de Upstash command budget (T-907 Fase D) y
 * cache en memoria complementaria al cache Redis (LRU TTL).
 *
 * @module utils/runtimeMetrics
 */

const redisCommandTracker = require('./redisCommandTracker');
const inMemoryCache = require('./inMemoryCache');

const DEFAULT_EWMA_ALPHA = 0.2;

const state = {
  startedAt: Date.now(),
  http: {
    totalRequests: 0,
    totalResponses: 0,
    totalErrors: 0,
    totalServerErrors: 0,
    totalDurationMs: 0,
    avgLatencyMs: 0,
    ewmaLatencyMs: null,
    lastRequestAt: null
  },
  rfid: {
    totalEventsProcessed: 0,
    byEvent: {},
    lastEventAt: null
  },
  websocket: {
    totalEvents: 0,
    rateLimited: 0,
    blocked: 0,
    payloadRejected: 0,
    deduped: 0,
    authCacheHits: 0,
    authCacheMisses: 0,
    // T-907 D: caches en memoria de Socket.IO (authRevalidationCache y
    // playOwnershipCache en socketHandlers.js). Antes solo veíamos el
    // hit/miss del cache `auth:user` global (Redis); ahora también
    // observamos las dos capas en memoria del proceso para detectar
    // contención o ráfagas de revalidación.
    authRevalidationCacheHits: 0,
    authRevalidationCacheMisses: 0,
    playOwnershipCacheHits: 0,
    playOwnershipCacheMisses: 0,
    // C1 (pre-v1.0.0): `executeWithRfidLock` cubre operación con
    // `Promise.race(timeout)`. Si la operación supera el umbral, contamos
    // el incidente, liberamos el lock y emitimos `rfid_mode_error` al
    // cliente. Espiga aquí → query Mongo lenta o Redis bloqueado.
    rfidLockTimeouts: 0,
    byEvent: {},
    lastEventAt: null
  },
  redis: {
    // Número de veces que un rate limiter ha caído a MemoryStore por ausencia de Redis.
    // En multi-instancia esto fragmenta el límite global, es una señal de alerta.
    rateLimitStoreFallbackCount: 0,
    // Hits/misses del cache de slim-user usado por el middleware de autenticación.
    authUserCacheHits: 0,
    authUserCacheMisses: 0,
    // B.1 (pre-v1.0.0): telemetría hit/miss del cache Redis layer
    // (`cache:analytics`, `cache:mechanic`, `cache:context`, etc.). Sin esto
    // es imposible diagnosticar si bajar TTLs gana o pierde eficacia, ni si
    // el jitter (B.2) introduce regresiones de hit rate. La estructura es
    // namespace → { hits, misses } y se expone con hitRate calculado en el
    // snapshot.
    cacheLayers: {}
  },
  // B.6 (pre-v1.0.0): visibility del modo activo del rate limiter Socket.IO.
  // Sin esto no podemos saber a primera vista si en Koyeb prod estamos
  // usando el path Redis ZSET distribuido o el fallback memory-local. El
  // limiter actualiza estos valores con `reportRateLimiterMode`.
  socketRateLimiter: {
    useRedis: null,
    fallbackCount: 0,
    redisSuccessCount: 0,
    lastReportedAt: null
  },
  // T-931 (pre-v1.0.0): contadores específicos para la materialización Redis
  // (leaderboards ZSET + studentMetrics Hash + reconciliación BullMQ
  // nocturna). Permiten verificar en QA F.3 que las escrituras dual van bien
  // y que la reconciliación detecta drift cuando lo introducimos
  // artificialmente.
  t931: {
    leaderboardWrites: 0,
    leaderboardReads: 0,
    leaderboardCacheHits: 0,
    leaderboardCacheMisses: 0,
    studentMetricsWrites: 0,
    studentMetricsReads: 0,
    studentMetricsCacheHits: 0,
    studentMetricsCacheMisses: 0,
    reconcileRuns: 0,
    reconcileDriftDetected: 0,
    reconcileDriftCorrected: 0,
    lastReconcileAt: null,
    gdprPurges: 0
  }
};

/**
 * Registra una request HTTP.
 * @param {Object} data
 * @param {number} data.durationMs
 * @param {number} data.statusCode
 */
function recordHttpRequest({ durationMs, statusCode }) {
  state.http.totalRequests += 1;
  state.http.totalResponses += 1;
  state.http.totalDurationMs += durationMs;
  state.http.lastRequestAt = Date.now();

  if (statusCode >= 400) {
    state.http.totalErrors += 1;
  }
  if (statusCode >= 500) {
    state.http.totalServerErrors += 1;
  }

  state.http.avgLatencyMs = state.http.totalDurationMs / state.http.totalResponses;

  // EWMA para suavizar picos (útil para dashboards)
  if (state.http.ewmaLatencyMs === null) {
    state.http.ewmaLatencyMs = durationMs;
  } else {
    state.http.ewmaLatencyMs =
      DEFAULT_EWMA_ALPHA * durationMs + (1 - DEFAULT_EWMA_ALPHA) * state.http.ewmaLatencyMs;
  }
}

/**
 * Registra un evento RFID que el servidor ha procesado (recibido desde rfidService).
 * @param {Object} event
 * @param {string} [event.event]
 */
function recordRfidEvent(event) {
  state.rfid.totalEventsProcessed += 1;
  state.rfid.lastEventAt = Date.now();

  const eventType = event?.event || 'unknown';
  state.rfid.byEvent[eventType] = (state.rfid.byEvent[eventType] || 0) + 1;
}

/**
 * Registra un evento WebSocket procesado.
 * @param {Object} data
 * @param {string} data.eventName
 * @param {'allowed'|'rate_limited'|'blocked'|'payload_rejected'|'deduped'} data.outcome
 */
function recordWebsocketEvent({ eventName, outcome }) {
  state.websocket.totalEvents += 1;
  state.websocket.lastEventAt = Date.now();

  state.websocket.byEvent[eventName] = (state.websocket.byEvent[eventName] || 0) + 1;

  if (outcome === 'rate_limited') {
    state.websocket.rateLimited += 1;
  } else if (outcome === 'blocked') {
    state.websocket.blocked += 1;
  } else if (outcome === 'payload_rejected') {
    state.websocket.payloadRejected += 1;
  } else if (outcome === 'deduped') {
    state.websocket.deduped += 1;
  }
}

/**
 * Registra uso de caché de revalidación auth en WebSocket.
 * @param {'hit'|'miss'} outcome
 */
function recordSocketAuthCache(outcome) {
  if (outcome === 'hit') {
    state.websocket.authCacheHits += 1;
    return;
  }

  if (outcome === 'miss') {
    state.websocket.authCacheMisses += 1;
  }
}

/**
 * Registra acceso al cache de revalidación de auth de Socket.IO (TTL 30s en
 * memoria local del proceso, no Redis). T-907 D.
 * @param {'hit'|'miss'} outcome
 */
function recordSocketRevalidationCache(outcome) {
  if (outcome === 'hit') {
    state.websocket.authRevalidationCacheHits += 1;
    return;
  }
  if (outcome === 'miss') {
    state.websocket.authRevalidationCacheMisses += 1;
  }
}

/**
 * Registra acceso al cache de ownership de partida de Socket.IO (TTL 5s en
 * memoria local del proceso). T-907 D.
 * @param {'hit'|'miss'} outcome
 */
function recordPlayOwnershipCache(outcome) {
  if (outcome === 'hit') {
    state.websocket.playOwnershipCacheHits += 1;
    return;
  }
  if (outcome === 'miss') {
    state.websocket.playOwnershipCacheMisses += 1;
  }
}

/**
 * Incrementa el contador de timeouts del lock RFID (C1 pre-v1.0.0).
 * Espiga aquí indica que `executeWithRfidLock` tuvo que matar una operación
 * que excedió `RFID_OPERATION_TIMEOUT_MS`. Investigar logs para correlacionar
 * con queries lentas, Redis bloqueado o deadlocks.
 */
function recordRfidLockTimeout() {
  state.websocket.rfidLockTimeouts += 1;
}

/**
 * Incrementa el contador de fallback a MemoryStore del rate limiter HTTP.
 * @param {string} [prefix] - Nombre del limiter que hizo fallback (para logging)
 */
function recordRateLimitStoreFallback() {
  state.redis.rateLimitStoreFallbackCount += 1;
}

/**
 * Registra uso del cache de slim-user del middleware de autenticación.
 * @param {'hit'|'miss'} outcome
 */
function recordAuthUserCache(outcome) {
  if (outcome === 'hit') {
    state.redis.authUserCacheHits += 1;
    return;
  }
  if (outcome === 'miss') {
    state.redis.authUserCacheMisses += 1;
  }
}

/**
 * B.1 (pre-v1.0.0): registra hit o miss para una capa de cache Redis
 * concreta (`cache:analytics`, `cache:mechanic`, `cache:context`...). La
 * estructura se crea perezosamente la primera vez que se reporta un
 * namespace, así que añadir un nuevo cache no requiere tocar este módulo.
 *
 * @param {string} namespace - Identificador del namespace de Redis.
 * @param {'hit'|'miss'} outcome
 */
function recordCacheLayerOutcome(namespace, outcome) {
  if (!namespace || (outcome !== 'hit' && outcome !== 'miss')) {
    return;
  }
  const layer = state.redis.cacheLayers[namespace] || { hits: 0, misses: 0 };
  if (outcome === 'hit') {
    layer.hits += 1;
  } else {
    layer.misses += 1;
  }
  state.redis.cacheLayers[namespace] = layer;
}

/**
 * B.6 (pre-v1.0.0): reporta el modo activo del rate limiter Socket.IO.
 * Se invoca desde el limiter cada vez que evalúa una decisión (Redis o
 * memoria local). Permite verificar en `/api/metrics` que en Koyeb prod
 * estamos en el path distribuido y detectar regresiones (ej. EVALSHA
 * NOSCRIPT que fuerza fallback continuado).
 *
 * @param {Object} info
 * @param {boolean} info.useRedis - true si la decisión usó Redis.
 * @param {boolean} [info.fallback=false] - true si fue fallback por error.
 */
function reportRateLimiterMode({ useRedis, fallback = false }) {
  state.socketRateLimiter.useRedis = Boolean(useRedis);
  state.socketRateLimiter.lastReportedAt = Date.now();
  if (fallback) {
    state.socketRateLimiter.fallbackCount += 1;
  } else if (useRedis) {
    state.socketRateLimiter.redisSuccessCount += 1;
  }
}

/**
 * T-931 (pre-v1.0.0): registra una escritura en la materialización Redis
 * (ZSET leaderboards o Hash studentMetrics). Se invoca por cada
 * `endPlay` que actualiza los agregados, dentro del pipeline.
 *
 * @param {'leaderboard'|'studentMetrics'} kind
 */
function recordT931Write(kind) {
  if (kind === 'leaderboard') {
    state.t931.leaderboardWrites += 1;
  } else if (kind === 'studentMetrics') {
    state.t931.studentMetricsWrites += 1;
  }
}

/**
 * T-931 (pre-v1.0.0): registra una lectura sobre la materialización
 * Redis con su outcome (hit / miss / fallback Mongo). Se invoca desde
 * `analyticsService.getTopContextsAndMechanics` y la lectura masiva de
 * studentMetrics.
 *
 * @param {'leaderboard'|'studentMetrics'} kind
 * @param {'hit'|'miss'} outcome
 */
function recordT931Read(kind, outcome) {
  if (kind === 'leaderboard') {
    state.t931.leaderboardReads += 1;
    if (outcome === 'hit') {
      state.t931.leaderboardCacheHits += 1;
    } else if (outcome === 'miss') {
      state.t931.leaderboardCacheMisses += 1;
    }
  } else if (kind === 'studentMetrics') {
    state.t931.studentMetricsReads += 1;
    if (outcome === 'hit') {
      state.t931.studentMetricsCacheHits += 1;
    } else if (outcome === 'miss') {
      state.t931.studentMetricsCacheMisses += 1;
    }
  }
}

/**
 * T-931 (pre-v1.0.0): registra una ejecución del job nocturno de
 * reconciliación con cuántas entradas mostraron drift > 5% y cuántas
 * fueron corregidas.
 *
 * @param {Object} info
 * @param {number} info.driftDetected
 * @param {number} info.driftCorrected
 */
function recordT931Reconcile({ driftDetected = 0, driftCorrected = 0 } = {}) {
  state.t931.reconcileRuns += 1;
  state.t931.reconcileDriftDetected += driftDetected;
  state.t931.reconcileDriftCorrected += driftCorrected;
  state.t931.lastReconcileAt = Date.now();
}

/**
 * T-931 (pre-v1.0.0): registra una purga GDPR Art. 17 cross-layer
 * (Hash studentMetrics + entradas en leaderboards) tras borrar alumno.
 */
function recordT931GdprPurge() {
  state.t931.gdprPurges += 1;
}

/**
 * Snapshot de métricas runtime.
 * Enriquecido en T-907 D con la telemetría de comandos Upstash y el cache LRU
 * en memoria. Se calcula al vuelo para reflejar el estado actual del tracker.
 *
 * @returns {Object}
 */
function getSnapshot() {
  const commandsSnapshot = redisCommandTracker.getSnapshot();
  const inMemoryStats = inMemoryCache.getAllStats();

  return {
    startedAt: new Date(state.startedAt).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - state.startedAt) / 1000),
    http: {
      ...state.http,
      avgLatencyMs: Math.round(state.http.avgLatencyMs * 100) / 100,
      ewmaLatencyMs:
        state.http.ewmaLatencyMs === null ? null : Math.round(state.http.ewmaLatencyMs * 100) / 100
    },
    rfid: {
      ...state.rfid
    },
    websocket: {
      ...state.websocket
    },
    redis: {
      ...state.redis,
      // Telemetría de comandos Upstash (T-907 D): granularidad por categoría
      // funcional + estimación lineal de consumo diario, útil para detectar
      // proximidad al techo del free tier (10K/día) antes de tocarlo.
      commandsTotal: commandsSnapshot.total,
      commandsByCategory: commandsSnapshot.byCategory,
      commandsEstimatedDaily: commandsSnapshot.estimatedDaily,
      // Cache LRU en memoria complementario al cache Redis. Hit ratio alto
      // indica que la app evita comandos Redis adicionales para keys
      // calientes (auth:user, cache:mechanic, cache:context).
      inMemoryCache: inMemoryStats,
      // B.1: hit/miss del cache Redis layer con hitRate calculado por
      // namespace. Útil para diagnosticar si bajar TTLs gana o pierde
      // eficacia y para validar que el jitter (B.2) no introduce regresiones.
      cacheLayers: Object.fromEntries(
        Object.entries(state.redis.cacheLayers).map(([namespace, counts]) => {
          const total = counts.hits + counts.misses;
          const hitRate = total === 0 ? 0 : Math.round((counts.hits / total) * 1000) / 10;
          return [namespace, { ...counts, hitRatePercent: hitRate }];
        })
      )
    },
    socketRateLimiter: { ...state.socketRateLimiter },
    t931: {
      ...state.t931,
      leaderboardHitRatePercent:
        state.t931.leaderboardReads === 0
          ? 0
          : Math.round((state.t931.leaderboardCacheHits / state.t931.leaderboardReads) * 1000) / 10,
      studentMetricsHitRatePercent:
        state.t931.studentMetricsReads === 0
          ? 0
          : Math.round(
              (state.t931.studentMetricsCacheHits / state.t931.studentMetricsReads) * 1000
            ) / 10
    }
  };
}

/**
 * Resetea métricas (útil para tests).
 */
function reset() {
  state.startedAt = Date.now();
  state.http.totalRequests = 0;
  state.http.totalResponses = 0;
  state.http.totalErrors = 0;
  state.http.totalServerErrors = 0;
  state.http.totalDurationMs = 0;
  state.http.avgLatencyMs = 0;
  state.http.ewmaLatencyMs = null;
  state.http.lastRequestAt = null;

  state.rfid.totalEventsProcessed = 0;
  state.rfid.byEvent = {};
  state.rfid.lastEventAt = null;

  state.websocket.totalEvents = 0;
  state.websocket.rateLimited = 0;
  state.websocket.blocked = 0;
  state.websocket.payloadRejected = 0;
  state.websocket.deduped = 0;
  state.websocket.authCacheHits = 0;
  state.websocket.authCacheMisses = 0;
  state.websocket.authRevalidationCacheHits = 0;
  state.websocket.authRevalidationCacheMisses = 0;
  state.websocket.playOwnershipCacheHits = 0;
  state.websocket.playOwnershipCacheMisses = 0;
  state.websocket.rfidLockTimeouts = 0;
  state.websocket.byEvent = {};
  state.websocket.lastEventAt = null;

  state.redis.rateLimitStoreFallbackCount = 0;
  state.redis.authUserCacheHits = 0;
  state.redis.authUserCacheMisses = 0;
  state.redis.cacheLayers = {};

  state.socketRateLimiter.useRedis = null;
  state.socketRateLimiter.fallbackCount = 0;
  state.socketRateLimiter.redisSuccessCount = 0;
  state.socketRateLimiter.lastReportedAt = null;

  state.t931.leaderboardWrites = 0;
  state.t931.leaderboardReads = 0;
  state.t931.leaderboardCacheHits = 0;
  state.t931.leaderboardCacheMisses = 0;
  state.t931.studentMetricsWrites = 0;
  state.t931.studentMetricsReads = 0;
  state.t931.studentMetricsCacheHits = 0;
  state.t931.studentMetricsCacheMisses = 0;
  state.t931.reconcileRuns = 0;
  state.t931.reconcileDriftDetected = 0;
  state.t931.reconcileDriftCorrected = 0;
  state.t931.lastReconcileAt = null;
  state.t931.gdprPurges = 0;

  // Reset también la telemetría agregada (T-907 D).
  redisCommandTracker.reset();
  // Tests que verifican el cache deben empezar siempre limpio. Vaciamos
  // contenido + contadores de las tres instancias LRU para que un test no
  // herede entradas de otro previo (especialmente importante porque las
  // instancias son singletons que viven entre tests dentro del mismo file).
  inMemoryCache.authUserCache.clear();
  inMemoryCache.authUserCache.resetStats();
  inMemoryCache.mechanicCache.clear();
  inMemoryCache.mechanicCache.resetStats();
  inMemoryCache.contextCache.clear();
  inMemoryCache.contextCache.resetStats();
}

module.exports = {
  recordHttpRequest,
  recordRfidEvent,
  recordWebsocketEvent,
  recordSocketAuthCache,
  recordSocketRevalidationCache,
  recordPlayOwnershipCache,
  recordRfidLockTimeout,
  recordRateLimitStoreFallback,
  recordAuthUserCache,
  recordCacheLayerOutcome,
  reportRateLimiterMode,
  recordT931Write,
  recordT931Read,
  recordT931Reconcile,
  recordT931GdprPurge,
  getSnapshot,
  reset
};
