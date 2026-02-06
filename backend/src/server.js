/**
 * @fileoverview Punto de entrada principal del servidor backend.
 * Configura Express, Socket.IO, inicializa servicios y define rutas de la API REST.
 * @module server
 */

// Dotenv prints "injecting env" tips unless quiet=true (noisy for tests).
const dotenv = require('dotenv');
dotenv.config(process.env.NODE_ENV === 'test' ? { quiet: true } : undefined);

// Validar variables de entorno ANTES de cualquier inicialización
const { validateEnv } = require('./utils/envValidator');
validateEnv(); // Falla FAST si falta alguna configuración crítica

const express = require('express');
const cors = require('cors');
const http = require('node:http');
const helmet = require('helmet');
const compression = require('compression');
const { Server } = require('socket.io');
const { connectDB, disconnectDB } = require('./config/database');
const { connectRedis, disconnectRedis } = require('./config/redis');
const { initSentry, Sentry } = require('./config/sentry');
const { socketPayloadLimits } = require('./config/socketRateLimits');
const {
  corsOptions,
  csrfProtection, // Middleware CSRF
  helmetOptions,
  globalRateLimiter,
  authRateLimiter
} = require('./config/security');
const rfidService = require('./services/rfidService');
const GameEngine = require('./services/gameEngine');
const GamePlay = require('./models/GamePlay');
const User = require('./models/User');
const logger = require('./utils/logger');
const { verifyAccessToken, authenticate, requireRole } = require('./middlewares/auth');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { createSocketRateLimiter } = require('./middlewares/socketRateLimiter');
const { getHealthStatus } = require('./utils/healthCheck');
const runtimeMetrics = require('./utils/runtimeMetrics');
const { toSystemMetricsDTOV1 } = require('./utils/dtos');
const { logSecurityEvent, getSocketContext } = require('./utils/securityLogger');
const { validateQuery } = require('./middlewares/validation');
const { emptyObjectSchema } = require('./validators/commonValidator');
const { rfidClientEventSchema } = require('./validators/rfidValidator');

// Importar rutas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const cardRoutes = require('./routes/cards');
const mechanicRoutes = require('./routes/mechanics');
const contextRoutes = require('./routes/contexts');
const sessionRoutes = require('./routes/sessions');
const playRoutes = require('./routes/plays');
const deckRoutes = require('./routes/decks');
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analyticsRoutes');

// Crear aplicación Express
const app = express();
const server = http.createServer(app);

// Inicializar Sentry
initSentry();

// Configurar Socket.io con CORS seguro
const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 60000, // 60 segundos
  pingInterval: 25000, // 25 segundos
  maxHttpBufferSize: socketPayloadLimits.globalBytes, // Límite global de payload (bytes)
  transports: ['websocket', 'polling'], // Preferir WebSocket
  allowEIO3: false // Solo usar Engine.IO v4
});

/**
 * Instancia del motor de juego con Socket.IO inyectado.
 * Gestiona todas las partidas activas del sistema.
 * @type {GameEngine}
 */
const gameEngine = new GameEngine(io);

// Rate limiting para WebSockets (instancia única compartida)
const socketRateLimiter = createSocketRateLimiter({ logger });

const RFID_MODES = Object.freeze({
  IDLE: 'idle',
  GAMEPLAY: 'gameplay',
  CARD_REGISTRATION: 'card_registration',
  CARD_ASSIGNMENT: 'card_assignment'
});

const rfidModeByUserId = new Map();

const getRfidModeState = userId => {
  if (!userId) {
    return { mode: RFID_MODES.IDLE, sensorId: null, socketId: null };
  }
  return rfidModeByUserId.get(userId) || { mode: RFID_MODES.IDLE, sensorId: null, socketId: null };
};

