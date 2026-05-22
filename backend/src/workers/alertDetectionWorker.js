/**
 * @fileoverview Worker BullMQ para la queue `alert-detection` (T-941).
 *
 * Procesa los jobs `periodic-alert-detection` programados por el cron en
 * `queues/index.js` (cada 15 min por defecto). Cada job ejecuta
 * `alertDetectionService.runForAllTeachers()`, que itera todos los docentes
 * activos en batches y produce/actualiza/resuelve SmartAlerts.
 *
 * El worker debe ejecutarse en el proceso separado `worker.js` para que un
 * job pesado no bloquee las peticiones HTTP del backend (igual que
 * `dataRetentionWorker`).
 *
 * @module workers/alertDetectionWorker
 */

const { Worker } = require('bullmq');
const { QUEUE_NAMES, connection } = require('../queues');
const alertDetectionService = require('../services/analytics/alertDetectionService');
const { withJobSpan } = require('./jobSpan');
const logger = require('../utils/logger').child({ component: 'alertDetectionWorker' });

const KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'rfid-games:';

let worker = null;

const startAlertDetectionWorker = () => {
  if (worker) {
    return worker;
  }

  const concurrency = Math.max(
    1,
    Number.parseInt(process.env.ALERT_DETECTION_WORKER_CONCURRENCY, 10) || 1
  );

  worker = new Worker(
    QUEUE_NAMES.ALERT_DETECTION,
    job =>
      withJobSpan(
        job,
        async log => {
          log.info('worker.alertDetection.start');

          // Job estándar: detectar para todos los teachers. Si en el futuro se
          // quisieran lanzar jobs ad-hoc por teacher (ej. desde un endpoint admin),
          // este worker los soporta inspeccionando `job.data.teacherId`.
          const targetTeacher = job.data?.teacherId || null;
          const result = targetTeacher
            ? await alertDetectionService.runForTeacher(targetTeacher, {
                dryRun: !!job.data?.dryRun
              })
            : await alertDetectionService.runForAllTeachers({
                dryRun: !!job.data?.dryRun
              });

          log.info('worker.alertDetection.end', { targetTeacher, result });
          return result;
        },
        { queueName: QUEUE_NAMES.ALERT_DETECTION }
      ),
    {
      connection,
      prefix: `${KEY_PREFIX}bull`,
      concurrency
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Job alert-detection falló', {
      jobId: job?.id,
      name: job?.name,
      attempts: job?.attemptsMade,
      error: err?.message,
      stack: err?.stack
    });
  });

  worker.on('error', err => {
    logger.error('Worker alert-detection error', { error: err.message });
  });

  logger.info('Worker alert-detection iniciado', { concurrency });
  return worker;
};

const stopAlertDetectionWorker = async () => {
  if (!worker) {
    return;
  }
  try {
    await worker.close();
    logger.info('Worker alert-detection cerrado');
  } catch (err) {
    logger.warn('Worker alert-detection: error al cerrar', { error: err.message });
  } finally {
    worker = null;
  }
};

module.exports = {
  startAlertDetectionWorker,
  stopAlertDetectionWorker,
  getWorkerInstance: () => worker
};
