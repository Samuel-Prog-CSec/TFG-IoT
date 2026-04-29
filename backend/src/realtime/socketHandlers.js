/**
 * @fileoverview Registro de handlers Socket.IO y eventos RFID.
 * Centraliza autenticacion, control de modos RFID y enrutado por rooms.
 *
 * @module realtime/socketHandlers
 */

const gamePlayRepository = require('../repositories/gamePlayRepository');
const { verifyAccessToken, fetchUserForAuth } = require('../middlewares/auth');
const { corsWhitelist } = require('../config/security');
const runtimeMetrics = require('../utils/runtimeMetrics');
const { logSecurityEvent, getSocketContext } = require('../utils/securityLogger');
const { rfidClientEventSchema } = require('../validators/rfidValidator');
const { objectIdSchema } = require('../validators/commonValidator');
const { getRfidState } = require('../states/rfid');
const { getSocketCommand, getCommandNames } = require('../commands/socket');
const { findDangerousPayloadPath } = require('../utils/payloadSecurity');
const { socketConnectionLimits } = require('../config/socketRateLimits');
const { getRedis } = require('../config/redis');
const Sentry = require('@sentry/node');
const logger = require('../utils/logger').child({ component: 'socketHandlers' });
const { authEventBus } = require('../utils/authEvents');

const REDIS_RFID_MODE_PREFIX = 'rfid:mode:';
const REDIS_SENSOR_PREFIX = 'rfid:sensor:';
const REDIS_RFID_MODE_TTL = 3600; // 1 hora

// ADR-077 (PROP-64): canal pub/sub para que múltiples instancias del backend
// se enteren de cambios de estado RFID al instante. Sin pub/sub, una instancia
// que cachee localmente el estado podría servir un valor obsoleto hasta el
// siguiente miss. Con esto, el cambio se propaga en milisegundos.
const RFID_MODE_PUBSUB_CHANNEL = 'rfid-mode-changes';

const RFID_MODES = Object.freeze({
  IDLE: 'idle',
  GAMEPLAY: 'gameplay',
  CARD_ASSIGNMENT: 'card_assignment'
});

const AUTH_REVALIDATION_CACHE_TTL_MS =
  Number.parseInt(process.env.AUTH_REVALIDATION_CACHE_TTL_MS, 10) || 30000;
const PLAY_OWNERSHIP_CACHE_TTL_MS =
  Number.parseInt(process.env.PLAY_OWNERSHIP_CACHE_TTL_MS, 10) || 5000;
const CACHE_SWEEP_THRESHOLD = Number.parseInt(process.env.SOCKET_CACHE_SWEEP_THRESHOLD, 10) || 2000;

const rfidModeByUserId = new Map();
const sensorIdToUserId = new Map();
const authRevalidationCache = new Map();
const playOwnershipCache = new Map();
const connectionCountByUserId = new Map();
/** Mutex por userId para serializar operaciones RFID mode (evita race conditions). */
const rfidModeLocks = new Map();

/**
 * Devuelve el número de conexiones Socket.IO activas para un usuario.
 * @param {string} userId
 * @returns {number}
 */
const getConnectionCount = userId => connectionCountByUserId.get(userId) || 0;

/**
 * Incrementa el contador de conexiones del usuario.
 * @param {string} userId
 * @returns {number} Nuevo valor del contador.
 */
const incrementConnectionCount = userId => {
  if (!userId) {
    return 0;
  }
  const next = (connectionCountByUserId.get(userId) || 0) + 1;
  connectionCountByUserId.set(userId, next);
  return next;
};

/**
 * Decrementa el contador de conexiones del usuario, eliminando la entrada
 * si llega a cero. No baja de cero ante llamadas espurias.
 *
 * @param {string} userId
 * @returns {number} Nuevo valor del contador.
 */
const decrementConnectionCount = userId => {
  if (!userId) {
    return 0;
  }
  const current = connectionCountByUserId.get(userId) || 0;
  if (current <= 1) {
    connectionCountByUserId.delete(userId);
    return 0;
  }
  const next = current - 1;
  connectionCountByUserId.set(userId, next);
  return next;
};

/**
 * Resetea por completo el contador de conexiones. Solo para tests.
 * @returns {void}
 */
const resetConnectionCountsForTests = () => {
  connectionCountByUserId.clear();
};
let socketServerRef = null;
/** Referencia al namespace /game para emitir eventos de gameplay (reservado para uso interno futuro). */
// eslint-disable-next-line no-unused-vars -- referencia almacenada para uso interno por funciones del módulo
let gameNspRef = null;

/**
 * Referencia al intervalo de limpieza periódica de caches.
 * @type {NodeJS.Timeout|null}
 */
let cacheCleanupIntervalRef = null;

/** Intervalo de limpieza periódica de caches (5 minutos). */
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Tiempo máximo que un modo RFID puede permanecer activo sin recibir señal
 * (scan o heartbeat) antes de que el watchdog lo libere automáticamente.
 *
 * Evita el caso "modo stuck" cuando un profesor cierra el navegador sin
 * disparar `leave_*` y otro socket suyo recibe `RFID_MODE_TAKEN_OVER` en
 * cadena durante 1h hasta que el TTL Redis expire.
 */
const RFID_MODE_IDLE_TIMEOUT_MS =
  Number.parseInt(process.env.RFID_MODE_IDLE_TIMEOUT_MS, 10) || 5 * 60 * 1000;

/**
 * Timers de watchdog por usuario. Se reprograman tras cada actividad RFID
 * (scan válido o heartbeat) y se cancelan al limpiar el modo.
 */
const rfidModeTimers = new Map();

/**
 * Ejecuta una operación RFID con exclusión mutua por userId.
 * Serializa operaciones concurrentes sobre el mismo usuario para evitar race conditions.
 *
 * @param {string} userId - ID del usuario
 * @param {Function} operation - Operación async a ejecutar
 * @returns {Promise<*>} Resultado de la operación
 */
const executeWithRfidLock = async (userId, operation) => {
  const prevLock = rfidModeLocks.get(userId) || Promise.resolve();
  let releaseLock;
  const lockPromise = new Promise(resolve => {
    releaseLock = resolve;
  });
  rfidModeLocks.set(userId, lockPromise);

  try {
    await prevLock;
    return await operation();
  } finally {
    releaseLock();
    // Limpiar lock si no hay operaciones pendientes posteriores
    if (rfidModeLocks.get(userId) === lockPromise) {
      rfidModeLocks.delete(userId);
    }
  }
};

