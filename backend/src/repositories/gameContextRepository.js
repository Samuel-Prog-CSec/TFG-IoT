/**
 * @fileoverview Repositorio para contextos de juego.
 */

const GameContext = require('../models/GameContext');
const baseRepo = require('./baseRepository');

const find = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(GameContext.find(filter), options);

const findById = (id, options = {}) =>
  baseRepo.applyQueryOptions(GameContext.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(GameContext.findOne(filter), options);

const count = (filter = {}) => GameContext.countDocuments(filter);

const create = data => GameContext.create(data);

const updateById = (id, update, options = {}) =>
  baseRepo.updateById(GameContext, id, update, options);

const updateOne = (filter, update, options = {}) =>
  baseRepo.updateOne(GameContext, filter, update, options);

const findByIdAndUpdate = (id, update, options = {}) =>
  baseRepo.updateById(GameContext, id, update, options);

const deleteById = id => baseRepo.deleteById(GameContext, id);

const deleteMany = filter => baseRepo.deleteMany(GameContext, filter);

module.exports = {
  find,
  findById,
  findOne,
  count,
  create,
  updateById,
  updateOne,
  findByIdAndUpdate,
  deleteById,
  deleteMany
};
