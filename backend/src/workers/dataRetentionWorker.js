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
const { withJobSpan } = require('./jobSpan');
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

  // T-907 INT4: concurrency configurable. Si está activo el sharding
  // (`DATA_RETENTION_SHARDS > 1`), normalmente conviene subir esto a igual
  // valor para que el mismo proceso worker procese los N shards en paralelo.
  // Default 1 para no cambiar el comportamiento existente.
  const concurrency = Math.max(
    1,
    Number.parseInt(process.env.DATA_RETENTION_WORKER_CONCURRENCY, 10) || 1
  );

  worker = new Worker(
    QUEUE_NAMES.DATA_RETENTION,
    job =>
      // T-904: span por job + child logger correlable en Loki (LogQL puede
      // filtrar por jobId/jobName para forensics de un job concreto).
      withJobSpan(
        job,
        async log => {
          log.info('Ejecutando job de retención de datos', {
            shardIndex: job.data?.shardIndex ?? null,
            shardCount: job.data?.shardCount ?? null
          });

          const dryRun = job.data?.dryRun === true;
          // T-907 INT4: si el job viene con windowStart/windowEnd (shard), se
          // pasan al service para que filtre el subset temporal correspondiente.
          const windowStart = job.data?.windowStart ? new Date(job.data.windowStart) : null;
          const windowEnd = job.data?.windowEnd ? new Date(job.data.windowEnd) : null;
          const summary = await runDataRetention({
            dryRun,
            windowStart,
            windowEnd,
            shardIndex: job.data?.shardIndex ?? null,
            shardCount: job.data?.shardCount ?? null
          });

          log.info('Job de retención completado', { summary });
          // T-942: marcar timestamp para el detector `data_retention_lag` del
          // sistema de SystemAlerts. Persistimos en Redis para compartirlo entre
          // el proceso worker y el backend HTTP (lazy require para evitar ciclos).
          try {
            const redisService = require('../services/redisService');
            // setWithTTL (30d) en vez de set sin expiry: la key se refresca en
            // cada corrida (cadencia diaria), así que el TTL solo la recoge si el
            // job deja de ejecutarse — justo el caso que el detector
            // `data_retention_lag` quiere señalar (lee null → lag). Evita una key
            // permanente (convención del proyecto: toda key con TTL).
            await redisService.setWithTTL(
              'system:meta',
              'lastRetentionRun',
              new Date().toISOString(),
              30 * 24 * 60 * 60
            );
          } catch {
            // No bloquea el job.
          }
          return summary;
        },
        { queueName: QUEUE_NAMES.DATA_RETENTION }
      ),
    {
      connection,
      prefix: `${KEY_PREFIX}bull`,
      concurrency
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