const emitRfidModeChanged = (userId, payload) => {
  if (!socketServerRef || !userId) {
    return;
  }

  socketServerRef.to(`user_${userId}`).emit('rfid_mode_changed', payload);
};

/**
 * Cancela y elimina el timer de watchdog asociado a un usuario.
 * @param {string} userId
 */
const clearRfidModeTimer = userId => {
  if (!userId) {
    return;
  }
  const timer = rfidModeTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    rfidModeTimers.delete(userId);
  }
};

/**
 * Programa (o reprograma) un watchdog que liberará el modo RFID si no
 * llega ninguna señal de actividad en `RFID_MODE_IDLE_TIMEOUT_MS`.
 *
 * @param {string} userId
 * @param {string} socketId Socket dueño del modo en el momento de programar.
 */
const scheduleRfidModeWatchdog = (userId, socketId) => {
  if (!userId) {
    return;
  }
  clearRfidModeTimer(userId);
  const timer = setTimeout(() => {
    rfidModeTimers.delete(userId);
    const state = rfidModeByUserId.get(userId);
    // Si el dueño cambió o el modo ya se limpió, no actuar.
    if (!state || state.socketId !== socketId) {
      return;
    }
    logger.warn('Modo RFID auto-limpiado por inactividad', {
      userId,
      mode: state.mode,
      socketId,
      idleMs: RFID_MODE_IDLE_TIMEOUT_MS
    });
    clearRfidModeState(userId, socketId);
  }, RFID_MODE_IDLE_TIMEOUT_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  rfidModeTimers.set(userId, timer);
};

/**
 * Refresca el `updatedAt` del modo RFID del usuario y reprograma el watchdog.
 * Debe llamarse ante cualquier actividad legítima (scan válido, heartbeat).
 *
 * @param {string} userId
 * @param {string} socketId Solo refresca si coincide con el dueño actual.
 */
const refreshRfidModeActivity = (userId, socketId) => {
  if (!userId) {
    return;
  }
  const state = rfidModeByUserId.get(userId);
  if (!state || state.socketId !== socketId) {
    return;
  }
  state.updatedAt = Date.now();
  scheduleRfidModeWatchdog(userId, socketId);
};

/**
 * Resetea por completo los timers de watchdog. Solo para tests.
 */
const resetRfidModeTimersForTests = () => {
  for (const timer of rfidModeTimers.values()) {
    clearTimeout(timer);
  }
  rfidModeTimers.clear();
  rfidModeByUserId.clear();
  sensorIdToUserId.clear();
};

const sweepExpiredEntries = cacheMap => {
  if (!cacheMap || cacheMap.size < CACHE_SWEEP_THRESHOLD) {
    return;
  }

  const now = Date.now();
  for (const [key, cached] of cacheMap.entries()) {
    if (!cached || cached.expiresAt <= now) {
      cacheMap.delete(key);
    }
  }
};

/**
 * Barre entradas expiradas de un cache sin importar su tamaño.
 * Utilizado por el intervalo periódico de limpieza.
 *
 * @param {Map} cacheMap - Cache a limpiar
 * @returns {number} Cantidad de entradas eliminadas
 */
const sweepAllExpiredEntries = cacheMap => {
  if (!cacheMap || cacheMap.size === 0) {
    return 0;
  }

  const now = Date.now();
  let removed = 0;
  for (const [key, cached] of cacheMap.entries()) {
    if (!cached || cached.expiresAt <= now) {
      cacheMap.delete(key);
      removed++;
    }
  }
  return removed;
};

const getAuthCacheEntry = accessToken => {
  if (!accessToken) {
    return null;
  }

  const cached = authRevalidationCache.get(accessToken);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    authRevalidationCache.delete(accessToken);
    return null;
  }

  return cached;
};

const setAuthCacheEntry = (accessToken, value) => {
  if (!accessToken) {
    return;
  }

  sweepExpiredEntries(authRevalidationCache);

  // Hard cap: si tras el sweep el cache sigue al límite, forzar limpieza completa
  if (authRevalidationCache.size >= CACHE_SWEEP_THRESHOLD) {
    sweepAllExpiredEntries(authRevalidationCache);
    if (authRevalidationCache.size >= CACHE_SWEEP_THRESHOLD) {
      logger.warn('Auth revalidation cache al límite tras sweep completo, descartando entrada', {
        cacheSize: authRevalidationCache.size
      });
      return;
    }
  }

  authRevalidationCache.set(accessToken, {
    ...value,
    expiresAt: Date.now() + AUTH_REVALIDATION_CACHE_TTL_MS
  });
};

const buildOwnershipCacheKey = ({ userId, userRole, playId, includeSessionRuntime }) =>
  `${userRole || 'unknown'}:${userId || 'unknown'}:${playId}:${includeSessionRuntime ? 'full' : 'light'}`;

const getOwnershipCacheEntry = cacheKey => {
  const cached = playOwnershipCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    playOwnershipCache.delete(cacheKey);
    return null;
  }

  return cached.value;
};

const setOwnershipCacheEntry = (cacheKey, value) => {
  sweepExpiredEntries(playOwnershipCache);

  // Hard cap: si tras el sweep el cache sigue al límite, forzar limpieza completa
  if (playOwnershipCache.size >= CACHE_SWEEP_THRESHOLD) {
    sweepAllExpiredEntries(playOwnershipCache);
    if (playOwnershipCache.size >= CACHE_SWEEP_THRESHOLD) {
      logger.warn('Play ownership cache al límite tras sweep completo, descartando entrada', {
        cacheSize: playOwnershipCache.size
      });
      return;
    }
  }

  playOwnershipCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + PLAY_OWNERSHIP_CACHE_TTL_MS
  });
};

const getSocketOwnershipCacheEntry = (socket, cacheKey) => {
  const socketCache = socket?.data?.playOwnershipCache;
  if (!socketCache || socketCache.cacheKey !== cacheKey) {
    return null;
  }

  if (socketCache.expiresAt <= Date.now()) {
    socket.data.playOwnershipCache = null;
    return null;
  }

  return socketCache.value;
};