const setRfidModeState = (userId, mode, socketId) => {
  if (!userId) {
    return;
  }

  if (mode === RFID_MODES.IDLE) {
    rfidModeByUserId.delete(userId);
    return;
  }

  rfidModeByUserId.set(userId, {
    mode,
    socketId,
    sensorId: null,
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

  rfidModeByUserId.delete(userId);
};

/**
 * Construye metadata común de socket para logging.
 * @param {import('socket.io').Socket} socket
 * @returns {Object}
 */
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

/**
 * Middleware de autenticación obligatoria para Socket.IO.
 * Requiere token en handshake (auth.token o Authorization header).
 */
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
      return next(new Error('Token requerido')); // Bloquear conexión
    }

    const mockReq = { headers: socket.handshake.headers };
    const decoded = await verifyAccessToken(accessToken, mockReq);

    if (!decoded?.id) {
      logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
        reason: 'TOKEN_INVALID',
        tokenSource
      });
      return next(new Error('Token inválido'));
    }

    // Validar estado de cuenta y sesión (single-session) con datos frescos
    const user = await User.findById(decoded.id).select(
      '+currentSessionId role status accountStatus'
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
      return next(new Error('Sesión inválida'));
    }

    socket.data.userId = user._id.toString();
    socket.data.userRole = user.role;
    socketRateLimiter.setIdentity(socket, { id: user._id.toString(), role: user.role });

    // Unirse automáticamente a la room del usuario para notificaciones dirigidas
    socket.join(`user_${decoded.id}`);

    return next();
  } catch (error) {
    logSocketSecurityEvent('WS_AUTH_FAILED', socket, {
      reason: error.message
    });
    return next(new Error('Autenticación inválida'));
  }
});

/**
 * Verifica si el socket tiene uno de los roles permitidos.
 * @param {import('socket.io').Socket} socket
 * @param {string[]} allowedRoles
 * @param {string} eventName
 * @returns {boolean}
 */
const requireSocketRole = (socket, allowedRoles, eventName) => {
  if (!socket?.data?.userId) {
    socket.emit('error', { code: 'AUTH_REQUIRED', message: 'Autenticación requerida' });
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

/**
 * Verifica ownership de una partida para el socket actual.
 * @param {import('socket.io').Socket} socket
 * @param {string} playId
 * @returns {Promise<{play: Object, session: Object}|null>}
 */
const requirePlayOwnership = async (socket, playId, eventName) => {
  if (!socket?.data?.userId) {
    socket.emit('error', { code: 'AUTH_REQUIRED', message: 'Autenticación requerida' });
    logSocketSecurityEvent('AUTHZ_ACCESS_DENIED', socket, {
      playId,
      eventName,
      reason: 'AUTH_REQUIRED'
    });
    return null;
  }

  const play = await GamePlay.findById(playId).populate('sessionId');
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

  return { play, session };
};

// Exponer el gameEngine a controllers (REST) sin imports circulares.
app.set('gameEngine', gameEngine);
// Exponer io a controllers para notificaciones (e.g. session_invalidated)
app.set('io', io);

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Sentry request handler (DEBE ser el primero)
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// Security headers con Helmet (configuración centralizada)
app.use(helmet(helmetOptions));

// Compression para respuestas (solo si aporta valor)
// Threshold: Solo comprimir si > 1KB
app.use(
  compression({
    threshold: 1024, // 1KB
    filter: (req, res) => {
      // No comprimir si el cliente no lo soporta
      if (req.headers['x-no-compression']) {
        return false;
      }
      // Usar filtro por defecto de compression
      return compression.filter(req, res);
    }
  })
);

// Rate limiting global (todas las rutas /api/*)
app.use('/api/', globalRateLimiter);

// CORS con whitelist dinámica
app.use(cors(corsOptions));

// CSRF Protection para métodos que modifican datos
app.use(csrfProtection);

app.use(express.json()); // Parsear application/json
app.use(express.urlencoded({ extended: true })); // Parsear application/x-www-form-urlencoded

// Middleware de logging de requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Middleware de métricas de latencia (para /api/*)
app.use('/api', (req, res, next) => {
  const startNs = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    runtimeMetrics.recordHttpRequest({
      durationMs,
      statusCode: res.statusCode
    });
  });

  next();
});

