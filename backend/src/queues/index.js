/**
 * @fileoverview Registro central de queues BullMQ (ADR-071, PROP-62).
 *
 * BullMQ usa Redis para coordinar productores y consumidores. Compartimos la
 * misma URL Redis del cluster (`REDIS_URL`) pero con un cliente DEDICADO en
 * lugar del singleton `getRedis()` — BullMQ requiere `maxRetriesPerRequest:
 * null` y modo `enableReadyCheck: false`, conflictivos con el cliente de
 * cache/lock distribuido.
 *
 * Las queues registradas hoy:
 *   - `data-retention` (ACTIVA) — programada cada noche, ejecuta el ciclo
 *     RGPD (anonimizar GamePlays >12m, borrar estudiantes inactivos >24m).
 *   - `gdpr-exports` (SCAFFOLD) — vacía. Pendiente de implementar generación
 *     de ZIP + signed URL Supabase + email (sin email backend hoy).
 *   - `notifications` (SCAFFOLD) — vacía. Para futuros notification jobs.
 *
 * @module queues
 */

const { Queue } = require('bullmq');
const logger = require('../utils/logger').child({ component: 'queues' });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'rfid-games:';

/** Conexión Redis dedicada para BullMQ. No reutilizar getRedis() — requiere flags distintos. */
const buildBullConnection = () => {
  const url = new URL(REDIS_URL);
  return {
    host: url.hostname || 'localhost',
    port: Number.parseInt(url.port, 10) || 6379,
    password: url.password || process.env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.REDIS_DB, 10) || 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  };
};

const connection = buildBullConnection();

/** Opciones por defecto: limpiar jobs viejos para evitar crecimiento ilimitado de Redis. */
const defaultJobOptions = {
  removeOnComplete: { age: 86400, count: 1000 }, // 24h o 1000 jobs
  removeOnFail: { age: 604800, count: 5000 } // 7d o 5000 jobs
};

const QUEUE_NAMES = Object.freeze({
  DATA_RETENTION: 'data-retention',
  GDPR_EXPORTS: 'gdpr-exports',
  NOTIFICATIONS: 'notifications'
});

const dataRetentionQueue = new Queue(QUEUE_NAMES.DATA_RETENTION, {
  connection,
  prefix: `${KEY_PREFIX}bull`,
  defaultJobOptions
});

const gdprExportsQueue = new Queue(QUEUE_NAMES.GDPR_EXPORTS, {
  connection,
  prefix: `${KEY_PREFIX}bull`,
  defaultJobOptions
});

const notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, {
  connection,
  prefix: `${KEY_PREFIX}bull`,
  defaultJobOptions
});

const allQueues = [dataRetentionQueue, gdprExportsQueue, notificationsQueue];

/**
 * Programa el cron diario de retención de datos. Idempotente: usar siempre el
 * mismo `jobId` evita duplicados aunque el backend reinicie.
 *
 * Patrón: cada noche a las 03:00 (zona del servidor).
 *
 * @returns {Promise<void>}
 */
const scheduleDataRetentionCron = async () => {
  try {
    await dataRetentionQueue.add(
      'daily-retention',
      { triggeredAt: new Date().toISOString() },
      {
        jobId: 'daily-retention-cron',
        repeat: { pattern: '0 3 * * *' }
      }
    );
    logger.info('queues: cron diario de retención programado (03:00)');
  } catch (err) {
    logger.warn('queues: no se pudo programar el cron de retención', { error: err.message });
  }
};

/**
 * Cierra todas las queues. Llamado en gracefulShutdown.
 *
 * @returns {Promise<void>}
 */
const closeAllQueues = async () => {
  for (const queue of allQueues) {
    try {
      await queue.close();
    } catch (err) {
      logger.warn('queues: error al cerrar queue', { name: queue.name, error: err.message });
    }
  }
};

module.exports = {
  QUEUE_NAMES,
  connection,
  defaultJobOptions,
  dataRetentionQueue,
  gdprExportsQueue,
  notificationsQueue,
  scheduleDataRetentionCron,
  closeAllQueues
};