const setSocketOwnershipCacheEntry = (socket, cacheKey, value) => {
  if (!socket?.data) {
    return;
  }

  socket.data.playOwnershipCache = {
    cacheKey,
    value,
    expiresAt: Date.now() + PLAY_OWNERSHIP_CACHE_TTL_MS
  };
};

const RFID_IDLE_STATE = Object.freeze({ mode: RFID_MODES.IDLE, sensorId: null, socketId: null });

const getRfidModeState = async userId => {
  if (!userId) {
    return RFID_IDLE_STATE;
  }

  const cached = rfidModeByUserId.get(userId);
  if (cached) {
    return cached;
  }

  // Fallback: tras reinicio del servidor, recuperar de Redis
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(`${REDIS_RFID_MODE_PREFIX}${userId}`);
      if (raw) {
        const restored = JSON.parse(raw);
        rfidModeByUserId.set(userId, restored);
        if (restored.sensorId) {
          sensorIdToUserId.set(restored.sensorId, userId);
        }
        return restored;
      }
    } catch {
      // Silencioso: Redis no disponible, usar default
    }
  }

  return RFID_IDLE_STATE;
};

const getAssignmentRoom = userId => `card_assignment_${userId}`;
const getPlayRoom = playId => `play_${playId}`;

const getUserIdBySensorId = sensorId => {
  if (!sensorId) {
    return null;
  }

  return sensorIdToUserId.get(sensorId) || null;
};

/**
 * Persiste estado RFID en Redis (fire-and-forget) y publica el cambio en el
 * canal pub/sub para que otras instancias del backend invaliden su cache local.
 *
 * @param {string} userId
 * @param {Object|null} state - null para borrar
 */
const persistRfidModeToRedis = (userId, state) => {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  if (!state) {
    redis
      .del(`${REDIS_RFID_MODE_PREFIX}${userId}`)
      .catch(err =>
        logger.warn('Error al borrar estado RFID en Redis', { userId, error: err.message })
      );
    publishRfidModeChange(userId, null);
    return;
  }

  redis
    .setex(`${REDIS_RFID_MODE_PREFIX}${userId}`, REDIS_RFID_MODE_TTL, JSON.stringify(state))
    .catch(err =>
      logger.warn('Error al persistir estado RFID en Redis', { userId, error: err.message })
    );
  publishRfidModeChange(userId, state);
};

/**
 * Publica un cambio de modo RFID en el canal pub/sub. El instance ID se
 * envía como `from` para que el suscriptor pueda ignorar mensajes propios
 * (la instancia que escribe ya tiene el estado correcto en su cache).
 *
 * @param {string} userId
 * @param {Object|null} state
 */
const publishRfidModeChange = (userId, state) => {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  const message = JSON.stringify({
    userId,
    state,
    from: process.env.HOSTNAME || 'unknown',
    at: Date.now()
  });

  redis
    .publish(RFID_MODE_PUBSUB_CHANNEL, message)
    .catch(err =>
      logger.warn('Error al publicar cambio RFID mode', { userId, error: err.message })
    );
};

/**
 * Aplica un cambio recibido por pub/sub al cache local. Esta función no
 * persiste en Redis (es la respuesta a un mensaje, no un cambio nuevo).
 *
 * @param {string} userId
 * @param {Object|null} state
 */
const applyRemoteRfidModeChange = (userId, state) => {
  if (!userId) {
    return;
  }

  const previous = rfidModeByUserId.get(userId);

  if (!state || state.mode === RFID_MODES.IDLE) {
    rfidModeByUserId.delete(userId);
    if (previous?.sensorId) {
      sensorIdToUserId.delete(previous.sensorId);
    }
    return;
  }

  rfidModeByUserId.set(userId, state);
  if (state.sensorId) {
    sensorIdToUserId.set(state.sensorId, userId);
  }
};

const persistSensorBindingToRedis = (sensorId, userId) => {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  if (!userId) {
    redis
      .del(`${REDIS_SENSOR_PREFIX}${sensorId}`)
      .catch(err =>
        logger.warn('Error al borrar sensor binding en Redis', { sensorId, error: err.message })
      );
    return;
  }

  redis.setex(`${REDIS_SENSOR_PREFIX}${sensorId}`, REDIS_RFID_MODE_TTL, userId).catch(err =>
    logger.warn('Error al persistir sensor binding en Redis', {
      sensorId,
      userId,
      error: err.message
    })
  );
};

const setRfidModeState = (userId, mode, socketId, metadata = {}) => {
  if (!userId) {
    return;
  }

  const current = rfidModeByUserId.get(userId);
  const modeChangedAt = Date.now();

  if (current?.socketId && current.socketId !== socketId) {
    socketServerRef?.to(current.socketId).emit('error', {
      code: 'RFID_MODE_TAKEN_OVER',
      message: 'Otro cliente tomó el control del modo RFID para este usuario'
    });
  }

  if (current?.sensorId) {
    sensorIdToUserId.delete(current.sensorId);
    persistSensorBindingToRedis(current.sensorId, null);
  }

  if (mode === RFID_MODES.IDLE) {
    rfidModeByUserId.delete(userId);
    persistRfidModeToRedis(userId, null);
    clearRfidModeTimer(userId);
    emitRfidModeChanged(userId, {
      mode: RFID_MODES.IDLE,
      sensorId: null,
      metadata: {},
      socketId: null,
      updatedAt: modeChangedAt
    });
    return;
  }

  const newState = {
    mode,
    socketId,
    sensorId: null,
    metadata,
    updatedAt: modeChangedAt
  };

  rfidModeByUserId.set(userId, newState);
  persistRfidModeToRedis(userId, newState);
  scheduleRfidModeWatchdog(userId, socketId);

  emitRfidModeChanged(userId, {
    mode,
    sensorId: null,
    metadata,
    socketId,
    updatedAt: modeChangedAt
  });
};

const setRfidSensorBinding = (userId, sensorId, socketId) => {
  if (!userId || !sensorId) {
    return;
  }

  const current = rfidModeByUserId.get(userId);
  if (current?.sensorId && current.sensorId !== sensorId) {
    sensorIdToUserId.delete(current.sensorId);
    persistSensorBindingToRedis(current.sensorId, null);
  }

  sensorIdToUserId.set(sensorId, userId);
  persistSensorBindingToRedis(sensorId, userId);
  const nextUpdatedAt = Date.now();
  const nextState = {
    ...current,
    sensorId,
    socketId,
    updatedAt: nextUpdatedAt
  };
  rfidModeByUserId.set(userId, nextState);
  persistRfidModeToRedis(userId, nextState);
  scheduleRfidModeWatchdog(userId, socketId);

  emitRfidModeChanged(userId, {
    mode: nextState.mode,
    sensorId: nextState.sensorId,
    metadata: nextState.metadata || {},
    socketId: nextState.socketId || null,
    updatedAt: nextUpdatedAt
  });
};

