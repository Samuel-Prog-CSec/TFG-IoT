/**
 * @fileoverview Repositorio para partidas (GamePlay).
 */

const GamePlay = require('../models/GamePlay');
const baseRepo = require('./baseRepository');
const logger = require('../utils/logger').child({ component: 'gamePlayRepository' });

const find = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(GamePlay.find(filter), options);

const findById = (id, options = {}) => baseRepo.applyQueryOptions(GamePlay.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(GamePlay.findOne(filter), options);

const count = (filter = {}) => GamePlay.countDocuments(filter);

// Valores únicos de un campo (ej: sessionIds con al menos una partida).
const distinct = (field, filter = {}) => GamePlay.distinct(field, filter);

const create = data => GamePlay.create(data);

// maxTimeMS por defecto para proteger contra aggregations lentas que bloqueen el pool
const DEFAULT_AGGREGATE_TIMEOUT_MS = Number.parseInt(process.env.AGGREGATE_TIMEOUT_MS, 10) || 15000;

// Sprint 0 pre-v1.0.0 (M1): umbral para loggear slow-query analytics.
// Operación >SLOW_AGGREGATE_WARN_MS → indica que toca materializar (BullMQ
// nightly → studentMetrics) o crear índice secundario. NO afecta UX en sí
// (MongoDB sigue respetando maxTimeMS para abortar lo realmente roto).
const SLOW_AGGREGATE_WARN_MS = Number.parseInt(process.env.SLOW_AGGREGATE_WARN_MS, 10) || 5000;

const aggregate = async (pipeline, { maxTimeMS = DEFAULT_AGGREGATE_TIMEOUT_MS } = {}) => {
  const start = Date.now();
  try {
    const result = await GamePlay.aggregate(pipeline).option({ maxTimeMS });
    const elapsed = Date.now() - start;
    if (elapsed > SLOW_AGGREGATE_WARN_MS) {
      logger.warn(
        {
          alert: true,
          elapsedMs: elapsed,
          maxTimeMS,
          slowThresholdMs: SLOW_AGGREGATE_WARN_MS,
          firstStage: Array.isArray(pipeline) ? Object.keys(pipeline[0] || {})[0] : null
        },
        'GamePlay aggregate excedió el umbral de slow-query'
      );
    }
    return result;
  } catch (error) {
    const elapsed = Date.now() - start;
    // MongoDB devuelve MongoServerError con codeName 'MaxTimeMSExpired'
    // cuando la operación supera maxTimeMS. Lo loggeamos con alert para
    // que sea visible en Sentry; el caller recibe el error tal cual.
    if (error?.codeName === 'MaxTimeMSExpired' || /maxTimeMS/i.test(error?.message || '')) {
      logger.error(
        {
          alert: true,
          elapsedMs: elapsed,
          maxTimeMS,
          firstStage: Array.isArray(pipeline) ? Object.keys(pipeline[0] || {})[0] : null
        },
        'GamePlay aggregate abortada por maxTimeMS'
      );
    }
    throw error;
  }
};

const updateById = (id, update, options = {}) => baseRepo.updateById(GamePlay, id, update, options);

const updateOne = (filter, update, options = {}) =>
  baseRepo.updateOne(GamePlay, filter, update, options);

const deleteById = id => baseRepo.deleteById(GamePlay, id);

const deleteMany = filter => baseRepo.deleteMany(GamePlay, filter);

const insertMany = (docs, options = {}) => baseRepo.insertMany(GamePlay, docs, options);

const bulkWrite = (operations, options = {}) => baseRepo.bulkWrite(GamePlay, operations, options);

module.exports = {
  find,
  findById,
  findOne,
  count,
  distinct,
  create,
  aggregate,
  updateById,
  updateOne,
  deleteById,
  deleteMany,
  insertMany,
  bulkWrite
};
