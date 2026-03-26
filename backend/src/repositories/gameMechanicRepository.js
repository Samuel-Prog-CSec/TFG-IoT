/**
 * @fileoverview Repositorio para mecanicas de juego.
 */

const GameMechanic = require('../models/GameMechanic');
const baseRepo = require('./baseRepository');

const find = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(GameMechanic.find(filter), options);

const findById = (id, options = {}) =>
  baseRepo.applyQueryOptions(GameMechanic.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(GameMechanic.findOne(filter), options);

const count = (filter = {}) => GameMechanic.countDocuments(filter);

const create = data => GameMechanic.create(data);

const updateById = (id, update, options = {}) =>
  baseRepo.updateById(GameMechanic, id, update, options);

const updateOne = (filter, update, options = {}) =>
  baseRepo.updateOne(GameMechanic, filter, update, options);

const findByIdAndUpdate = (id, update, options = {}) =>
  baseRepo.updateById(GameMechanic, id, update, options);

const deleteById = id => baseRepo.deleteById(GameMechanic, id);

const deleteMany = filter => baseRepo.deleteMany(GameMechanic, filter);

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