const clearRfidModeState = (userId, socketId) => {
  if (!userId) {
    return;
  }

  const current = rfidModeByUserId.get(userId);
  if (!current) {
    return;
  }

  if (socketId && current.socketId !== socketId) {
    return;
  }

  if (current?.sensorId) {
    sensorIdToUserId.delete(current.sensorId);
    persistSensorBindingToRedis(current.sensorId, null);
  }

  rfidModeByUserId.delete(userId);
  persistRfidModeToRedis(userId, null);
  clearRfidModeTimer(userId);
  emitRfidModeChanged(userId, {
    mode: RFID_MODES.IDLE,
    sensorId: null,
    metadata: {},
    socketId: null,
    updatedAt: Date.now()
  });
};

const buildSocketSecurityMeta = socket => ({
  ...getSocketContext(socket),
  userId: socket?.data?.userId,
  userRole: socket?.data?.userRole
});

const logSocketSecurityEvent = (eventCode, socket, meta = {}) => {
  logSecurityEvent(eventCode, {
    ...buildSocketSecurityMeta(socket),
    ...meta
  });
};

const validateSocketOrigin = socket => {
  const origin = socket.handshake?.headers?.origin;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!origin) {
    if (isProduction) {
      return {
        valid: false,
        reason: 'ORIGIN_REQUIRED'
      };
    }

    return { valid: true };
  }

  if (corsWhitelist.includes(origin)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: 'ORIGIN_NOT_ALLOWED',
    origin
  };
};

const rejectDangerousSocketPayload = (socket, eventName, payloadPath) => {
  socket.emit('error', {
    code: 'VALIDATION_ERROR',
    message: 'Payload no permitido por política de seguridad'
  });
  logSocketSecurityEvent('SECURITY_PAYLOAD_BLOCKED', socket, {
    eventName,
    source: 'socket',
    path: payloadPath
  });
};

const validatePlayId = (socket, playId, eventName) => {
  const parsed = objectIdSchema.safeParse(playId);
  if (parsed.success) {
    return true;
  }

  socket.emit('error', {
    code: 'VALIDATION_ERROR',
    message: 'playId invalido'
  });
  logSocketSecurityEvent('SECURITY_SOCKET_EVENT_INVALID', socket, {
    eventName,
    reason: 'PLAY_ID_INVALID',
    details: parsed.error.issues
  });
  return false;
};

const requireSocketRole = (socket, allowedRoles, eventName) => {
  if (!socket?.data?.userId) {
    socket.emit('error', { code: 'AUTH_REQUIRED', message: 'Autenticacion requerida' });
    logSocketSecurityEvent('AUTHZ_ACCESS_DENIED', socket, {
      eventName,
      reason: 'AUTH_REQUIRED'
    });
    return false;
  }

  if (!allowedRoles.includes(socket.data.userRole)) {
    socket.emit('error', { code: 'FORBIDDEN', message: 'No autorizado para este evento' });
    logSocketSecurityEvent('AUTHZ_ACCESS_DENIED', socket, {
      eventName,
      allowedRoles,
      reason: 'ROLE_NOT_ALLOWED'
    });
    return false;
  }

  return true;
};

const revalidateSocketAuth = async (socket, eventName) => {
  const accessToken = socket.data.accessToken;
  if (!accessToken) {
    socket.emit('error', { code: 'AUTH_REQUIRED', message: 'Autenticacion requerida' });
    logSocketSecurityEvent('AUTHZ_ACCESS_DENIED', socket, {
      eventName,
      reason: 'TOKEN_MISSING'
    });
    return false;
  }

  try {
    const cached = getAuthCacheEntry(accessToken);
    if (cached) {
      runtimeMetrics.recordSocketAuthCache('hit');
      socket.data.userId = cached.userId;
      socket.data.userRole = cached.userRole;
      socket.data.tokenExp = cached.tokenExp;
      return true;
    }

    runtimeMetrics.recordSocketAuthCache('miss');

    const decoded = await verifyAccessToken(accessToken, {
      headers: socket.handshake.headers
    });
    // Usar cache-aside Redis (slim-user, TTL 60s) en vez de hit directo a Mongo
    // por cada revalidación WebSocket. El cache local authRevalidationCache
    // sigue actuando como primer nivel (TTL 30s, per-process).
    const user = await fetchUserForAuth(decoded.id, 'role status accountStatus +currentSessionId');

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    if (user.status !== 'active') {
      throw new Error('Usuario inactivo');
    }

    if (
      ['teacher', 'super_admin'].includes(user.role) &&
      user.accountStatus &&
      user.accountStatus !== 'approved'
    ) {
      throw new Error('Cuenta no aprobada');
    }

    if (decoded.sid && user.currentSessionId && decoded.sid !== user.currentSessionId) {
      throw new Error('Sesion invalida');
    }

    socket.data.userId = user._id.toString();
    socket.data.userRole = user.role;
    socket.data.tokenExp = decoded.exp;

    setAuthCacheEntry(accessToken, {
      userId: user._id.toString(),
      userRole: user.role,
      tokenExp: decoded.exp
    });

    return true;
  } catch (error) {
    socket.emit('error', { code: 'AUTH_INVALID', message: 'Autenticacion invalida' });
    logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
      eventName,
      reason: error.message
    });
    socket.disconnect(true);
    return false;
  }
};

