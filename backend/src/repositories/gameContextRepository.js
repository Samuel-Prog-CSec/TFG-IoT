/**
 * @fileoverview Repositorio para contextos de juego.
 */

const GameContext = require('../models/GameContext');
const { applyQueryOptions } = require('./baseRepository');

const find = (filter = {}, options = {}) => applyQueryOptions(GameContext.find(filter), options);

const findById = (id, options = {}) => applyQueryOptions(GameContext.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  applyQueryOptions(GameContext.findOne(filter), options);

const count = (filter = {}) => GameContext.countDocuments(filter);

const create = data => GameContext.create(data);

module.exports = {
  find,
  findById,
  findOne,
  count,
  create
};
