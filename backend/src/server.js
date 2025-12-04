/**
 * @fileoverview Punto de entrada principal del servidor backend.
 * Configura Express, Socket.IO, inicializa servicios y define rutas de la API REST.
 * @module server
 */

require('dotenv').config();

// Validar variables de entorno ANTES de cualquier inicialización
const { validateEnv } = require('./utils/envValidator');
validateEnv(); // Falla FAST si falta alguna configuración crítica

const express = require('express');
const cors = require('cors');
const http = require('http');
const helmet = require('helmet');
const compression = require('compression');
const { Server } = require('socket.io');
const { connectDB, disconnectDB } = require('./config/database');
const { initSentry, Sentry } = require('./config/sentry');
const {
  corsOptions,
  csrfProtection, // Middleware CSRF
  helmetOptions,
  globalRateLimiter,
  authRateLimiter,
  createResourceRateLimiter
} = require('./config/security');
const rfidService = require('./services/rfidService');
const GameEngine = require('./services/gameEngine');
const GamePlay = require('./models/GamePlay');
const GameSession = require('./models/GameSession');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { getHealthStatus } = require('./utils/healthCheck');

// Importar rutas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const cardRoutes = require('./routes/cards');
const mechanicRoutes = require('./routes/mechanics');
const contextRoutes = require('./routes/contexts');
const sessionRoutes = require('./routes/sessions');
const playRoutes = require('./routes/plays');

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
  transports: ['websocket', 'polling'], // Preferir WebSocket
  allowEIO3: false // Solo usar Engine.IO v4
});

/**
 * Instancia del motor de juego con Socket.IO inyectado.
 * Gestiona todas las partidas activas del sistema.
 * @type {GameEngine}
 */
const gameEngine = new GameEngine(io);

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

/**
 * Endpoint de salud del servidor con información detallada.
 * @route GET /api/health
 * @returns {Object} 200 - Estado completo del servidor, MongoDB y RFID
 */
app.get('/api/health', async (req, res) => {
  try {
    const healthStatus = await getHealthStatus(rfidService);
    res.json(healthStatus);
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
app.get('/api/metrics', (req, res) => {
  // Solo en desarrollo
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }

  res.json({
    timestamp: new Date().toISOString(),
    gameEngine: gameEngine.getMetrics(),
    rfidService: rfidService.getStatus()
  });
});

/**
 * Endpoint raíz de la API.
 * @route GET /
 * @returns {Object} 200 - Información general de la API
 */
app.get('/', (req, res) => {
  res.json({
    message: 'API REST de Juegos RFID',
    version: '0.1.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      cards: '/api/cards',
      mechanics: '/api/mechanics',
      contexts: '/api/contexts',
      sessions: '/api/sessions',
      plays: '/api/plays',
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
  logger.info(`Cliente conectado: ${socket.id}`);

  /**
   * Evento: Cliente se une a una partida.
   * @event join_play
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida a la que unirse
   */
  socket.on('join_play', async data => {
    const { playId } = data;
    socket.join(`play_${playId}`);
    /* TODO: Incluir información del jugador cuando exista el modelo User
    const player = await User.findById(data.playerId);
    if (player) {
      logger.info(`Socket ${socket.id} | Player ${player.name} se unió a la partida ${playId}`);
    } else {
      logger.error(`Player con ID ${data.playerId} no encontrado al unirse a la partida ${playId}`);
      socket.emit('error', { message: 'Jugador no encontrado' });
    }
    */

    logger.info(`Socket ${socket.id} se unió a la partida ${playId}`);

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
  socket.on('leave_play', data => {
    const { playId } = data;
    socket.leave(`play_${playId}`);
    logger.info(`Socket ${socket.id} abandonó la partida ${playId}`);
  });

  /**
   * Evento: Iniciar una partida.
   * @event start_play
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida a iniciar
   */
  socket.on('start_play', async data => {
    try {
      const { playId } = data;
      const play = await GamePlay.findById(playId).populate('sessionId');

      if (!play) {
        socket.emit('error', { message: 'Partida no encontrada' });
        return;
      }

      const session = play.sessionId;
      gameEngine.startPlay(play, session);

      logger.info(`Partida comenzada: ${playId}`);
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
  socket.on('pause_play', data => {
    const { playId } = data;
    gameEngine.pausePlay(playId);
  });

  /**
   * Evento: Reanudar una partida pausada.
   * @event resume_play
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida a reanudar
   */
  socket.on('resume_play', data => {
    const { playId } = data;
    gameEngine.resumePlay(playId);
  });

  /**
   * Evento: Solicitud manual de la siguiente ronda.
   * @event next_round
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida
   */
  socket.on('next_round', data => {
    const { playId } = data;
    gameEngine.sendNextRound(playId);
  });

  /**
   * Evento: Cliente se desconecta.
   * @event disconnect
   */
  socket.on('disconnect', () => {
    logger.info(`Cliente desconectado: ${socket.id}`);
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
  // Enviar el evento a todos los clientes conectados (para la UI)
  io.emit('rfid_event', event);

  // Procesar eventos específicos según el tipo
  switch (event.event) {
    case 'init':
      logger.info(`Sensor RFID inicializado: ${event.status} (v${event.version})`);
      break;
    case 'card_detected':
      logger.info(`Tarjeta detectada: ${event.uid} (${event.type})`);
      gameEngine.handleCardScan(event.uid, event.type);
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

  // Enviar el estado a todos los clientes (para actualización en la UI)
  io.emit('rfid_status', { status });
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

    // Conectar al sensor RFID (solo si está habilitado)
    const rfidEnabled = process.env.RFID_ENABLED !== 'false';
    if (rfidEnabled) {
      logger.info('Iniciando servicio RFID...');
      rfidService.connect(); // Servicio logueará por su cuenta si se conecta o no
    } else {
      logger.info('Servicio RFID deshabilitado (RFID_ENABLED=false)');
    }

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
      rfidService.disconnect();

      // 4. Desconectar de la base de datos
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
startServer();

module.exports = { app, server, io };