const requirePlayOwnership = async (socket, playId, eventName, options = {}) => {
  const includeSessionRuntime = options.includeSessionRuntime === true;

  if (!socket?.data?.userId) {
    socket.emit('error', { code: 'AUTH_REQUIRED', message: 'Autenticacion requerida' });
    logSocketSecurityEvent('AUTHZ_ACCESS_DENIED', socket, {
      playId,
      eventName,
      reason: 'AUTH_REQUIRED'
    });
    return null;
  }

  const ownershipCacheKey = buildOwnershipCacheKey({
    userId: socket.data.userId,
    userRole: socket.data.userRole,
    playId,
    includeSessionRuntime
  });

  if (!includeSessionRuntime) {
    const socketCachedOwnership = getSocketOwnershipCacheEntry(socket, ownershipCacheKey);
    if (socketCachedOwnership) {
      return socketCachedOwnership;
    }

    const cachedOwnership = getOwnershipCacheEntry(ownershipCacheKey);
    if (cachedOwnership) {
      setSocketOwnershipCacheEntry(socket, ownershipCacheKey, cachedOwnership);
      return cachedOwnership;
    }
  }

  const play = includeSessionRuntime
    ? await gamePlayRepository.findById(playId, {
        populate: {
          path: 'sessionId',
          populate: { path: 'mechanicId', select: 'name rules' }
        }
      })
    : await gamePlayRepository.findById(playId, {
        select: '_id sessionId status',
        populate: {
          path: 'sessionId',
          select: '_id createdBy'
        }
      });

  if (!play) {
    socket.emit('error', { code: 'NOT_FOUND', message: 'Partida no encontrada' });
    logSocketSecurityEvent('AUTHZ_ACCESS_DENIED', socket, {
      playId,
      eventName,
      reason: 'PLAY_NOT_FOUND'
    });
    return null;
  }

  const session = play.sessionId;
  const isSuperAdmin = socket.data.userRole === 'super_admin';
  const ownsSession = session?.createdBy?.toString() === socket.data.userId;

  if (!isSuperAdmin && !ownsSession) {
    socket.emit('error', { code: 'FORBIDDEN', message: 'No tienes acceso a esta partida' });
    logSocketSecurityEvent('AUTHZ_ACCESS_DENIED', socket, {
      playId,
      eventName,
      sessionId: session?._id,
      reason: 'OWNERSHIP_INVALID'
    });
    return null;
  }

  const ownership = { play, session };
  if (!includeSessionRuntime) {
    setOwnershipCacheEntry(ownershipCacheKey, ownership);
    setSocketOwnershipCacheEntry(socket, ownershipCacheKey, ownership);
  }

  return ownership;
};

const isRfidClientSourceEnabled = socket => {
  if ((process.env.RFID_SOURCE || 'client').trim().toLowerCase() === 'client') {
    return true;
  }

  socket.emit('error', {
    code: 'RFID_DISABLED',
    message: 'RFID en modo cliente deshabilitado'
  });
  return false;
};

const parseRfidClientPayload = (socket, data) => {
  const parsed = rfidClientEventSchema.safeParse(data || {});
  if (parsed.success) {
    return parsed.data;
  }

  const firstError = parsed.error.issues?.[0];
  socket.emit('error', {
    code: 'VALIDATION_ERROR',
    message: firstError?.message || 'Payload RFID invalido'
  });
  logSocketSecurityEvent('SECURITY_RFID_EVENT_INVALID', socket, {
    eventName: 'rfid_scan_from_client',
    reason: 'ZOD_VALIDATION_ERROR',
    details: parsed.error.issues
  });
  return null;
};

const getRfidStateForSocket = async (socket, logger) => {
  const modeState = await getRfidModeState(socket.data.userId);
  const state = getRfidState(modeState.mode, logger);
  return { modeState, state };
};

const validateRfidStateForRead = (socket, modeState, state) => {
  if (modeState?.socketId && modeState.socketId !== socket.id) {
    socket.emit('error', {
      code: 'RFID_SOCKET_NOT_ACTIVE',
      message: 'Este socket no es el owner activo del modo RFID'
    });
    logSocketSecurityEvent('SECURITY_RFID_EVENT_INVALID', socket, {
      eventName: 'rfid_scan_from_client',
      reason: 'RFID_SOCKET_NOT_ACTIVE',
      mode: modeState.mode,
      activeSocketId: modeState.socketId
    });
    return false;
  }

  if (!state.allowsReads()) {
    socket.emit('error', {
      code: 'RFID_MODE_INVALID',
      message: state.getReadNotAllowedMessage()
    });
    logSocketSecurityEvent('SECURITY_RFID_EVENT_INVALID', socket, {
      eventName: 'rfid_scan_from_client',
      reason: 'RFID_MODE_INVALID',
      mode: modeState.mode
    });
    return false;
  }

  const rooms = {
    assignment: getAssignmentRoom(socket.data.userId),
    play: modeState.metadata?.playId ? getPlayRoom(modeState.metadata.playId) : null
  };

  if (!state.validateRoom({ socket, rooms, modeState })) {
    socket.emit('error', {
      code: 'RFID_MODE_INVALID',
      message: state.getRoomMismatchMessage()
    });
    logSocketSecurityEvent('SECURITY_RFID_EVENT_INVALID', socket, {
      eventName: 'rfid_scan_from_client',
      reason: state.getRoomMismatchReason(),
      mode: modeState.mode
    });
    return false;
  }

  return true;
};

const validateRfidSensorAuthorization = (socket, modeState, payload, gameEngine) => {
  if (modeState.mode !== RFID_MODES.GAMEPLAY || !modeState.metadata?.playId) {
    return true;
  }

  const playContext = gameEngine.getPlayRuntimeContext(modeState.metadata.playId);
  if (!playContext) {
    socket.emit('error', {
      code: 'PLAY_NOT_ACTIVE',
      message: 'La partida no está activa en el motor de juego'
    });
    logSocketSecurityEvent('SECURITY_RFID_EVENT_INVALID', socket, {
      eventName: 'rfid_scan_from_client',
      reason: 'PLAY_NOT_ACTIVE',
      playId: modeState.metadata.playId
    });
    return false;
  }

  const isSuperAdmin = socket.data.userRole === 'super_admin';
  const ownsPlay = playContext.ownerId && playContext.ownerId === socket.data.userId;
  if (!isSuperAdmin && !ownsPlay) {
    socket.emit('error', {
      code: 'FORBIDDEN',
      message: 'No tienes acceso a esta partida'
    });
    logSocketSecurityEvent('AUTHZ_ACCESS_DENIED', socket, {
      eventName: 'rfid_scan_from_client',
      reason: 'OWNERSHIP_INVALID',
      playId: playContext.playId,
      sessionId: playContext.sessionId
    });
    return false;
  }

  const sessionSensorId = playContext.sensorId;

  // Los sensores touch_fallback (modo táctil del navegador) se aceptan siempre
  const isTouchFallback = payload.sensorId?.startsWith?.('touch_fallback');

  if (!sessionSensorId || sessionSensorId === payload.sensorId || isTouchFallback) {
    return true;
  }

  socket.emit('error', {
    code: 'RFID_SENSOR_UNAUTHORIZED',
    message: 'Este sensor no esta autorizado para esta sesion de juego'
  });
  logSocketSecurityEvent('SECURITY_RFID_EVENT_INVALID', socket, {
    eventName: 'rfid_scan_from_client',
    reason: 'RFID_SENSOR_UNAUTHORIZED',
    sessionId: playContext.sessionId,
    expected: sessionSensorId,
    received: payload.sensorId
  });
  return false;
};

