/**
 * @fileoverview Registro de handlers Socket.IO y eventos RFID.
 * Centraliza autenticacion, control de modos RFID y enrutado por rooms.
 *
 * @module realtime/socketHandlers
 */

const gamePlayRepository = require('../repositories/gamePlayRepository');
const userRepository = require('../repositories/userRepository');
const { verifyAccessToken } = require('../middlewares/auth');
const runtimeMetrics = require('../utils/runtimeMetrics');
const { logSecurityEvent, getSocketContext } = require('../utils/securityLogger');
const { rfidClientEventSchema } = require('../validators/rfidValidator');
const { objectIdSchema } = require('../validators/commonValidator');
const { getRfidState } = require('../states/rfid');
const { getSocketCommand, getCommandNames } = require('../commands/socket');

const RFID_MODES = Object.freeze({
  IDLE: 'idle',
  GAMEPLAY: 'gameplay',
  CARD_REGISTRATION: 'card_registration',
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

const getRfidModeState = userId => {
  if (!userId) {
    return { mode: RFID_MODES.IDLE, sensorId: null, socketId: null };
  }
  return rfidModeByUserId.get(userId) || { mode: RFID_MODES.IDLE, sensorId: null, socketId: null };
};

const getRegistrationRoom = userId => `card_registration_${userId}`;
const getAssignmentRoom = userId => `card_assignment_${userId}`;
const getPlayRoom = playId => `play_${playId}`;

const getUserIdBySensorId = sensorId => {
  if (!sensorId) {
    return null;
  }

  return sensorIdToUserId.get(sensorId) || null;
};

const setRfidModeState = (userId, mode, socketId, metadata = {}) => {
  if (!userId) {
    return;
  }

  const current = rfidModeByUserId.get(userId);
  if (current?.sensorId) {
    sensorIdToUserId.delete(current.sensorId);
  }

  if (mode === RFID_MODES.IDLE) {
    rfidModeByUserId.delete(userId);
    return;
  }

  rfidModeByUserId.set(userId, {
    mode,
    socketId,
    sensorId: null,
    metadata,
    updatedAt: Date.now()
  });
};

const setRfidSensorBinding = (userId, sensorId, socketId) => {
  if (!userId || !sensorId) {
    return;
  }

  const current = rfidModeByUserId.get(userId);
  if (current?.sensorId && current.sensorId !== sensorId) {
    sensorIdToUserId.delete(current.sensorId);
  }

  sensorIdToUserId.set(sensorId, userId);
  rfidModeByUserId.set(userId, {
    ...current,
    sensorId,
    socketId,
    updatedAt: Date.now()
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
  }

  rfidModeByUserId.delete(userId);
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
    const user = await userRepository.findById(decoded.id, {
      select: 'role status accountStatus +currentSessionId'
    });

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

const getRfidStateForSocket = (socket, logger) => {
  const modeState = getRfidModeState(socket.data.userId);
  const state = getRfidState(modeState.mode, logger);
  return { modeState, state };
};

const validateRfidStateForRead = (socket, modeState, state) => {
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
    registration: getRegistrationRoom(socket.data.userId),
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

  if (!sessionSensorId || sessionSensorId === payload.sensorId) {
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
  if (modeState.sensorId && modeState.sensorId !== payload.sensorId) {
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

  if (!modeState.sensorId) {
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

  const { modeState, state } = getRfidStateForSocket(socket, logger);
  if (!validateRfidStateForRead(socket, modeState, state)) {
    return;
  }

  if (!validateRfidSensorAuthorization(socket, modeState, payload, gameEngine)) {
    return;
  }

  if (!ensureRfidSensorConsistency(socket, modeState, payload)) {
    return;
  }

  rfidService.ingestEvent({
    event: 'card_detected',
    mode: modeState.mode,
    ...payload
  });
};

const registerSocketHandlers = ({ io, gameEngine, rfidService, socketRateLimiter, logger }) => {
  // Middleware de autenticacion obligatoria.
  io.use(async (socket, next) => {
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

      const mockReq = { headers: socket.handshake.headers };
      const decoded = await verifyAccessToken(accessToken, mockReq);

      if (!decoded?.id) {
        logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
          reason: 'TOKEN_INVALID',
          tokenSource
        });
        return next(new Error('Token invalido'));
      }

      const user = await userRepository.findById(decoded.id, {
        select: 'role status accountStatus +currentSessionId'
      });
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

      socket.data.userId = user._id.toString();
      socket.data.userRole = user.role;
      socket.data.accessToken = accessToken;
      socket.data.tokenExp = decoded.exp;
      socketRateLimiter.setIdentity(socket, { id: user._id.toString(), role: user.role });

      socket.join(`user_${decoded.id}`);

      return next();
    } catch (error) {
      logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
        reason: error.message
      });
      return next(new Error('Autenticacion invalida'));
    }
  });

  io.on('connection', socket => {
    logger.info(`Cliente conectado: ${socket.id}`, {
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
      'join_card_registration',
      'leave_card_registration',
      'join_card_assignment',
      'leave_card_assignment',
      'join_admin_room',
      'leave_admin_room',
      'rfid_scan_from_client'
    ]);

    const commandHelpers = {
      requireSocketRole,
      requirePlayOwnership,
      validatePlayId,
      setRfidModeState,
      clearRfidModeState,
      getPlayRoom,
      getRegistrationRoom,
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
          io,
          gameEngine,
          rfidService,
          helpers: commandHelpers
        });
      } catch (error) {
        logger.error('Error ejecutando comando Socket', {
          eventName,
          message: error.message
        });
        socket.emit('error', { message: 'Error al procesar el evento' });
      }
    };

    const onEvent = eventName =>
      socket.on(
        eventName,
        socketRateLimiter.wrap(socket, eventName, async data => {
          if (sensitiveEvents.has(eventName)) {
            const ok = await revalidateSocketAuth(socket, eventName);
            if (!ok) {
              return;
            }
          }
          await executeSocketCommand(eventName, data);
        })
      );

    getCommandNames().forEach(eventName => {
      onEvent(eventName);
    });

    socket.on('disconnect', () => {
      socket.data.playOwnershipCache = null;
      clearRfidModeState(socket.data.userId, socket.id);
      socketRateLimiter.cleanupForSocket(socket);
      logger.info(`Cliente desconectado: ${socket.id}`, {
        userId: socket.data.userId,
        role: socket.data.userRole
      });
    });
  });
};

