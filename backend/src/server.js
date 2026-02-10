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
const { randomUUID } = require('node:crypto');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const { Server } = require('socket.io');
const { connectDB, disconnectDB } = require('./config/database');
const { connectRedis, disconnectRedis } = require('./config/redis');
const { initSentry, Sentry } = require('./config/sentry');
const { socketPayloadLimits } = require('./config/socketRateLimits');
const {
  corsOptions,
  ensureCsrfCookie,
  csrfProtection, // Middleware CSRF
  helmetOptions,
  globalRateLimiter,
  authRateLimiter
} = require('./config/security');
const rfidService = require('./services/rfidService');
const GameEngine = require('./services/gameEngine');
const logger = require('./utils/logger');
const { authenticate, requireRole } = require('./middlewares/auth');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { createSocketRateLimiter } = require('./middlewares/socketRateLimiter');
const { getHealthStatus } = require('./utils/healthCheck');
const runtimeMetrics = require('./utils/runtimeMetrics');
const { toSystemMetricsDTOV1 } = require('./utils/dtos');
const { validateQuery } = require('./middlewares/validation');
const { emptyObjectSchema } = require('./validators/commonValidator');
const { registerSocketHandlers, registerRfidHandlers } = require('./realtime');

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
if (process.env.NODE_ENV !== 'test') {
  socketRateLimiter.startCleanupTimer();
}

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

// Cookies (necesarias para CSRF/refresh cookies)
app.use(cookieParser());

// Asegurar cookie CSRF antes de validar
app.use(ensureCsrfCookie);

// CSRF Protection para métodos que modifican datos
app.use(csrfProtection);

app.use(express.json()); // Parsear application/json
app.use(express.urlencoded({ extended: true })); // Parsear application/x-www-form-urlencoded

const httpLogSampleRate = Math.min(
  Math.max(Number.parseFloat(process.env.LOG_SAMPLE_RATE || '1'), 0),
  1
);

const shouldSampleHttpLog = () => httpLogSampleRate >= 1 || Math.random() < httpLogSampleRate;

// Middleware de logging HTTP (Pino)
app.use(
  pinoHttp({
    logger,
    genReqId: req => req.headers['x-request-id'] || randomUUID(),
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) {
        return 'error';
      }
      if (res.statusCode >= 400) {
        return 'warn';
      }
      if (!shouldSampleHttpLog()) {
        return 'silent';
      }
      return 'info';
    },
    customProps: req => ({
      requestId: req.id,
      userId: req.user?._id?.toString(),
      userRole: req.user?.role
    }),
    autoLogging: {
      ignore: req => req.url === '/health' || req.url === '/api/health'
    }
  })
);

// Exponer request id para trazabilidad
app.use((req, res, next) => {
  if (req.id) {
    res.setHeader('x-request-id', req.id);
  }
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

registerSocketHandlers({
  io,
  gameEngine,
  rfidService,
  socketRateLimiter,
  logger
});

registerRfidHandlers({
  io,
  gameEngine,
  rfidService,
  logger
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
      socketRateLimiter.stopCleanupTimer();

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