const ensureRfidSensorConsistency = (socket, modeState, payload) => {
  // Los sensores touch_fallback (panel táctil del navegador cuando no hay
  // sensor físico conectado) se aceptan siempre, igual que en
  // validateRfidSensorAuthorization. De lo contrario, si el modeState quedó
  // vinculado a un sensorId previo (p. ej. tras simular escaneos en el wizard
  // de mazos), los toques sucesivos del fallback se rechazaban con
  // RFID_SENSOR_MISMATCH y la respuesta no se contabilizaba (QA 26/04/2026).
  const isTouchFallback = payload.sensorId?.startsWith?.('touch_fallback');

  if (modeState.sensorId && modeState.sensorId !== payload.sensorId && !isTouchFallback) {
    socket.emit('error', {
      code: 'RFID_SENSOR_MISMATCH',
      message:
        'Sensor RFID no coincide con el sensor activo de la sesion (o cambio inesperadamente)'
    });
    logSocketSecurityEvent('SECURITY_RFID_EVENT_INVALID', socket, {
      eventName: 'rfid_scan_from_client',
      reason: 'RFID_SENSOR_MISMATCH',
      mode: modeState.mode,
      expected: modeState.sensorId,
      received: payload.sensorId
    });
    return false;
  }

  // Solo bindeamos el sensorId persistente con sensores reales: nunca
  // sobreescribir el binding con `touch_fallback_sensor`, porque dejaría al
  // próximo scan de un sensor físico atascado en consistency mismatch.
  if (!modeState.sensorId && !isTouchFallback) {
    setRfidSensorBinding(socket.data.userId, payload.sensorId, socket.id);
  }

  return true;
};

const handleRfidScanFromClient = async (socket, data, gameEngine, rfidService, logger) => {
  if (!requireSocketRole(socket, ['teacher', 'super_admin'], 'rfid_scan_from_client')) {
    return;
  }

  if (!isRfidClientSourceEnabled(socket)) {
    return;
  }

  const payload = parseRfidClientPayload(socket, data);
  if (!payload) {
    return;
  }

  const { modeState, state } = await getRfidStateForSocket(socket, logger);
  if (!validateRfidStateForRead(socket, modeState, state)) {
    return;
  }

  if (!validateRfidSensorAuthorization(socket, modeState, payload, gameEngine)) {
    return;
  }

  if (!ensureRfidSensorConsistency(socket, modeState, payload)) {
    return;
  }

  // Refrescar el watchdog: actividad legítima del modo RFID.
  refreshRfidModeActivity(socket.data.userId, modeState.socketId || socket.id);

  rfidService.ingestEvent({
    event: 'card_detected',
    mode: modeState.mode,
    ...payload
  });
};

/**
 * Crea middleware de autenticación reutilizable para namespaces Socket.IO.
 * Valida token JWT, origen, estado del usuario y límite de conexiones.
 *
 * @param {Object} socketRateLimiter - Instancia del rate limiter de sockets
 * @returns {Function} Middleware async para Socket.IO
 */
const createAuthMiddleware =
  (socketRateLimiter, { trackConnections = true } = {}) =>
  async (socket, next) => {
    try {
      const tokenFromAuth = socket.handshake?.auth?.token;
      const headerAuth = socket.handshake?.headers?.authorization || '';
      const tokenFromHeader = headerAuth.startsWith('Bearer ') ? headerAuth.slice(7) : null;
      const accessToken = tokenFromAuth || tokenFromHeader;
      let tokenSource = 'missing';
      if (tokenFromAuth) {
        tokenSource = 'handshake_auth';
      } else if (tokenFromHeader) {
        tokenSource = 'authorization';
      }

      if (!accessToken) {
        logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
          reason: 'TOKEN_MISSING',
          tokenSource
        });
        return next(new Error('Token requerido'));
      }

      const originValidation = validateSocketOrigin(socket);
      if (!originValidation.valid) {
        logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
          reason: originValidation.reason,
          origin: originValidation.origin,
          tokenSource
        });
        return next(new Error('Origin no autorizado'));
      }

      const mockReq = { headers: socket.handshake.headers };
      const decoded = await verifyAccessToken(accessToken, mockReq);

      if (!decoded?.id) {
        logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
          reason: 'TOKEN_INVALID',
          tokenSource
        });
        return next(new Error('Token invalido'));
      }

      // Cache-aside Redis (slim-user, TTL 60s) en el handshake de Socket.IO.
      // Reduce queries repetidas a Mongo en reconexiones rápidas (WiFi inestable de aulas).
      const user = await fetchUserForAuth(
        decoded.id,
        'role status accountStatus +currentSessionId'
      );
      if (!user) {
        logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
          reason: 'USER_NOT_FOUND',
          tokenSource,
          userId: decoded.id
        });
        return next(new Error('Usuario no encontrado'));
      }

      if (user.status !== 'active') {
        logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
          reason: 'USER_INACTIVE',
          tokenSource,
          userId: user._id,
          status: user.status
        });
        return next(new Error('Usuario inactivo'));
      }

      if (
        ['teacher', 'super_admin'].includes(user.role) &&
        user.accountStatus &&
        user.accountStatus !== 'approved'
      ) {
        logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
          reason: 'ACCOUNT_NOT_APPROVED',
          tokenSource,
          userId: user._id,
          accountStatus: user.accountStatus
        });
        return next(new Error('Cuenta no aprobada'));
      }

      if (decoded.sid && user.currentSessionId && decoded.sid !== user.currentSessionId) {
        logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
          reason: 'SESSION_MISMATCH',
          tokenSource,
          userId: user._id
        });
        return next(new Error('Sesion invalida'));
      }

      const userId = user._id.toString();

      // Solo contar conexiones en el namespace principal (default /).
      // El namespace /game reutiliza la misma conexión WebSocket subyacente.
      if (trackConnections) {
        const currentCount = getConnectionCount(userId);
        if (currentCount >= socketConnectionLimits.maxConnectionsPerUser) {
          logSocketSecurityEvent('WS_CONNECTION_LIMIT', socket, {
            reason: 'MAX_CONNECTIONS_EXCEEDED',
            userId,
            currentCount,
            limit: socketConnectionLimits.maxConnectionsPerUser
          });
          return next(new Error('Limite de conexiones alcanzado'));
        }
        incrementConnectionCount(userId);
      }

      socket.data.userId = userId;
      socket.data.userRole = user.role;
      socket.data.accessToken = accessToken;
      socket.data.tokenExp = decoded.exp;
      socketRateLimiter.setIdentity(socket, { id: userId, role: user.role });

      socket.join(`user_${decoded.id}`);

      return next();
    } catch (error) {
      logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
        reason: error.message
      });
      return next(new Error('Autenticacion invalida'));
    }
  };

