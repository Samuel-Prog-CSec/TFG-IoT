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
  authRateLimiter,
  initRateLimiters
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
const {
  healthCheck,
  livenessCheck,
  readinessCheck,
  getApiInfo
} = require('./controllers/healthController');
const asyncHandler = require('./utils/asyncHandler');
const { registerSocketHandlers, registerRfidHandlers, stopCacheCleanup } = require('./realtime');
const { setReady, setShuttingDown, getIsShuttingDown } = require('./utils/serverState');
const swaggerUi = require('swagger-ui-express');
const { swaggerSpec, requiresAuthForDocs } = require('./config/swagger');
const { authenticate, requireRole } = require('./middlewares/auth');

// Importar rutas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const mechanicRoutes = require('./routes/mechanics');
const contextRoutes = require('./routes/contexts');
const sessionRoutes = require('./routes/sessions');
const playRoutes = require('./routes/plays');
const deckRoutes = require('./routes/decks');
const adminRoutes = require('./routes/admin');
const metricsRoutes = require('./routes/metrics');
const analyticsRoutes = require('./routes/analytics');
const reportsRoutes = require('./routes/reports');
const healthRoutes = require('./routes/health');
const notificationRoutes = require('./routes/notifications');
const {
  adminRouter: systemAlertsAdminRouter,
  publicRouter: announcementsPublicRouter
} = require('./routes/systemAlerts');

// Crear aplicación Express
const app = express();
app.set('etag', false);

// Trust proxy en producción (Koyeb antepone un reverse proxy a cada servicio).
// Sin esto, Express ve la IP del proxy en `req.ip` y los rate limiters basados
// en IP confunden a todos los clientes con un único "atacante". En desarrollo
// se omite a propósito: confiar en `X-Forwarded-For` sin proxy real abre la
// puerta a bypass de rate limit suplantando la cabecera desde el cliente.
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const server = http.createServer(app);
server.keepAliveTimeout = Number.parseInt(process.env.KEEP_ALIVE_TIMEOUT_MS, 10) || 65000;
server.headersTimeout = Number.parseInt(process.env.HEADERS_TIMEOUT_MS, 10) || 66000;

// Inicializar Sentry
initSentry();

// Configurar Socket.io con CORS seguro
const io = new Server(server, {
  cors: corsOptions,
  // C.2 (pre-v1.0.0): bajamos pingTimeout de 60 → 30s. Liberación más rápida
  // de zombies cuando el cliente cierra pestaña sin disconnect limpio. El
  // ciclo ping cada 25s con timeout 30s deja margen razonable para redes
  // flaky escolares; el cliente tiene reconnectionAttempts:15 × 5s max delay.
  pingTimeout: 30000,
  pingInterval: 25000,
  maxHttpBufferSize: socketPayloadLimits.globalBytes, // Límite global de payload (bytes)
  transports: ['websocket', 'polling'], // Preferir WebSocket
  allowEIO3: false, // Solo usar Engine.IO v4
  // C.1 (pre-v1.0.0): compresión per-message para payloads >1KB. Reduce
  // ~70% bytes egress en `game_over` (2-3KB → 600-900B) y
  // `sequence_round_result` (1-2KB → 400-700B). Threshold 1024 deja
  // `validation_result` (<500B) sin comprimir (no compensa CPU).
  // zlibDeflateOptions.level=3 es el sweet spot CPU/ratio para JSON.
  perMessageDeflate: {
    threshold: 1024,
    zlibDeflateOptions: { level: 3 }
  }
});

// Namespace para eventos de gameplay (partidas, RFID scans, card assignment)
const gameNsp = io.of('/game');

/**
 * Instancia del motor de juego con namespace /game inyectado.
 * Gestiona todas las partidas activas del sistema.
 * @type {GameEngine}
 */
const gameEngine = new GameEngine(gameNsp);

// Rate limiting para WebSockets (instancia única compartida)
const socketRateLimiter = createSocketRateLimiter({ logger });
if (process.env.NODE_ENV !== 'test') {
  socketRateLimiter.startCleanupTimer();
}

// Exponer servicios a controllers (REST) sin imports circulares.
app.set('gameEngine', gameEngine);
app.set('io', io);
app.set('gameNsp', gameNsp);
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

// T-905 B5: Endpoint receptor de violaciones CSP (Content-Security-Policy reports).
// Se monta ANTES de auth/CSRF/middlewares pesados porque el navegador envía estos
// POST sin cookies ni headers de auth, y queremos minimizar overhead.
const cspReportRoutes = require('./routes/cspReport');
app.use('/api/csp-report', cspReportRoutes);

