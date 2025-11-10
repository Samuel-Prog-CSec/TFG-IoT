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

// Import routes
const cardRoutes = require('./routes/cards');
const sessionRoutes = require('./routes/sessions');
const playRoutes = require('./routes/plays');
const mechanicRoutes = require('./routes/mechanics');

// Crear app de Express
const app = express();
const server = http.createServer(app);

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Inicializar GameEngine
const gameEngine = new GameEngine(io);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000'
}));
app.use(express.json()); // Para parsear application/json
app.use(express.urlencoded({ extended: true })); // Para parsear application/x-www-form-urlencoded

// Middleware de requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Rutas de la API REST
app.use('/api/cards', cardRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/plays', playRoutes);
app.use('/api/mechanics', mechanicRoutes);

// Endpoint para checkear estado del servidor
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    rfidConnected: rfidService.getStatus().isConnected
  });
});

// Endpoint raíz
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

// Middleware de manejo de errores
app.use((err, req, res, next) => {
  logger.error(`Error sin manejar: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
  });
});

// Manejador 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Ruta no encontrada'
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info(`Cliente conectado: ${socket.id}`);

  // Unirse a la partida
  socket.on('join_play', async (data) => {
    const { playId } = data;
    socket.join(`play_${playId}`);
    /* TODO: Incluir información del jugador cuando esté creado el modelo User
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

  // Abandonar partida
  socket.on('leave_play', (data) => {
    const { playId } = data;
    socket.leave(`play_${playId}`);
    logger.info(`Socket ${socket.id} abandonó la partida ${playId}`);
  });

  // Iniciar partida
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

  // Pausar partida
  socket.on('pause_play', (data) => {
    const { playId } = data;
    gameEngine.pausePlay(playId);
  });

  // Partida reanudada
  socket.on('resume_play', (data) => {
    const { playId } = data;
    gameEngine.resumePlay(playId);
  });

  // Solicitud de siguiente ronda
  socket.on('next_round', (data) => {
    const { playId } = data;
    gameEngine.sendNextRound(playId);
  });

  // Desconexión del cliente
  socket.on('disconnect', () => {
    logger.info(`Cliente desconectado: ${socket.id}`);
  });
});

// Manejo de eventos del servicio RFID
// Nos suscribimos al evento 'rfid_event' que emite el servicio
rfidService.on('rfid_event', (event) => {
  // Enviar el evento a todos los clientes conectados (para la UI)
  io.emit('rfid_event', event);

  // Manejar eventos específicos
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

// Escuchar los cambios de estado
rfidService.on('status', (status) => {
  logger.info(`Estado del servicio RFID: ${status}`); // 'connected', 'disconnected', 'reconnecting'

  // Enviar el estado a todos los clientes (para la UI)
  io.emit('rfid_status', { status });
});

// Inicialización del servidor
const PORT = process.env.PORT || 5000;

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

// Manejo de shutdown
process.on('SIGTERM', async () => {
  logger.info('Recibido SIGTERM, cerrando el servidor de manera controlada');

  await disconnectDB(); // Cerrar conexión a la base de datos
  rfidService.disconnect(); // Detener la reconexión al sensor RFID

  server.close(() => {
    logger.info('Servidor cerrado');
    process.exit(0);
  });
});

// Start the server
startServer();

module.exports = { app, server, io };
