/**
 * @fileoverview Helper de instrumentación para handlers de jobs BullMQ
 * (T-904 Fase A). Envuelve la ejecución del job en un `Sentry.startSpan`
 * con atributos estandarizados (jobName, jobId, queueName, attempts) y
 * añade un child logger con esos mismos campos para correlación con
 * los logs en Grafana Cloud Loki.
 *
 * Uso típico desde dentro de un Worker BullMQ:
 *
 *   const worker = new Worker(QUEUE_NAME, async job => withJobSpan(job, async (log) => {
 *     // lógica del job, log es un child logger con jobName/jobId
 *   }));
 *
 * @module workers/jobSpan
 */

const Sentry = require('@sentry/node');
const logger = require('../utils/logger');

/**
 * Wrappper que crea span Sentry + child logger por job.
 *
 * @param {import('bullmq').Job} job Instancia del job que se está procesando.
 * @param {(log: import('pino').Logger) => Promise<any>} handler Handler real.
 * @param {Object} [options]
 * @param {string} [options.queueName] Override del label `queue`. Si no se
 *   pasa, se intenta inferir desde `job.queueName` (BullMQ moderno).
 * @returns {Promise<any>}
 */
async function withJobSpan(job, handler, { queueName } = {}) {
  const effectiveQueue = queueName || job?.queueName || 'unknown';
  const jobName = job?.name || 'unnamed';
  const jobId = job?.id ? String(job.id) : null;
  const attempts = job?.attemptsMade ?? 0;

  const childLogger = logger.child({
    component: `worker.${effectiveQueue}`,
    jobName,
    jobId,
    queueName: effectiveQueue,
    attempts
  });

  return Sentry.startSpan(
    {
      name: `queue.${effectiveQueue}.${jobName}`,
      op: 'queue.job',
      attributes: {
        'queue.name': effectiveQueue,
        'queue.job.name': jobName,
        'queue.job.id': jobId,
        'queue.job.attempts': attempts
      }
    },
    () => handler(childLogger)
  );
}

module.exports = {
  withJobSpan
};