// T-905 B2: Política Cache-Control anti-leak para TODAS las respuestas de /api.
// Reemplaza el middleware previo que solo seteaba `Cache-Control: no-store` (evitar 304
// sin body). El nuevo añade `Pragma`, `Expires` y `Surrogate-Control: no-store` para
// reforzar la directiva en navegadores legacy, Cloudflare y proxies intermedios.
// Defensa contra data leaks por cache compartido (datos de menores, RGPD Art. 25).
const { noStoreSensitive } = require('./middlewares/cachePolicy');
app.use('/api', noStoreSensitive);

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

// noStoreSensitive ya está aplicado globalmente a /api arriba (línea ~229).

// T-905 B4: rate limits específicos se aplican dentro de routes/auth.js por endpoint
// (login/register strict 5/15min, refresh/me loose 20/15min). Aquí solo montamos.
app.use('/api/auth', authRoutes);

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

// Rutas de SystemAlerts y SystemAnnouncements para super_admin (T-942)
app.use('/api/admin', systemAlertsAdminRouter);

// Rutas de announcements públicos (listado activo para teacher)
app.use('/api/announcements', announcementsPublicRouter);

// Rutas de analíticas
app.use('/api/analytics', analyticsRoutes);

// Rutas de informes persistidos y plantillas (T-942 Fase B)
app.use('/api/reports', reportsRoutes);

// Rutas de métricas de dominio (salud RFID, etc.)
app.use('/api/metrics', metricsRoutes);

// Rutas de notificaciones tiempo real (T-955)
app.use('/api/notifications', notificationRoutes);

// OpenAPI 3.1 (ADR-146)
// - /api/openapi.json: spec descargable (siempre publico — útil para clientes generados)
// - /api/docs: UI interactiva (publica en staging, auth super_admin en produccion)
app.get('/api/openapi.json', (_req, res) => res.json(swaggerSpec));

if (requiresAuthForDocs()) {
  app.use(
    '/api/docs',
    authenticate,
    requireRole('super_admin'),
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, { customSiteTitle: 'EduPlay API — Docs' })
  );
} else {
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, { customSiteTitle: 'EduPlay API — Docs' })
  );
}

// Rutas de salud, metricas e informacion del sistema
app.use('/api', healthRoutes);

// Aliases sin prefijo /api para load balancers (Koyeb, Docker, k8s, UptimeRobot).
// /health/live se registra ANTES que /health para que la primera coincidencia
// gane y no caiga al handler general de /health (que verifica dependencias).
app.get('/health/live', validateQuery(emptyObjectSchema), livenessCheck);
app.get('/health/ready', validateQuery(emptyObjectSchema), readinessCheck);
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
  gameNsp,
  gameEngine,
  rfidService,
  socketRateLimiter,
  logger
});

// Inyectar el server Socket.IO en el notificationService para que pueda emitir
// `notification:created` al room `user_<id>` de cada destinatario (T-955).
// Antes de esta línea las llamadas a notify() persisten pero no emiten en
// tiempo real; el cliente recibe igualmente la notif al refrescar /api/notifications.
require('./services/notificationService').setSocketServer(io);

