/**
 * @fileoverview Repositorio para mecanicas de juego.
 */

const GameMechanic = require('../models/GameMechanic');
const { applyQueryOptions } = require('./baseRepository');

const find = (filter = {}, options = {}) => applyQueryOptions(GameMechanic.find(filter), options);

const findById = (id, options = {}) => applyQueryOptions(GameMechanic.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  applyQueryOptions(GameMechanic.findOne(filter), options);

const count = (filter = {}) => GameMechanic.countDocuments(filter);

const create = data => GameMechanic.create(data);

module.exports = {
  find,
  findById,
  findOne,
  count,
  create
};
