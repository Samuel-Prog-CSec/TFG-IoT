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
const hpp = require('hpp');
const pinoHttp = require('pino-http');
const { Server } = require('socket.io');
const { connectDB, disconnectDB } = require('./config/database');
const { connectRedis, disconnectRedis } = require('./config/redis');
const { initSentry, setupSentryErrorHandler } = require('./config/sentry');
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
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { createSocketRateLimiter } = require('./middlewares/socketRateLimiter');
const { securityPayloadGuard } = require('./middlewares/securityPayloadGuard');
const runtimeMetrics = require('./utils/runtimeMetrics');
const { validateQuery } = require('./middlewares/validation');
const { emptyObjectSchema } = require('./validators/commonValidator');
const { healthCheck, getApiInfo } = require('./controllers/healthController');
const asyncHandler = require('./utils/asyncHandler');
const { registerSocketHandlers, registerRfidHandlers, stopCacheCleanup } = require('./realtime');

// Importar rutas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const mechanicRoutes = require('./routes/mechanics');
const contextRoutes = require('./routes/contexts');
const sessionRoutes = require('./routes/sessions');
const playRoutes = require('./routes/plays');
const deckRoutes = require('./routes/decks');
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analytics');
const healthRoutes = require('./routes/health');

// Crear aplicación Express
const app = express();
app.set('etag', false);
const server = http.createServer(app);
server.keepAliveTimeout = Number.parseInt(process.env.KEEP_ALIVE_TIMEOUT_MS, 10) || 65000;
server.headersTimeout = Number.parseInt(process.env.HEADERS_TIMEOUT_MS, 10) || 66000;

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

// Exponer servicios a controllers (REST) sin imports circulares.
app.set('gameEngine', gameEngine);
app.set('io', io);
app.set('rfidService', rfidService);
app.set('runtimeMetrics', runtimeMetrics);

// ============================================================================
// MIDDLEWARE
// ============================================================================

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

// CORS con whitelist dinámica
app.use(cors(corsOptions));

// Rate limiting global (todas las rutas /api/*)
app.use('/api/', globalRateLimiter);

// Cookies (necesarias para CSRF/refresh cookies)
app.use(cookieParser());

// Asegurar cookie CSRF antes de validar
app.use(ensureCsrfCookie);

// CSRF Protection para métodos que modifican datos
app.use(csrfProtection);

app.use(express.json({ limit: '100kb' })); // Parsear application/json (límite explícito)
app.use(express.urlencoded({ extended: true, limit: '100kb' })); // Parsear application/x-www-form-urlencoded

// HPP: prevenir HTTP Parameter Pollution (arrays inesperados en query params)
app.use(hpp());

// Permissions-Policy: restringir APIs del navegador innecesarias
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(self)'
  );
  next();
});

// Hardening anti prototype-pollution / NoSQL operators antes de validadores de rutas
app.use(securityPayloadGuard);

const httpLogSampleRate = Math.min(
  Math.max(Number.parseFloat(process.env.LOG_SAMPLE_RATE || '1'), 0),
  1
);

// eslint-disable-next-line sonarjs/pseudo-random -- safe: log sampling does not require CSPRNG
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
      // Usar originalUrl (no url) para que funcione con rutas montadas en routers
      ignore: req => req.originalUrl === '/health' || req.originalUrl === '/api/health'
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

// Evitar cache en respuestas de la API para prevenir 304 sin body
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
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

// Rutas de salud, metricas e informacion del sistema
app.use('/api', healthRoutes);

// Alias /health sin prefijo /api (Docker, k8s, load balancers)
app.get('/health', validateQuery(emptyObjectSchema), asyncHandler(healthCheck));

// Endpoint raiz de la API
app.get('/', validateQuery(emptyObjectSchema), getApiInfo);

// ============================================================================
// MANEJO DE ERRORES
// ============================================================================

// Sentry error handler (ANTES del errorHandler personalizado)
setupSentryErrorHandler(app);

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

      // Configurar Socket.IO Redis adapter para escalabilidad horizontal
      try {
        const { isRedisConnected, getRedis } = require('./config/redis');
        if (isRedisConnected()) {
          const { createAdapter } = require('@socket.io/redis-adapter');
          const redisClient = getRedis();
          const pubClient = redisClient.duplicate();
          const subClient = redisClient.duplicate();
          io.adapter(createAdapter(pubClient, subClient));
          logger.info('Socket.IO Redis adapter configurado para escalabilidad horizontal');
        }
      } catch (adapterError) {
        logger.warn(
          'No se pudo configurar Socket.IO Redis adapter (continuando con adapter in-memory):',
          {
            error: adapterError.message
          }
        );
      }

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
      stopCacheCleanup();

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

  const shutdownTimeoutMs = Number.parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 30000;
  setTimeout(() => {
    logger.error(`Forzando shutdown tras timeout de ${shutdownTimeoutMs}ms`);
    process.exit(1);
  }, shutdownTimeoutMs);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C

// Iniciar el servidor
// Iniciar el servidor solo si se ejecuta directamente
if (require.main === module) {
  startServer();
}

module.exports = { app, server, io, gameEngine };