// ============================================================================
// RUTAS DE LA API REST
// ============================================================================

// Rutas de autenticación (con rate limit específico)
app.use('/api/auth', authRateLimiter, authRoutes);

// Rutas de gestión de usuarios
app.use('/api/users', userRoutes);

// Rutas de gestión de tarjetas RFID
app.use('/api/cards', cardRoutes);

// Rutas de mecánicas de juego
app.use('/api/mechanics', mechanicRoutes);

// Rutas de contextos temáticos (rate limit en creación)
app.use('/api/contexts', contextRoutes);

// Rutas de sesiones de juego (rate limit en creación)
app.use('/api/sessions', sessionRoutes);

// Rutas de partidas individuales
app.use('/api/plays', playRoutes);

// Rutas de mazos reutilizables
app.use('/api/decks', deckRoutes);

// Rutas de administración (solo super admin)
app.use('/api/admin', adminRoutes);

// Rutas de analíticas
app.use('/api/analytics', analyticsRoutes);

/**
 * Endpoint de salud del servidor con información detallada.
 * @route GET /api/health
 * @returns {Object} 200 - Estado completo del servidor, MongoDB y RFID
 */
app.get('/api/health', validateQuery(emptyObjectSchema), async (req, res) => {
  try {
    const healthStatus = await getHealthStatus(rfidService);
    const httpStatus = ['healthy', 'degraded'].includes(healthStatus.status) ? 200 : 503;
    res.status(httpStatus).json(healthStatus);
  } catch (error) {
    logger.error('Error en health check:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
});

/**
 * Alias del health check para herramientas externas.
 * @route GET /health
 */
app.get('/health', validateQuery(emptyObjectSchema), async (req, res) => {
  try {
    const healthStatus = await getHealthStatus(rfidService);
    const httpStatus = ['healthy', 'degraded'].includes(healthStatus.status) ? 200 : 503;
    res.status(httpStatus).json(healthStatus);
  } catch (error) {
    logger.error('Error en health check:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
});

/**
 * Endpoint de métricas del sistema (solo para desarrollo).
 * @route GET /api/metrics
 * @returns {Object} 200 - Métricas del gameEngine y rfidService
 */
app.get(
  '/api/metrics',
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateQuery(emptyObjectSchema),
  (req, res) => {
    const snapshot = runtimeMetrics.getSnapshot();

    res.json(
      toSystemMetricsDTOV1({
        timestamp: new Date().toISOString(),
        http: snapshot.http,
        websocket: {
          connectedClients: io?.engine?.clientsCount ?? 0,
          events: snapshot.websocket
        },
        gameEngine: gameEngine.getMetrics(),
        rfid: {
          processed: snapshot.rfid,
          service: rfidService.getStatus()
        }
      })
    );
  }
);

/**
 * Endpoint raíz de la API.
 * @route GET /
 * @returns {Object} 200 - Información general de la API
 */
app.get('/', validateQuery(emptyObjectSchema), (req, res) => {
  res.json({
    message: 'API REST de Juegos RFID',
    version: '0.2.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      cards: '/api/cards',
      mechanics: '/api/mechanics',
      contexts: '/api/contexts',
      sessions: '/api/sessions',
      plays: '/api/plays',
      decks: '/api/decks',
      health: '/api/health'
    },
    documentation: 'Ver README.md para documentación completa'
  });
});

// ============================================================================
// MANEJO DE ERRORES
// ============================================================================

// Sentry error handler (ANTES del errorHandler personalizado)
app.use(Sentry.Handlers.errorHandler());

// Manejador 404 para rutas no encontradas
app.use(notFoundHandler);

// Middleware de manejo de errores centralizado (DEBE ser el último)
app.use(errorHandler);

// ============================================================================
// SOCKET.IO - EVENTOS EN TIEMPO REAL
// ============================================================================

/**
 * Manejador de conexiones Socket.IO.
 * Define todos los eventos WebSocket para comunicación en tiempo real.
 */
io.on('connection', socket => {
  logger.info(`Cliente conectado: ${socket.id}`, {
    userId: socket.data.userId,
    role: socket.data.userRole
  });

  const onEvent = (eventName, handler) =>
    socket.on(eventName, socketRateLimiter.wrap(socket, eventName, handler));

  /**
   * Evento: Cliente se une a una partida.
   * @event join_play
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida a la que unirse
   */
  onEvent('join_play', async data => {
    const { playId } = data || {};
    if (!playId) {
      socket.emit('error', { message: 'playId requerido' });
      return;
    }

    if (!requireSocketRole(socket, ['teacher', 'super_admin'], 'join_play')) {
      return;
    }

    const ownership = await requirePlayOwnership(socket, playId, 'join_play');
    if (!ownership) {
      return;
    }

    socket.join(`play_${playId}`);
    /* Note: Incluir información del jugador cuando el flujo esté completamente definido.
       Anteriormente había un recordatorio aquí. */

    logger.info(`Socket ${socket.id} se unió a la partida ${playId}`, {
      userId: socket.data.userId
    });

    // Enviar estado inicial de la partida
    const playState = gameEngine.getPlayState(playId);
    if (playState) {
      socket.emit('play_state', playState);
    }
  });

  /**
   * Evento: Cliente abandona una partida.
   * @event leave_play
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida a abandonar
   */
  onEvent('leave_play', async data => {
    const { playId } = data || {};
    if (!playId) {
      socket.emit('error', { message: 'playId requerido' });
      return;
    }
    if (!requireSocketRole(socket, ['teacher', 'super_admin'], 'leave_play')) {
      return;
    }
    const ownership = await requirePlayOwnership(socket, playId, 'leave_play');
    if (!ownership) {
      return;
    }
    socket.leave(`play_${playId}`);
    logger.info(`Socket ${socket.id} abandonó la partida ${playId}`, {
      userId: socket.data.userId
    });
  });

  /**
   * Evento: Iniciar una partida.
   * @event start_play
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida a iniciar
   */
  onEvent('start_play', async data => {
    try {
      const { playId } = data || {};
      if (!playId) {
        socket.emit('error', { message: 'playId requerido' });
        return;
      }
      if (!requireSocketRole(socket, ['teacher', 'super_admin'], 'start_play')) {
        return;
      }
      const ownership = await requirePlayOwnership(socket, playId, 'start_play');
      if (!ownership) {
        return;
      }

      gameEngine.startPlay(ownership.play, ownership.session);

      logger.info(`Partida comenzada: ${playId}`, {
        userId: socket.data.userId
      });
    } catch (error) {
      logger.error(`Error al iniciar la partida: ${error.message}`);
      socket.emit('error', { message: 'Error al iniciar la partida' });
    }
  });

  /**
   * Evento: Pausar una partida en curso.
   * @event pause_play
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida a pausar
   */
  onEvent('pause_play', data => {
    (async () => {
      try {
        const { playId } = data || {};

        if (!playId) {
          socket.emit('error', { message: 'playId requerido' });
          return;
        }

        if (!requireSocketRole(socket, ['teacher', 'super_admin'], 'pause_play')) {
          return;
        }

        const ownership = await requirePlayOwnership(socket, playId, 'pause_play');
        if (!ownership) {
          return;
        }

        await gameEngine.pausePlayInternal(playId, { requestedBy: socket.data.userId });
      } catch (error) {
        logger.error(`Error al pausar la partida: ${error.message}`);
        socket.emit('error', { message: 'Error al pausar la partida' });
      }
    })();
  });

  /**
   * Evento: Reanudar una partida pausada.
   * @event resume_play
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida a reanudar
   */
  onEvent('resume_play', data => {
    (async () => {
      try {
        const { playId } = data || {};

        if (!playId) {
          socket.emit('error', { message: 'playId requerido' });
          return;
        }

        if (!requireSocketRole(socket, ['teacher', 'super_admin'], 'resume_play')) {
          return;
        }

        const ownership = await requirePlayOwnership(socket, playId, 'resume_play');
        if (!ownership) {
          return;
        }

        await gameEngine.resumePlayInternal(playId, { requestedBy: socket.data.userId });
      } catch (error) {
        logger.error(`Error al reanudar la partida: ${error.message}`);
        socket.emit('error', { message: 'Error al reanudar la partida' });
      }
    })();
  });

  /**
   * Evento: Solicitud manual de la siguiente ronda.
   * @event next_round
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida
   */
  onEvent('next_round', data => {
    const { playId } = data || {};
    if (!playId) {
      socket.emit('error', { message: 'playId requerido' });
      return;
    }
    if (!requireSocketRole(socket, ['teacher', 'super_admin'], 'next_round')) {
      return;
    }
    requirePlayOwnership(socket, playId, 'next_round').then(ownership => {
      if (!ownership) {
        return;
      }
      gameEngine.sendNextRound(playId);
    });
  });

  onEvent('join_card_registration', () => {
    if (!requireSocketRole(socket, ['teacher', 'super_admin'], 'join_card_registration')) {
      return;
    }
    socket.join('card_registration');
    setRfidModeState(socket.data.userId, RFID_MODES.CARD_REGISTRATION, socket.id);
    logger.info(`Socket ${socket.id} se unió a card_registration`);
  });

  onEvent('leave_card_registration', () => {
    socket.leave('card_registration');
    clearRfidModeState(socket.data.userId, socket.id);
  });

  onEvent('join_card_assignment', () => {
    if (!requireSocketRole(socket, ['teacher', 'super_admin'], 'join_card_assignment')) {
      return;
    }
    socket.join('card_assignment');
    setRfidModeState(socket.data.userId, RFID_MODES.CARD_ASSIGNMENT, socket.id);
    logger.info(`Socket ${socket.id} se unió a card_assignment`);
  });

  onEvent('leave_card_assignment', () => {
    socket.leave('card_assignment');
    clearRfidModeState(socket.data.userId, socket.id);
  });

  onEvent('join_admin_room', () => {
    if (!requireSocketRole(socket, ['super_admin'], 'join_admin_room')) {
      return;
    }
    socket.join('admin_room');
    logger.info(`Socket ${socket.id} se unió a admin_room`);
  });

  onEvent('leave_admin_room', () => {
    socket.leave('admin_room');
  });

  /**
   * Evento: RFID desde cliente (Web Serial).
   * @event rfid_scan_from_client
   * @param {Object} data - Datos del escaneo
   */
  onEvent('rfid_scan_from_client', data => {
    if (!requireSocketRole(socket, ['teacher', 'super_admin'], 'rfid_scan_from_client')) {
      return;
    }

    if ((process.env.RFID_SOURCE || 'client').trim().toLowerCase() !== 'client') {
      socket.emit('error', {
        code: 'RFID_DISABLED',
        message: 'RFID en modo cliente deshabilitado'
      });
      return;
    }

    const parsed = rfidClientEventSchema.safeParse(data || {});
    if (!parsed.success) {
      const firstError = parsed.error.issues?.[0];
      socket.emit('error', {
        code: 'VALIDATION_ERROR',
        message: firstError?.message || 'Payload RFID inválido'
      });
      logSocketSecurityEvent('SECURITY_RFID_EVENT_INVALID', socket, {
        eventName: 'rfid_scan_from_client',
        reason: 'ZOD_VALIDATION_ERROR',
        details: parsed.error.issues
      });
      return;
    }

    const modeState = getRfidModeState(socket.data.userId);
    const allowedModes = new Set([
      RFID_MODES.CARD_REGISTRATION,
      RFID_MODES.CARD_ASSIGNMENT,
      RFID_MODES.GAMEPLAY
    ]);
    if (!allowedModes.has(modeState.mode)) {
      socket.emit('error', {
        code: 'RFID_MODE_INVALID',
        message: 'Modo RFID no permite lecturas'
      });
      logSocketSecurityEvent('SECURITY_RFID_EVENT_INVALID', socket, {
        eventName: 'rfid_scan_from_client',
        reason: 'RFID_MODE_INVALID',
        mode: modeState.mode
      });
      return;
    }

    if (modeState.mode === RFID_MODES.CARD_REGISTRATION && !socket.rooms.has('card_registration')) {
      socket.emit('error', {
        code: 'RFID_MODE_INVALID',
        message: 'Modo RFID invalido para registro'
      });
      logSocketSecurityEvent('SECURITY_RFID_EVENT_INVALID', socket, {
        eventName: 'rfid_scan_from_client',
        reason: 'RFID_MODE_ROOM_MISMATCH',
        mode: modeState.mode
      });
      return;
    }

    if (modeState.mode === RFID_MODES.CARD_ASSIGNMENT && !socket.rooms.has('card_assignment')) {
      socket.emit('error', {
        code: 'RFID_MODE_INVALID',
        message: 'Modo RFID invalido para asignacion'
      });
      logSocketSecurityEvent('SECURITY_RFID_EVENT_INVALID', socket, {
        eventName: 'rfid_scan_from_client',
        reason: 'RFID_MODE_ROOM_MISMATCH',
        mode: modeState.mode
      });
      return;
    }

    if (modeState.sensorId && modeState.sensorId !== parsed.data.sensorId) {
      socket.emit('error', {
        code: 'RFID_SENSOR_MISMATCH',
        message: 'Sensor RFID no autorizado para este modo'
      });
      logSocketSecurityEvent('SECURITY_RFID_EVENT_INVALID', socket, {
        eventName: 'rfid_scan_from_client',
        reason: 'RFID_SENSOR_MISMATCH',
        mode: modeState.mode,
        sensorId: parsed.data.sensorId
      });
      return;
    }

    if (!modeState.sensorId) {
      rfidModeByUserId.set(socket.data.userId, {
        ...modeState,
        sensorId: parsed.data.sensorId,
        socketId: socket.id,
        updatedAt: Date.now()
      });
    }

    rfidService.ingestEvent({
      event: 'card_detected',
      mode: modeState.mode,
      ...parsed.data
    });
  });

  /**
   * Evento: Cliente se desconecta.
   * @event disconnect
   */
  socket.on('disconnect', () => {
    clearRfidModeState(socket.data.userId, socket.id);
    logger.info(`Cliente desconectado: ${socket.id}`, {
      userId: socket.data.userId,
      role: socket.data.userRole
    });
  });
});

// ============================================================================
// INTEGRACIÓN CON EL SERVICIO RFID
// ============================================================================

/**
 * Manejador de eventos del servicio RFID.
 * Procesa eventos del sensor y los distribuye al sistema.
 */
rfidService.on('rfid_event', event => {
  // Métricas internas (observabilidad)
  runtimeMetrics.recordRfidEvent(event);

  // Emitir eventos RFID de forma dirigida
  const playId = event?.uid ? gameEngine.getPlayIdByCardUid(event.uid) : null;

  if (event.event === 'card_detected' && event.mode === RFID_MODES.GAMEPLAY && playId) {
    // En gameplay no exponemos UID
    io.to(`play_${playId}`).emit('rfid_event', {
      event: 'card_detected'
    });
  } else if (event.event === 'card_detected' && event.mode === RFID_MODES.CARD_ASSIGNMENT) {
    io.to('card_assignment').emit('rfid_event', event);
  } else if (event.event === 'card_detected' || event.event === 'card_removed') {
    // Registro de tarjetas (solo a room dedicada)
    io.to('card_registration').emit('rfid_event', event);
  } else {
    // Eventos de diagnóstico (init, status, error)
    io.to('admin_room').emit('rfid_event', event);
  }

  // Procesar eventos específicos según el tipo
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

/**
 * Manejador de cambios de estado del servicio RFID.
 * Notifica a los clientes sobre el estado de la conexión.
 */
rfidService.on('status', status => {
  logger.info(`Estado del servicio RFID: ${status}`); // 'connected', 'disconnected', 'reconnecting'

  // Estado RFID solo para admin_room
  io.to('admin_room').emit('rfid_status', { status });
});

// ============================================================================
// INICIALIZACIÓN Y ARRANQUE DEL SERVIDOR
// ============================================================================

const PORT = process.env.PORT || 5000;

/**
 * Inicia el servidor y todos sus servicios.
 * Conecta a MongoDB, inicia el servicio RFID y levanta el servidor HTTP.
 *
 * @async
 * @returns {Promise<void>}
 */
const startServer = async () => {
  try {
    // Conectar a la base de datos
    await connectDB();
    logger.info('Base de datos conectada');

    // Conectar a Redis
    try {
      await connectRedis();
      logger.info('Redis conectado');

      // Recuperar partidas huérfanas de un reinicio anterior
      const recoveredCount = await gameEngine.recoverActivePlays();
      if (recoveredCount > 0) {
        logger.info(`${recoveredCount} partidas recuperadas y marcadas como abandonadas`);
      }
    } catch (redisError) {
      // En desarrollo, continuar sin Redis con warning
      if (process.env.NODE_ENV === 'production') {
        throw redisError;
      }
      logger.warn('Redis no disponible, continuando sin persistencia de estado:', {
        error: redisError.message
      });
    }

    logger.info('Iniciando servicio RFID en modo cliente...');
    rfidService.start();

    // Iniciar servidor HTTP
    server.listen(PORT, () => {
      logger.info(`Servidor corriendo en el puerto ${PORT}`);
      logger.info(`Socket.io listo para conexiones`);
      logger.info(`Motor de juego inicializado`);
      logger.info(`Entorno: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error(`Error al iniciar el servidor: ${error.message}`);
    process.exit(1);
  }
};

// ============================================================================
// MANEJO DE CIERRE CONTROLADO (GRACEFUL SHUTDOWN)
// ============================================================================

/**
 * Manejador de señal SIGTERM para cierre controlado del servidor.
 * Cierra conexiones a BD, sensor RFID y servidor HTTP de forma ordenada.
 */
const gracefulShutdown = async signal => {
  logger.info(`Recibido ${signal}, cerrando el servidor de manera controlada...`);

  // 1. Detener el servidor HTTP (no acepta más conexiones)
  server.close(async () => {
    logger.info('Servidor HTTP cerrado');

    try {
      // 2. Detener el motor de juego y finalizar partidas activas
      await gameEngine.shutdown();

      // 3. Cerrar conexión RFID
      rfidService.stop();

      // 4. Desconectar de Redis
      await disconnectRedis();
      logger.info('Redis desconectado');

      // 5. Desconectar de la base de datos
      await disconnectDB();

      logger.info('Shutdown completo. Saliendo...');
      process.exit(0);
    } catch (error) {
      logger.error(`Error durante shutdown: ${error.message}`);
      process.exit(1);
    }
  });

  // Si no se cierra en 30 segundos, forzar salida
  setTimeout(() => {
    logger.error('Forzando shutdown tras timeout de 30s');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C

// Iniciar el servidor
// Iniciar el servidor solo si se ejecuta directamente
if (require.main === module) {
  startServer();
}

module.exports = { app, server, io, gameEngine };
