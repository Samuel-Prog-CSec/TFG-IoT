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
 * y desconecta Redis y Mongo. Sentry recibe un flush best-effort antes del
 * exit para no perder eventos del último minuto.
 *
 * Hay un timeout duro de 25s desde la primera señal hasta `exit(1)` — Koyeb
 * envía SIGKILL a los 30s, terminamos antes para no perder log/Sentry.
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
const { initSentry } = require('./src/config/sentry');
const logger = require('./src/utils/logger').child({ component: 'worker.js' });

const SHUTDOWN_TIMEOUT_MS = Number.parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 25000;
const SENTRY_FLUSH_MS = 2000;

let shuttingDown = false;

const start = async () => {
  logger.info('=== Worker BullMQ iniciando ===', {
    nodeEnv: process.env.NODE_ENV || 'development',
    appEnv: process.env.APP_ENV || 'development',
    pid: process.pid,
    hostname: process.env.HOSTNAME || require('node:os').hostname()
  });

  // Sentry primero para capturar errores del propio start().
  initSentry();

  await connectDB();
  logger.info('Worker: Mongo conectado');

  await connectRedis();
  logger.info('Worker: Redis conectado');

  startAllWorkers();
  logger.info('Worker: listo para procesar jobs');
};

const installShutdownTimeout = signal => {
  setTimeout(() => {
    logger.error(
      `Worker: forzando exit tras timeout de ${SHUTDOWN_TIMEOUT_MS}ms (signal=${signal})`
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
};

const gracefulShutdown = async signal => {
  if (shuttingDown) {
    logger.info(`Worker: ${signal} recibido pero ya estamos en shutdown — ignorando`);
    return;
  }
  shuttingDown = true;
  logger.info(`Worker: ${signal} recibido, cerrando ordenadamente...`);

  try {
    // 1. Cerrar workers — BullMQ espera a que los jobs en curso terminen.
    //    Como concurrency es 1 (data-retention), normalmente termina <5s.
    //    Si el job tarda más que SHUTDOWN_TIMEOUT_MS, el timeout duro arriba
    //    fuerza exit(1) y BullMQ reintentará el job en otro worker tras el lock TTL.
    await stopAllWorkers();

    // 2. Cerrar queues (libera conexiones Redis dedicadas).
    await closeAllQueues();

    // 3. Desconectar Redis y Mongo.
    await disconnectRedis();
    await disconnectDB();

    // 4. Sentry flush — best-effort, no bloqueamos el exit si tarda.
    try {
      const { Sentry } = require('./src/config/sentry');
      await Sentry.flush(SENTRY_FLUSH_MS);
    } catch (sentryErr) {
      logger.warn('Worker: Sentry flush falló', { error: sentryErr.message });
    }

    logger.info('Worker: shutdown completo');
    process.exit(0);
  } catch (err) {
    logger.error('Worker: error en shutdown', { error: err.message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => {
  installShutdownTimeout('SIGTERM');
  gracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  installShutdownTimeout('SIGINT');
  gracefulShutdown('SIGINT');
});

process.on('uncaughtException', err => {
  logger.error('Worker: uncaughtException', { error: err.message, stack: err.stack });
  installShutdownTimeout('uncaughtException');
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', reason => {
  // No matamos el proceso por una rejection — el job que la generó ya falló
  // localmente y BullMQ lo retomará. Sólo dejamos rastro y seguimos.
  logger.error('Worker: unhandledRejection', { reason: String(reason) });
  try {
    const { Sentry } = require('./src/config/sentry');
    Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)), {
      tags: { source: 'unhandledRejection', component: 'worker' }
    });
  } catch {
    // Sentry no disponible — log es suficiente
  }
});

start().catch(err => {
  logger.error('Worker: fallo al iniciar', { error: err.message, stack: err.stack });
  process.exit(1);
});
