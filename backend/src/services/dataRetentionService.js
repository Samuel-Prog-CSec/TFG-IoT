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
 * @param {Date} [options.windowStart] - Sharding T-907 INT4: limita el rango
 *   inferior. Solo procesa documentos cuyo `completedAt`/`updatedAt` >= este
 *   valor. Si null, no hay límite inferior (comportamiento original).
 * @param {Date} [options.windowEnd] - Sharding T-907 INT4: limita el rango
 *   superior. Si null, usa el cutoff por defecto (months ago).
 * @returns {Promise<{ anonymized: number, candidates: number }>}
 */
const anonymizeOldGamePlays = async ({
  dryRun = false,
  logger = baseLogger,
  windowStart = null,
  windowEnd = null
} = {}) => {
  const cutoffDate = windowEnd || monthsAgo(GAMEPLAY_ANONYMIZATION_MONTHS);
  const db = mongoose.connection.db;
  const gameplaysCollection = db.collection('gameplays');

  // T-907 INT4: si hay windowStart, el rango se acota; si no, queda
  // `< cutoffDate` igual que antes. Permite que N shards procesen rangos
  // disjuntos en paralelo sin pisarse (cada uno con su windowStart/windowEnd).
  const completedAtFilter = windowStart
    ? { $gte: windowStart, $lt: cutoffDate }
    : { $lt: cutoffDate };
  const updatedAtFilter = windowStart
    ? { $gte: windowStart, $lt: cutoffDate }
    : { $lt: cutoffDate };

  const filter = {
    $or: [
      { completedAt: completedAtFilter },
      {
        completedAt: null,
        updatedAt: updatedAtFilter,
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
const deleteInactiveStudents = async ({
  dryRun = false,
  logger = baseLogger,
  windowStart = null,
  windowEnd = null
} = {}) => {
  const cutoffDate = windowEnd || monthsAgo(INACTIVE_STUDENT_DELETION_MONTHS);
  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');
  const gameplaysCollection = db.collection('gameplays');

  // T-907 INT4: window filter para sharding (ver anonymizeOldGamePlays).
  const updatedAtFilter = windowStart
    ? { $gte: windowStart, $lt: cutoffDate }
    : { $lt: cutoffDate };

  const candidatesDocs = await usersCollection
    .find({ role: 'student', status: 'inactive', updatedAt: updatedAtFilter })
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
const runDataRetention = async ({
  dryRun = false,
  logger = baseLogger,
  windowStart = null,
  windowEnd = null,
  shardIndex = null,
  shardCount = null
} = {}) => {
  const startedAt = Date.now();
  logger.info('Política de retención iniciada', {
    dryRun,
    shardIndex,
    shardCount,
    windowStart,
    windowEnd
  });

  const anonymizationResult = await anonymizeOldGamePlays({
    dryRun,
    logger,
    windowStart,
    windowEnd
  });
  const deletionResult = await deleteInactiveStudents({
    dryRun,
    logger,
    windowStart,
    windowEnd
  });
  const smartAlertsResult = await deleteOldSmartAlerts({ dryRun, logger });

  const summary = {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    dryRun,
    shardIndex,
    shardCount,
    windowStart: windowStart?.toISOString() || null,
    windowEnd: windowEnd?.toISOString() || null,
    anonymization: anonymizationResult,
    deletion: deletionResult,
    smartAlerts: smartAlertsResult
  };

  logger.info('Política de retención completada', summary);
  return summary;
};

/**
 * Hard-delete de SmartAlerts resolved/dismissed más antiguos que N días (H.4 / T-941).
 *
 * Usa el índice partial `hard_delete_candidates` del modelo SmartAlert para
 * no escanear la colección entera. Si Redis/cron está parado, esta limpieza
 * sigue funcionando en la próxima corrida del job `data-retention`.
 *
 * @param {Object} options
 * @param {boolean} [options.dryRun]
 * @param {Object} [options.logger]
 * @returns {Promise<{ deleted: number, candidates: number, olderThanDays: number }>}
 */
const deleteOldSmartAlerts = async ({ dryRun = false, logger = baseLogger } = {}) => {
  // Cargamos config en runtime para evitar dependencias circulares al require el módulo.
  const { DETECTION_CONFIG } = require('../config/alerts');
  const olderThanDays = DETECTION_CONFIG.hardDeleteAfterDays;
  const cutoff = new Date(Date.now() - olderThanDays * 86400000);

  const db = mongoose.connection.db;
  const collection = db.collection('smartalerts');
  const filter = {
    status: { $in: ['resolved', 'dismissed'] },
    updatedAt: { $lt: cutoff }
  };

  const candidates = await collection.countDocuments(filter);
  if (dryRun || candidates === 0) {
    logger.info('dataRetention.smartAlerts.dryRun', {
      candidates,
      olderThanDays,
      cutoff: cutoff.toISOString()
    });
    return { deleted: 0, candidates, olderThanDays };
  }

  const result = await collection.deleteMany(filter);
  logger.info('dataRetention.smartAlerts.deleted', {
    deleted: result.deletedCount || 0,
    candidates,
    olderThanDays,
    cutoff: cutoff.toISOString()
  });
  return { deleted: result.deletedCount || 0, candidates, olderThanDays };
};

module.exports = {
  anonymizeOldGamePlays,
  deleteInactiveStudents,
  deleteOldSmartAlerts,
  runDataRetention
};
