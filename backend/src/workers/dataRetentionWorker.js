/**
 * @fileoverview Worker BullMQ para la queue `data-retention` (ADR-071).
 *
 * Procesa jobs `daily-retention` (programados por el cron en queues/index.js)
 * y, si hace falta, jobs ad-hoc lanzados manualmente desde scripts o el panel
 * admin.
 *
 * El worker debe ejecutarse en un proceso separado (`worker.js`) para que un
 * job pesado no bloquee las peticiones HTTP del backend.
 *
 * @module workers/dataRetentionWorker
 */

const { Worker } = require('bullmq');
const { QUEUE_NAMES, connection } = require('../queues');
const { runDataRetention } = require('../services/dataRetentionService');
const logger = require('../utils/logger').child({ component: 'dataRetentionWorker' });

const KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'rfid-games:';

let worker = null;

/**
 * Arranca el worker. Idempotente.
 *
 * @returns {Worker}
 */
const startDataRetentionWorker = () => {
  if (worker) {
    return worker;
  }

  worker = new Worker(
    QUEUE_NAMES.DATA_RETENTION,
    async job => {
      logger.info('Ejecutando job de retención de datos', {
        jobId: job.id,
        name: job.name,
        attempts: job.attemptsMade
      });

      const dryRun = job.data?.dryRun === true;
      const summary = await runDataRetention({ dryRun });

      logger.info('Job de retención completado', { jobId: job.id, summary });
      return summary;
    },
    {
      connection,
      prefix: `${KEY_PREFIX}bull`,
      concurrency: 1
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Job data-retention falló', {
      jobId: job?.id,
      name: job?.name,
      attempts: job?.attemptsMade,
      error: err?.message,
      stack: err?.stack
    });
  });

  worker.on('error', err => {
    logger.error('Worker data-retention error', { error: err.message });
  });

  logger.info('Worker data-retention iniciado');
  return worker;
};

/**
 * Cierra el worker de forma segura.
 *
 * @returns {Promise<void>}
 */
const stopDataRetentionWorker = async () => {
  if (!worker) {
    return;
  }
  try {
    await worker.close();
    logger.info('Worker data-retention cerrado');
  } catch (err) {
    logger.warn('Worker data-retention: error al cerrar', { error: err.message });
  } finally {
    worker = null;
  }
};

module.exports = {
  startDataRetentionWorker,
  stopDataRetentionWorker,
  getWorkerInstance: () => worker
};