const registerSocketHandlers = ({
  io,
  gameNsp,
  gameEngine,
  rfidService,
  socketRateLimiter,
  logger
}) => {
  socketServerRef = io;
  gameNspRef = gameNsp;

  // Iniciar limpieza periódica de caches (cada 5 minutos)
  if (cacheCleanupIntervalRef) {
    clearInterval(cacheCleanupIntervalRef);
  }
  cacheCleanupIntervalRef = setInterval(() => {
    const authRemoved = sweepAllExpiredEntries(authRevalidationCache);
    const ownershipRemoved = sweepAllExpiredEntries(playOwnershipCache);
    if (authRemoved > 0 || ownershipRemoved > 0) {
      logger.debug('Limpieza periódica de caches Socket.IO completada', {
        authRemoved,
        ownershipRemoved,
        authCacheSize: authRevalidationCache.size,
        ownershipCacheSize: playOwnershipCache.size
      });
    }
  }, CACHE_CLEANUP_INTERVAL_MS);

  // Evitar que el intervalo impida el cierre del proceso
  if (cacheCleanupIntervalRef.unref) {
    cacheCleanupIntervalRef.unref();
  }

  // ---- Namespace por defecto (/): eventos de sistema ----
  const authMiddleware = createAuthMiddleware(socketRateLimiter);
  io.use(authMiddleware);

  io.on('connection', async socket => {
    logger.info(`Cliente conectado [/]: ${socket.id}`, {
      userId: socket.data.userId,
      role: socket.data.userRole
    });

    // CRÍTICO: registrar el listener de disconnect ANTES de cualquier await.
    // Si la inicialización (await getRfidModeState) lanzase una excepción, el
    // listener no llegaría a registrarse y el contador de conexiones quedaría
    // huérfano (leak que bloquea al usuario tras MAX_CONNECTIONS reconexiones).
    socket.on('disconnect', () => {
      const disconnUserId = socket.data.userId;
      decrementConnectionCount(disconnUserId);
      // NOTA: la limpieza RFID se hace en el disconnect del namespace /game,
      // donde se registró el modo (con el socketId correcto de /game).
      logger.info(`Cliente desconectado [/]: ${socket.id}`, {
        userId: disconnUserId,
        role: socket.data.userRole
      });
    });

    // Emitir estado RFID actual al conectarse. Si falla la lectura del modo,
    // logueamos y notificamos a Sentry pero no rompemos la conexión.
    try {
      const currentMode = await getRfidModeState(socket.data.userId);
      socket.emit('rfid_mode_changed', {
        mode: currentMode.mode,
        sensorId: currentMode.sensorId || null,
        metadata: currentMode.metadata || {},
        socketId: currentMode.socketId || null,
        updatedAt: currentMode.updatedAt || Date.now()
      });
    } catch (err) {
      logger.error('Error inicializando estado RFID al conectar', {
        socketId: socket.id,
        userId: socket.data.userId,
        err: err.message
      });
      Sentry.captureException(err, {
        tags: { component: 'socketHandlers', phase: 'connection_init' }
      });
    }
  });

  // ---- Namespace /game: eventos de gameplay ----
  // No contamos conexiones en /game (ya se cuentan en el namespace default)
  gameNsp.use(createAuthMiddleware(socketRateLimiter, { trackConnections: false }));

  gameNsp.on('connection', socket => {
    logger.info(`Cliente conectado [/game]: ${socket.id}`, {
      userId: socket.data.userId,
      role: socket.data.userRole
    });

    const sensitiveEvents = new Set([
      'join_play',
      'leave_play',
      'start_play',
      'pause_play',
      'resume_play',
      'next_round',
      'join_card_assignment',
      'leave_card_assignment',
      'join_admin_room',
      'leave_admin_room',
      'rfid_scan_from_client',
      'play_state_sync'
    ]);

    const commandHelpers = {
      requireSocketRole,
      requirePlayOwnership,
      validatePlayId,
      // RFID mode helpers serializados por userId para evitar race conditions
      setRfidModeState: (userId, mode, socketId, metadata) =>
        executeWithRfidLock(userId, () => setRfidModeState(userId, mode, socketId, metadata)),
      clearRfidModeState: (userId, socketId) =>
        executeWithRfidLock(userId, () => clearRfidModeState(userId, socketId)),
      getPlayRoom,
      getAssignmentRoom,
      handleRfidScanFromClient,
      RFID_MODES
    };

    const executeSocketCommand = async (eventName, data) => {
      const command = getSocketCommand(eventName);
      if (!command) {
        logger.warn('Comando Socket no registrado', { eventName });
        return;
      }

      try {
        await command.execute({
          socket,
          data,
          logger,
          io: gameNsp,
          gameEngine,
          rfidService,
          helpers: commandHelpers
        });
      } catch (error) {
        Sentry.captureException(error, {
          tags: {
            eventName,
            socketId: socket.id
          },
          user: socket.data?.userId ? { id: socket.data.userId, role: socket.data.userRole } : null
        });
        logger.error('Error ejecutando comando Socket', {
          eventName,
          message: error.message
        });
        socket.emit('error', {
          code: 'COMMAND_ERROR',
          message: 'Error al procesar el evento',
          event: eventName
        });
      }
    };

    const onEvent = eventName =>
      socket.on(
        eventName,
        socketRateLimiter.wrap(socket, eventName, async data => {
          const dangerousPath = findDangerousPayloadPath(data);
          if (dangerousPath) {
            rejectDangerousSocketPayload(socket, eventName, dangerousPath);
            return;
          }

          if (sensitiveEvents.has(eventName)) {
            const ok = await revalidateSocketAuth(socket, eventName);
            if (!ok) {
              return;
            }
          }
          await executeSocketCommand(eventName, data);
        })
      );

    // Registrar todos los comandos de gameplay en el namespace /game
    getCommandNames().forEach(eventName => {
      onEvent(eventName);
    });

    // Heartbeat ligero del modo RFID: refresca el watchdog para evitar
    // que un modo activo se libere por timeout durante períodos de
    // inactividad legítima (p. ej. profesor leyendo la pantalla del alumno).
    // No requiere rate limiting porque el cliente lo emite cada 60 s y la
    // operación es sólo una actualización en memoria.
    socket.on('rfid_mode_heartbeat', () => {
      refreshRfidModeActivity(socket.data?.userId, socket.id);
    });

    socket.on('disconnect', () => {
      // Limpiar estado RFID: el modo se registró con el socketId de /game,
      // por lo que debe limpiarse aquí (no en el namespace default).
      const gameUserId = socket.data.userId;
      if (gameUserId) {
        clearRfidModeState(gameUserId, socket.id);
      }
      socket.data.playOwnershipCache = null;
      socketRateLimiter.cleanupForSocket(socket);
      logger.info(`Cliente desconectado [/game]: ${socket.id}`, {
        userId: gameUserId,
        role: socket.data.userRole
      });
    });
  });
};

