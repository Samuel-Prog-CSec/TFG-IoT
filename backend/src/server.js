/**
 * @fileoverview Punto de entrada principal del servidor backend.
 * Configura Express, Socket.IO, inicializa servicios y define rutas de la API REST.
 * @module server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { connectDB, disconnectDB } = require('./config/database');
const rfidService = require('./services/rfidService');
const GameEngine = require('./services/gameEngine');
const GamePlay = require('./models/GamePlay');
const GameSession = require('./models/GameSession');
const logger = require('./utils/logger');

// Importar rutas (comentadas temporalmente - por implementar)
// const cardRoutes = require('./routes/cards');
// const sessionRoutes = require('./routes/sessions');
// const playRoutes = require('./routes/plays');
// const mechanicRoutes = require('./routes/mechanics');

// Crear aplicación Express
const app = express();
const server = http.createServer(app);

// Configurar Socket.io con CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
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

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000'
}));
app.use(express.json()); // Parsear application/json
app.use(express.urlencoded({ extended: true })); // Parsear application/x-www-form-urlencoded

// Middleware de logging de requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ============================================================================
// RUTAS DE LA API REST
// ============================================================================

// Rutas comentadas temporalmente - por implementar
// app.use('/api/cards', cardRoutes);
// app.use('/api/sessions', sessionRoutes);
// app.use('/api/plays', playRoutes);
// app.use('/api/mechanics', mechanicRoutes);

/**
 * Endpoint de salud del servidor.
 * @route GET /api/health
 * @returns {Object} 200 - Estado del servidor y conexión RFID
 * @returns {string} status - 'ok' si el servidor está funcionando
 * @returns {string} timestamp - Hora actual en formato ISO
 * @returns {boolean} rfidConnected - Si el sensor RFID está conectado
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    rfidConnected: rfidService.getStatus().isConnected
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
      cards: '/api/cards',
      sessions: '/api/sessions',
      plays: '/api/plays',
      mechanics: '/api/mechanics',
      health: '/api/health'
    }
  });
});

// ============================================================================
// MANEJO DE ERRORES
// ============================================================================

// Middleware de manejo de errores no capturados
app.use((err, req, res, next) => {
  logger.error(`Error sin manejar: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
  });
});

// Manejador 404 para rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Ruta no encontrada'
  });
});

// ============================================================================
// SOCKET.IO - EVENTOS EN TIEMPO REAL
// ============================================================================

/**
 * Manejador de conexiones Socket.IO.
 * Define todos los eventos WebSocket para comunicación en tiempo real.
 */
io.on('connection', (socket) => {
  logger.info(`Cliente conectado: ${socket.id}`);

  /**
   * Evento: Cliente se une a una partida.
   * @event join_play
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida a la que unirse
   */
  socket.on('join_play', async (data) => {
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
  socket.on('leave_play', (data) => {
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
  socket.on('start_play', async (data) => {
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
  socket.on('pause_play', (data) => {
    const { playId } = data;
    gameEngine.pausePlay(playId);
  });

  /**
   * Evento: Reanudar una partida pausada.
   * @event resume_play
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida a reanudar
   */
  socket.on('resume_play', (data) => {
    const { playId } = data;
    gameEngine.resumePlay(playId);
  });

  /**
   * Evento: Solicitud manual de la siguiente ronda.
   * @event next_round
   * @param {Object} data - Datos del evento
   * @param {string} data.playId - ID de la partida
   */
  socket.on('next_round', (data) => {
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
rfidService.on('rfid_event', (event) => {
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
rfidService.on('status', (status) => {
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

    // Conectar al sensor RFID
    logger.info('Iniciando servicio RFID...');
    rfidService.connect(); // Servicio logueará por su cuenta si se conecta o no

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
// MANEJO DE CIERRE CONTROLADO
// ============================================================================

/**
 * Manejador de señal SIGTERM para cierre controlado del servidor.
 * Cierra conexiones a BD, sensor RFID y servidor HTTP de forma ordenada.
 */
process.on('SIGTERM', async () => {
  logger.info('Recibido SIGTERM, cerrando el servidor de manera controlada');

  await disconnectDB(); // Cerrar conexión a la base de datos
  rfidService.disconnect(); // Detener la reconexión al sensor RFID

  server.close(() => {
    logger.info('Servidor cerrado');
    process.exit(0);
  });
});

// Iniciar el servidor
startServer();

module.exports = { app, server, io };
