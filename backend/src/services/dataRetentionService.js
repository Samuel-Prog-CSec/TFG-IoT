/**
 * @fileoverview Lógica de retención de datos (Art. 5.1.e RGPD) reutilizable.
 *
 * Esta capa expone funciones puras que operan sobre la conexión Mongo activa.
 * Las usa tanto el script CLI `scripts/dataRetention.js` (uso manual) como el
 * worker BullMQ `workers/dataRetentionWorker.js` (programación diaria).
 *
 * Acciones cubiertas:
 *   1. Anonimizar GamePlays completados hace más de N meses (eliminar playerId,
 *      limpiar cardUid). Considerando 26 RGPD: datos anónimos quedan fuera del
 *      reglamento.
 *   2. Eliminar (hard delete) estudiantes inactivos durante M meses. Art. 17 RGPD.
 *
 * @module services/dataRetentionService
 */

const mongoose = require('mongoose');
const {
  GAMEPLAY_ANONYMIZATION_MONTHS,
  INACTIVE_STUDENT_DELETION_MONTHS
} = require('../config/dataRetention');
const baseLogger = require('../utils/logger').child({ component: 'dataRetentionService' });

const monthsAgo = months => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
};

/**
 * Anonimiza GamePlays antiguos.
 *
 * @param {Object} options
 * @param {boolean} [options.dryRun] - Si true, solo cuenta candidatos.
 * @param {Object} [options.logger] - Logger custom (default: módulo).
 * @returns {Promise<{ anonymized: number, candidates: number }>}
 */
const anonymizeOldGamePlays = async ({ dryRun = false, logger = baseLogger } = {}) => {
  const cutoffDate = monthsAgo(GAMEPLAY_ANONYMIZATION_MONTHS);
  const db = mongoose.connection.db;
  const gameplaysCollection = db.collection('gameplays');

  const filter = {
    $or: [
      { completedAt: { $lt: cutoffDate } },
      {
        completedAt: null,
        updatedAt: { $lt: cutoffDate },
        status: { $in: ['completed', 'abandoned'] }
      }
    ],
    playerId: { $ne: null }
  };

  const candidates = await gameplaysCollection.countDocuments(filter);
  logger.info('GamePlays candidatos a anonimización', { candidates, cutoffDate });

  if (candidates === 0 || dryRun) {
    return { anonymized: 0, candidates };
  }

  const result = await gameplaysCollection.updateMany(filter, [
    {
      $set: {
        playerId: null,
        events: {
          $map: {
            input: '$events',
            as: 'event',
            in: { $mergeObjects: ['$$event', { cardUid: null }] }
          }
        }
      }
    }
  ]);

  logger.info('GamePlays anonimizados', { modifiedCount: result.modifiedCount });
  return { anonymized: result.modifiedCount, candidates };
};

/**
 * Elimina estudiantes inactivos hace > N meses (cascada con GamePlays).
 *
 * @param {Object} options
 * @param {boolean} [options.dryRun]
 * @param {Object} [options.logger]
 * @returns {Promise<{ studentsDeleted: number, gamePlaysDeleted: number, candidates: number }>}
 */
const deleteInactiveStudents = async ({ dryRun = false, logger = baseLogger } = {}) => {
  const cutoffDate = monthsAgo(INACTIVE_STUDENT_DELETION_MONTHS);
  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');
  const gameplaysCollection = db.collection('gameplays');

  const candidatesDocs = await usersCollection
    .find({ role: 'student', status: 'inactive', updatedAt: { $lt: cutoffDate } })
    .project({ _id: 1 })
    .toArray();

  const candidates = candidatesDocs.length;
  logger.info('Estudiantes inactivos candidatos a borrado', { candidates, cutoffDate });

  if (candidates === 0) {
    return { studentsDeleted: 0, gamePlaysDeleted: 0, candidates };
  }

  const studentIds = candidatesDocs.map(c => c._id);

  if (dryRun) {
    const relatedPlays = await gameplaysCollection.countDocuments({
      playerId: { $in: studentIds }
    });
    return { studentsDeleted: 0, gamePlaysDeleted: 0, candidates, relatedPlays };
  }

  const playsResult = await gameplaysCollection.deleteMany({ playerId: { $in: studentIds } });
  const usersResult = await usersCollection.deleteMany({ _id: { $in: studentIds } });

  logger.info('Estudiantes y plays eliminados (Art. 17)', {
    studentsDeleted: usersResult.deletedCount,
    gamePlaysDeleted: playsResult.deletedCount
  });

  return {
    studentsDeleted: usersResult.deletedCount,
    gamePlaysDeleted: playsResult.deletedCount,
    candidates
  };
};

/**
 * Ejecuta el ciclo completo de retención (anonimización + borrado de inactivos).
 *
 * @param {Object} options
 * @param {boolean} [options.dryRun]
 * @param {Object} [options.logger]
 * @returns {Promise<Object>} Resumen.
 */
const runDataRetention = async ({ dryRun = false, logger = baseLogger } = {}) => {
  const startedAt = Date.now();
  logger.info('Política de retención iniciada', { dryRun });

  const anonymizationResult = await anonymizeOldGamePlays({ dryRun, logger });
  const deletionResult = await deleteInactiveStudents({ dryRun, logger });

  const summary = {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    dryRun,
    anonymization: anonymizationResult,
    deletion: deletionResult
  };

  logger.info('Política de retención completada', summary);
  return summary;
};

module.exports = {
  anonymizeOldGamePlays,
  deleteInactiveStudents,
  runDataRetention
};