registerRfidHandlers({
  io,
  gameNsp,
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

      // Inicializar los rate limiters HTTP con Redis store distribuido.
      // Debe ocurrir DESPUÉS de connectRedis() para que createRedisStore()
      // obtenga un cliente válido (sin esto los limiters caen a MemoryStore
      // al boot y el rate-limit distribuido queda inutilizado).
      initRateLimiters();

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

      // ADR-077 (PROP-64): subscriber pub/sub de cambios RFID mode entre
      // instancias del backend. Si Redis no está, queda en no-op (modo
      // single-instance equivalente al comportamiento previo).
      try {
        const { startRfidModeSubscriber } = require('./realtime/rfidModeSubscriber');
        await startRfidModeSubscriber();
      } catch (subErr) {
        logger.warn('rfidModeSubscriber: no se pudo iniciar', { error: subErr.message });
      }

      // T-907 INT5: subscriber pub/sub de invalidaciones del LRU local
      // (auth:user / cache:mechanic / cache:context). Permite consistencia
      // cross-instance sin esperar al TTL. En single-instance es no-op útil
      // (publica al canal pero nadie escucha, coste despreciable).
      try {
        const { startCacheInvalidateSubscriber } = require('./realtime/cacheInvalidateSubscriber');
        await startCacheInvalidateSubscriber();
      } catch (subErr) {
        logger.warn('cacheInvalidateSubscriber: no se pudo iniciar', {
          error: subErr.message
        });
      }

      // ADR-071 (PROP-62): programar el cron de retención RGPD vía BullMQ.
      // El job se procesa en el contenedor `worker` (proceso separado),
      // pero el SCHEDULING vive en el backend para que esté garantizado
      // siempre que la API esté arriba. Idempotente por jobId.
      try {
        const { scheduleDataRetentionCron } = require('./queues');
        await scheduleDataRetentionCron();
      } catch (cronErr) {
        logger.warn('queues: no se pudo programar el cron de retención', {
          error: cronErr.message
        });
      }

      // T-941: programar el cron de detección de alertas inteligentes vía
      // BullMQ. El job se procesa en `worker.js` (proceso separado); el
      // scheduling vive en el backend para que esté garantizado mientras la
      // API esté arriba. Idempotente por jobId.
      try {
        const { scheduleAlertDetectionCron } = require('./queues');
        await scheduleAlertDetectionCron();
      } catch (cronErr) {
        logger.warn('queues: no se pudo programar el cron de alertas', {
          error: cronErr.message
        });
      }

      // T-942: cron de detección de SystemAlerts (super_admin). Cada 5 min
      // por defecto. Mismo patrón idempotente.
      try {
        const { scheduleSystemAlertDetectionCron } = require('./queues');
        await scheduleSystemAlertDetectionCron();
      } catch (cronErr) {
        logger.warn('queues: no se pudo programar el cron de system-alerts', {
          error: cronErr.message
        });
      }

      // T-931 (pre-v1.0.0): cron nocturno de reconciliación analytics
      // (leaderboards ZSET + studentMetrics Hash). 00:30 horario servidor.
      // El job se procesa en `worker.js`; el scheduling vive aquí.
      try {
        const { scheduleAnalyticsReconcileCron } = require('./queues');
        await scheduleAnalyticsReconcileCron();
      } catch (cronErr) {
        logger.warn('queues: no se pudo programar el cron de reconciliación analytics', {
          error: cronErr.message
        });
      }
    } catch (redisError) {
      // En desarrollo, continuar sin Redis con warning
      if (process.env.NODE_ENV === 'production') {
        throw redisError;
      }
      logger.warn('Redis no disponible, continuando sin persistencia de estado:', {
        error: redisError.message
      });
      // Inicializar los limiters igualmente para que existan; caerán a MemoryStore
      // y `recordRateLimitStoreFallback` dejará rastro en runtimeMetrics.redis.
      initRateLimiters();
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
 *
 * Secuencia (Koyeb manda SIGKILL a los 30s, terminamos en 25s):
 *   1. Marcar isReady=false e isShuttingDown=true. El probe /health/ready
 *      empieza a devolver 503 y Koyeb deja de enrutar conexiones nuevas.
 *   2. Drenar 5s (DRAIN_BEFORE_CLOSE_MS) para que los clientes en flight
 *      reciban respuesta antes de cerrar el listener.
 *   3. Emitir `server_shutdown` por Socket.IO para que los clientes ya
 *      conocidos planifiquen reconexión con backoff.
 *   4. server.close() (deja de aceptar conexiones HTTP).
 *   5. gameEngine.shutdown(), RFID stop, rfidModeSubscriber stop.
 *   6. BullMQ queues close.
 *   7. Mongoose disconnect + Redis disconnect.
 *   8. Sentry flush (best-effort 2s).
 *   9. process.exit(0).
 *
 * @param {string} signal - SIGTERM, SIGINT, uncaughtException, etc.
 */
const DRAIN_BEFORE_CLOSE_MS = 5000;
const SENTRY_FLUSH_MS = 2000;

const gracefulShutdown = async signal => {
  // Idempotente: si llegan SIGTERM y SIGINT seguidos, sólo procesa el primero.
  if (getIsShuttingDown()) {
    logger.info(`Recibido ${signal} pero ya estamos en shutdown — ignorando`);
    return;
  }
  setShuttingDown(true);
  setReady(false);

  logger.info(`Recibido ${signal}, iniciando shutdown controlado...`);

  // 1. Notificar a clientes Socket.IO antes de cerrar.
  //    Emitimos a TODOS los namespaces — los clientes reciben `server_shutdown`
  //    y planifican reconexión con backoff. Si la emisión falla (Redis adapter
  //    caído, sockets ya descolgados) lo ignoramos: el cliente reconectará
  //    igual cuando vea `disconnect`.
  try {
    io.emit('server_shutdown', { reason: signal, ts: Date.now() });
    gameNsp.emit('server_shutdown', { reason: signal, ts: Date.now() });
  } catch (notifyErr) {
    logger.warn('shutdown: error notificando a Socket.IO', { error: notifyErr.message });
  }

  // 2. Drain — esperamos a que las requests in-flight terminen antes de cerrar.
  await new Promise(resolve => setTimeout(resolve, DRAIN_BEFORE_CLOSE_MS));

  // 3. Cerrar el listener HTTP (no acepta nuevas conexiones).
  //    server.close() llama al callback cuando todas las conexiones existentes
  //    se han cerrado naturalmente. No esperamos aquí — paralelo con el resto.
  server.close(() => {
    logger.info('Servidor HTTP cerrado');
  });

  try {
    socketRateLimiter.stopCleanupTimer();
    stopCacheCleanup();

    // 4. Detener el motor de juego (cancela timers y persiste estado).
    await gameEngine.shutdown();

    // 5. Cerrar conexión RFID local.
    rfidService.stop();

    // 6a. Cerrar el subscriber pub/sub de RFID mode (si activo).
    try {
      const { stopRfidModeSubscriber } = require('./realtime/rfidModeSubscriber');
      await stopRfidModeSubscriber();
    } catch (subErr) {
      logger.warn('rfidModeSubscriber: error al cerrar', { error: subErr.message });
    }

    // 6a-bis (T-907 INT5). Cerrar el subscriber de cache:invalidate.
    try {
      const { stopCacheInvalidateSubscriber } = require('./realtime/cacheInvalidateSubscriber');
      await stopCacheInvalidateSubscriber();
    } catch (subErr) {
      logger.warn('cacheInvalidateSubscriber: error al cerrar', { error: subErr.message });
    }

    // 6b. Cerrar el server de Socket.IO. Espera a que los sockets cuelguen.
    await new Promise(resolve => {
      io.close(() => {
        logger.info('Socket.IO cerrado');
        resolve();
      });
    });

    // 7. Cerrar las queues BullMQ (libera conexiones Redis dedicadas).
    try {
      const { closeAllQueues } = require('./queues');
      await closeAllQueues();
    } catch (qErr) {
      logger.warn('queues: error al cerrar', { error: qErr.message });
    }

    // 8. Desconectar Redis.
    await disconnectRedis();
    logger.info('Redis desconectado');

    // 9. Desconectar Mongo.
    await disconnectDB();

    // 10. Flush de Sentry — best effort 2s. Si tarda más, lo dejamos.
    try {
      const { Sentry } = require('./config/sentry');
      await Sentry.flush(SENTRY_FLUSH_MS);
    } catch (sentryErr) {
      logger.warn('Sentry flush: error o timeout', { error: sentryErr.message });
    }

    logger.info('Shutdown completo. Saliendo...');
    process.exit(0);
  } catch (error) {
    logger.error(`Error durante shutdown: ${error.message}`);
    process.exit(1);
  }
};

// Timeout duro: si gracefulShutdown no termina en 25s, forzamos exit(1).
// Koyeb envía SIGKILL a los 30s; queremos terminar antes para que el log
// `process.exit(1)` se persista y Sentry capture el shutdown abortado.
const shutdownTimeoutMs = Number.parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 25000;

const installShutdownTimeout = signal => {
  setTimeout(() => {
    logger.error(`Forzando shutdown tras timeout de ${shutdownTimeoutMs}ms (signal=${signal})`);
    process.exit(1);
  }, shutdownTimeoutMs).unref();
};

process.on('SIGTERM', () => {
  installShutdownTimeout('SIGTERM');
  gracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  installShutdownTimeout('SIGINT');
  gracefulShutdown('SIGINT'); // Ctrl+C en dev
});

// ============================================================================
// MANEJO DE ERRORES NO CAPTURADOS
// ============================================================================

/**
 * Captura promesas rechazadas que no tienen .catch().
 * Registra el error y lo reporta a Sentry, pero NO termina el proceso: el
 * caller que generó la rejection ya falló localmente, el resto del proceso
 * sigue válido (práctica oficial recomendada por Node desde 2020). Matar el
 * proceso aquí causaba reinicios en cadena ante blips de Redis que degradaban
 * el servicio en vez de tolerarlos. Para fallos realmente fatales (estado
 * corrupto) existe el handler de `uncaughtException` más abajo.
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ err: reason, promise: String(promise) }, 'Unhandled Promise Rejection detectada');
  const { Sentry } = require('./config/sentry');
  Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)), {
    tags: { source: 'unhandledRejection' }
  });
});

/**
 * Captura excepciones síncronas que escapan fuera de try/catch.
 * Logea el error, lo reporta a Sentry y fuerza shutdown inmediato
 * ya que el estado del proceso puede estar corrupto.
 */
process.on('uncaughtException', error => {
  logger.fatal({ err: error }, 'Uncaught Exception detectada');
  const { Sentry } = require('./config/sentry');
  Sentry.captureException(error, {
    tags: { source: 'uncaughtException' }
  });
  // Tras uncaughtException el estado del proceso es incierto — shutdown inmediato
  // con timeout duro por si gracefulShutdown se cuelga.
  installShutdownTimeout('uncaughtException');
  gracefulShutdown('uncaughtException');
});

// Iniciar el servidor
// Iniciar el servidor solo si se ejecuta directamente
if (require.main === module) {
  startServer();
}

module.exports = { app, server, io, gameNsp, gameEngine };