const registerRfidHandlers = ({ io, gameNsp, gameEngine, rfidService, logger }) => {
  rfidService.on('rfid_event', event => {
    runtimeMetrics.recordRfidEvent(event);

    const playId = event?.uid ? gameEngine.getPlayIdByCardUid(event.uid) : null;

    if (event.event === 'card_detected' && event.mode === RFID_MODES.GAMEPLAY && playId) {
      // Eventos de gameplay se emiten en el namespace /game
      gameNsp.to(getPlayRoom(playId)).emit('rfid_event', {
        event: 'card_detected'
      });
    } else if (event.event === 'card_detected' && event.mode === RFID_MODES.CARD_ASSIGNMENT) {
      // Eventos de asignacion de tarjetas se emiten en el namespace /game
      const userId = getUserIdBySensorId(event.sensorId);
      if (userId) {
        gameNsp.to(getAssignmentRoom(userId)).emit('rfid_event', event);
      }
    } else {
      // Eventos administrativos se emiten en el namespace /game (admin_room)
      gameNsp.to('admin_room').emit('rfid_event', event);
    }

    switch (event.event) {
      case 'init':
        logger.info(`Sensor RFID inicializado: ${event.status} (v${event.version})`);
        break;
      case 'card_detected':
        logger.info(`Tarjeta detectada: ${event.uid} (${event.type})`);
        if (event.mode === RFID_MODES.GAMEPLAY) {
          gameEngine.handleCardScan(event.uid, event.type);
        }
        break;
      case 'card_removed':
        logger.info(`Tarjeta retirada: ${event.uid}`);
        break;
      case 'error':
        logger.error(`Error RFID: ${event.type} - ${event.message}`);
        break;
      case 'status':
        logger.debug(`Estado RFID: uptime=${event.uptime}, cards=${event.cards_detected}`);
        break;
    }
  });

  // Evento de estado del servicio RFID: evento de sistema, se emite en namespace por defecto
  rfidService.on('status', status => {
    logger.info(`Estado del servicio RFID: ${status}`);
    io.to('admin_room').emit('rfid_status', { status });
  });
};

/**
 * Detiene el intervalo de limpieza periódica de caches.
 * Debe llamarse durante el shutdown del servidor.
 */
const stopCacheCleanup = () => {
  if (cacheCleanupIntervalRef) {
    clearInterval(cacheCleanupIntervalRef);
    cacheCleanupIntervalRef = null;
  }
};

// ============================================================================
// INVALIDACIÓN INMEDIATA DEL AUTH CACHE VIA EVENTOS INTERNOS
// ============================================================================

/**
 * Purga del auth cache todas las entradas de un userId específico.
 * Se ejecuta cuando se revocan todos los tokens del usuario (seguridad).
 *
 * @param {string} userId
 * @returns {number} Número de entradas purgadas
 */
const purgeAuthCacheByUserId = userId => {
  let purged = 0;
  for (const [token, cached] of authRevalidationCache.entries()) {
    if (cached.userId === userId) {
      authRevalidationCache.delete(token);
      purged++;
    }
  }
  return purged;
};

// Registrar listeners para eventos de revocación de tokens
authEventBus.on('all_tokens_revoked', ({ userId, reason }) => {
  const purged = purgeAuthCacheByUserId(userId);
  if (purged > 0) {
    logger.info('Auth cache purgado por revocación de todos los tokens', {
      userId,
      reason,
      entriesPurged: purged
    });
  }
});

authEventBus.on('token_revoked', () => {
  // Para revocación individual no tenemos el token string (solo JTI).
  // El impacto es mínimo: una sola entrada expirará en ≤30s.
  // La purga por userId cubre el caso de seguridad importante.
});

/**
 * Lectura síncrona del estado RFID en memoria (sin Redis). Usado por tests
 * para inspeccionar el watchdog sin pasar por la versión async pública
 * `getRfidModeState` que consulta Redis como fallback.
 *
 * @param {string} userId
 * @returns {object|undefined}
 */
const peekRfidModeStateForTests = userId => rfidModeByUserId.get(userId);

module.exports = {
  RFID_MODES,
  RFID_MODE_IDLE_TIMEOUT_MS,
  RFID_MODE_PUBSUB_CHANNEL,
  registerSocketHandlers,
  registerRfidHandlers,
  stopCacheCleanup,
  // Helpers expuestos para tests unitarios y observabilidad interna.
  getConnectionCount,
  incrementConnectionCount,
  decrementConnectionCount,
  resetConnectionCountsForTests,
  setRfidModeState,
  clearRfidModeState,
  refreshRfidModeActivity,
  resetRfidModeTimersForTests,
  peekRfidModeStateForTests,
  // ADR-077: aplicación de cambios remotos vía pub/sub.
  applyRemoteRfidModeChange
};
