/**
 * @fileoverview T-931 (pre-v1.0.0) — Worker BullMQ para la queue
 * `analytics-reconcile`.
 *
 * Procesa los jobs `nightly-analytics-reconcile` programados por el cron
 * en `queues/index.js` (00:30 horario servidor). Cada job ejecuta
 * `materializedAnalyticsService.runFullReconciliation()`, que recalcula
 * desde Mongo:
 *   1. Los leaderboards ZSET (`leaderboard:context:*`, `leaderboard:mechanic:*`).
 *   2. Los Hash `student:metrics:<studentId>` de alumnos activos los
 *      últimos 30 días.
 *
 * Reporta drift detectado (entradas que diferían >5% del valor canónico
 * Mongo) y lo corrige en Redis con TTL fresco. La métrica
 * `t931.reconcileDriftDetected` queda visible en `/api/metrics`.
 *
 * Debe ejecutarse en el proceso separado `worker.js` para no bloquear
 * el event loop del API (las aggregations de reconciliación duran
 * decenas de segundos a minutos sobre datasets grandes).
 *
 * @module workers/analyticsReconcileWorker
 */

const { Worker } = require('bullmq');
const { QUEUE_NAMES, connection } = require('../queues');
const materializedAnalytics = require('../services/analytics/materializedAnalyticsService');
const { withJobSpan } = require('./jobSpan');
const logger = require('../utils/logger').child({ component: 'analyticsReconcileWorker' });

const KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'rfid-games:';

let worker = null;

const startAnalyticsReconcileWorker = () => {
  if (worker) {
    return worker;
  }

  const concurrency = Math.max(
    1,
    Number.parseInt(process.env.ANALYTICS_RECONCILE_WORKER_CONCURRENCY, 10) || 1
  );

  worker = new Worker(
    QUEUE_NAMES.ANALYTICS_RECONCILE,
    job =>
      withJobSpan(
        job,
        async log => {
          log.info('worker.analyticsReconcile.start');
          const result = await materializedAnalytics.runFullReconciliation();
          log.info('worker.analyticsReconcile.end', result);
          return result;
        },
        { queueName: QUEUE_NAMES.ANALYTICS_RECONCILE }
      ),
    {
      connection,
      prefix: `${KEY_PREFIX}bull`,
      concurrency
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Job analytics-reconcile falló', {
      jobId: job?.id,
      name: job?.name,
      attempts: job?.attemptsMade,
      error: err?.message,
      stack: err?.stack
    });
  });

  worker.on('error', err => {
    logger.error('Worker analytics-reconcile error', { error: err.message });
  });

  logger.info('worker.analyticsReconcile.started', { concurrency });
  return worker;
};

const stopAnalyticsReconcileWorker = async () => {
  if (!worker) {
    return;
  }
  try {
    await worker.close();
    logger.info('worker.analyticsReconcile.stopped');
  } catch (err) {
    logger.warn('worker.analyticsReconcile.stop.error', { error: err.message });
  } finally {
    worker = null;
  }
};

module.exports = {
  startAnalyticsReconcileWorker,
  stopAnalyticsReconcileWorker
};