const registerRfidHandlers = ({ io, gameEngine, rfidService, logger }) => {
  rfidService.on('rfid_event', event => {
    runtimeMetrics.recordRfidEvent(event);

    const playId = event?.uid ? gameEngine.getPlayIdByCardUid(event.uid) : null;

    if (event.event === 'card_detected' && event.mode === RFID_MODES.GAMEPLAY && playId) {
      io.to(getPlayRoom(playId)).emit('rfid_event', {
        event: 'card_detected'
      });
    } else if (event.event === 'card_detected' && event.mode === RFID_MODES.CARD_ASSIGNMENT) {
      const userId = getUserIdBySensorId(event.sensorId);
      if (userId) {
        io.to(getAssignmentRoom(userId)).emit('rfid_event', event);
      }
    } else if (event.event === 'card_detected' || event.event === 'card_removed') {
      const userId = getUserIdBySensorId(event.sensorId);
      if (userId) {
        io.to(getRegistrationRoom(userId)).emit('rfid_event', event);
      }
    } else {
      io.to('admin_room').emit('rfid_event', event);
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

  rfidService.on('status', status => {
    logger.info(`Estado del servicio RFID: ${status}`);
    io.to('admin_room').emit('rfid_status', { status });
  });
};

module.exports = {
  RFID_MODES,
  registerSocketHandlers,
  registerRfidHandlers
};
