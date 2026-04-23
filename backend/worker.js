/**
 * @fileoverview Entry-point del proceso worker BullMQ (ADR-071, PROP-62).
 *
 * Arranca:
 *   1. Conexión Mongo (los workers la necesitan para los jobs RGPD).
 *   2. Conexión Redis (para BullMQ).
 *   3. Todos los workers registrados en `src/workers/index.js`.
 *
 * Maneja SIGTERM/SIGINT para cerrar limpiamente: termina los jobs en curso
 * (BullMQ espera hasta `concurrency` jobs activos antes de cerrar el worker)
 * y desconecta Redis y Mongo.
 *
 * Uso:
 *   node worker.js              # producción
 *   npm run worker:dev          # desarrollo con nodemon
 *
 * Docker Compose levanta este proceso como servicio independiente del backend.
 */

require('dotenv').config();

const { connectDB, disconnectDB } = require('./src/config/database');
const { connectRedis, disconnectRedis } = require('./src/config/redis');
const { startAllWorkers, stopAllWorkers } = require('./src/workers');
const { closeAllQueues } = require('./src/queues');
const logger = require('./src/utils/logger').child({ component: 'worker.js' });

let shuttingDown = false;

const start = async () => {
  logger.info('=== Worker BullMQ iniciando ===', {
    nodeEnv: process.env.NODE_ENV || 'development',
    pid: process.pid,
    hostname: process.env.HOSTNAME || require('node:os').hostname()
  });

  await connectDB();
  logger.info('Worker: Mongo conectado');

  await connectRedis();
  logger.info('Worker: Redis conectado');

  startAllWorkers();
  logger.info('Worker: listo para procesar jobs');
};

const gracefulShutdown = async signal => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info(`Worker: ${signal} recibido, cerrando ordenadamente...`);

  try {
    await stopAllWorkers();
    await closeAllQueues();
    await disconnectRedis();
    await disconnectDB();
    logger.info('Worker: shutdown completo');
    process.exit(0);
  } catch (err) {
    logger.error('Worker: error en shutdown', { error: err.message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', err => {
  logger.error('Worker: uncaughtException', { error: err.message, stack: err.stack });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', reason => {
  logger.error('Worker: unhandledRejection', { reason: String(reason) });
});

start().catch(err => {
  logger.error('Worker: fallo al iniciar', { error: err.message, stack: err.stack });
  process.exit(1);
});
