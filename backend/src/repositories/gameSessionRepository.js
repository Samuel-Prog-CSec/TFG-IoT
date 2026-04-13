/**
 * @fileoverview Repositorio para sesiones de juego.
 */

const GameSession = require('../models/GameSession');
const baseRepo = require('./baseRepository');

const find = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(GameSession.find(filter), options);

const findById = (id, options = {}) =>
  baseRepo.applyQueryOptions(GameSession.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(GameSession.findOne(filter), options);

const count = (filter = {}) => GameSession.countDocuments(filter);

const create = data => GameSession.create(data);

const build = data => new GameSession(data);

const updateById = (id, update, options = {}) =>
  baseRepo.updateById(GameSession, id, update, options);

const updateOne = (filter, update, options = {}) =>
  baseRepo.updateOne(GameSession, filter, update, options);

const deleteById = id => baseRepo.deleteById(GameSession, id);

const deleteMany = filter => baseRepo.deleteMany(GameSession, filter);

// maxTimeMS por defecto para proteger contra aggregations lentas que bloqueen el pool
const DEFAULT_AGGREGATE_TIMEOUT_MS = Number.parseInt(process.env.AGGREGATE_TIMEOUT_MS, 10) || 15000;

const aggregate = (pipeline, { maxTimeMS = DEFAULT_AGGREGATE_TIMEOUT_MS } = {}) =>
  GameSession.aggregate(pipeline).option({ maxTimeMS });

module.exports = {
  find,
  findById,
  findOne,
  count,
  create,
  build,
  updateById,
  updateOne,
  deleteById,
  deleteMany,
  aggregate
};
