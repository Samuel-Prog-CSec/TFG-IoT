/**
 * @fileoverview Repositorio para partidas (GamePlay).
 */

const GamePlay = require('../models/GamePlay');
const baseRepo = require('./baseRepository');

const find = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(GamePlay.find(filter), options);

const findById = (id, options = {}) => baseRepo.applyQueryOptions(GamePlay.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(GamePlay.findOne(filter), options);

const count = (filter = {}) => GamePlay.countDocuments(filter);

const create = data => GamePlay.create(data);

// maxTimeMS por defecto para proteger contra aggregations lentas que bloqueen el pool
const DEFAULT_AGGREGATE_TIMEOUT_MS = Number.parseInt(process.env.AGGREGATE_TIMEOUT_MS, 10) || 15000;

const aggregate = (pipeline, { maxTimeMS = DEFAULT_AGGREGATE_TIMEOUT_MS } = {}) =>
  GamePlay.aggregate(pipeline).option({ maxTimeMS });

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
  create,
  aggregate,
  updateById,
  updateOne,
  deleteById,
  deleteMany,
  insertMany,
  bulkWrite
};
