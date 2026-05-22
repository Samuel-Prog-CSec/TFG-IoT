/**
 * @fileoverview Arranque centralizado de workers BullMQ (ADR-071, PROP-62).
 *
 * Este módulo se importa SOLO desde `worker.js` (el entry-point del proceso
 * worker), nunca desde el backend HTTP. Mantenerlo separado evita que un
 * worker pesado se acople accidentalmente al servidor web.
 *
 * @module workers
 */

const { startDataRetentionWorker, stopDataRetentionWorker } = require('./dataRetentionWorker');
const { startAlertDetectionWorker, stopAlertDetectionWorker } = require('./alertDetectionWorker');
const {
  startSystemAlertDetectionWorker,
  stopSystemAlertDetectionWorker
} = require('./systemAlertDetectionWorker');
const logger = require('../utils/logger').child({ component: 'workers' });

const startedWorkers = [];

/**
 * Arranca todos los workers activos. Devuelve la lista de instancias para
 * que el caller pueda esperar a su cierre en SIGTERM.
 *
 * @returns {Array} Workers iniciados.
 */
const startAllWorkers = () => {
  startedWorkers.length = 0;

  startedWorkers.push(startDataRetentionWorker());
  startedWorkers.push(startAlertDetectionWorker());
  startedWorkers.push(startSystemAlertDetectionWorker());

  // Las queues `gdpr-exports` y `notifications` están registradas pero sin
  // worker hasta que se implemente la generación de archivos + email.

  logger.info('workers: todos los workers iniciados', { count: startedWorkers.length });
  return startedWorkers;
};

/**
 * Cierra todos los workers iniciados.
 *
 * @returns {Promise<void>}
 */
const stopAllWorkers = async () => {
  await Promise.allSettled([
    stopDataRetentionWorker(),
    stopAlertDetectionWorker(),
    stopSystemAlertDetectionWorker()
  ]);
  startedWorkers.length = 0;
  logger.info('workers: todos los workers cerrados');
};

module.exports = {
  startAllWorkers,
  stopAllWorkers
};
