/**
 * @fileoverview Worker BullMQ para la queue `system-alert-detection` (T-942).
 *
 * @module workers/systemAlertDetectionWorker
 */

const { Worker } = require('bullmq');
const { QUEUE_NAMES, connection } = require('../queues');
const systemAlertDetectionService = require('../services/analytics/systemAlertDetectionService');
const { SYSTEM_DETECTION_CONFIG } = require('../config/systemAlerts');
const logger = require('../utils/logger').child({ component: 'systemAlertDetectionWorker' });

const KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'rfid-games:';

let worker = null;

const startSystemAlertDetectionWorker = () => {
  if (worker) {
    return worker;
  }

  worker = new Worker(
    QUEUE_NAMES.SYSTEM_ALERT_DETECTION,
    async job => {
      logger.info('worker.systemAlertDetection.start', {
        jobId: job.id,
        name: job.name,
        attempts: job.attemptsMade
      });
      const result = await systemAlertDetectionService.runDetection({
        dryRun: !!job.data?.dryRun
      });
      logger.info('worker.systemAlertDetection.end', { jobId: job.id, result });
      return result;
    },
    {
      connection,
      prefix: `${KEY_PREFIX}bull`,
      concurrency: SYSTEM_DETECTION_CONFIG.workerConcurrency
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Job system-alert-detection falló', {
      jobId: job?.id,
      name: job?.name,
      attempts: job?.attemptsMade,
      error: err?.message,
      stack: err?.stack
    });
  });

  worker.on('error', err => {
    logger.error('Worker system-alert-detection error', { error: err.message });
  });

  logger.info('Worker system-alert-detection iniciado', {
    concurrency: SYSTEM_DETECTION_CONFIG.workerConcurrency
  });
  return worker;
};

const stopSystemAlertDetectionWorker = async () => {
  if (!worker) {
    return;
  }
  try {
    await worker.close();
    logger.info('Worker system-alert-detection cerrado');
  } catch (err) {
    logger.warn('Worker system-alert-detection: error al cerrar', { error: err.message });
  } finally {
    worker = null;
  }
};

module.exports = {
  startSystemAlertDetectionWorker,
  stopSystemAlertDetectionWorker,
  getWorkerInstance: () => worker
};
