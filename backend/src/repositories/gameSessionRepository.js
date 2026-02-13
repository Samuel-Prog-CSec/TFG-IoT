/**
 * @fileoverview Repositorio para sesiones de juego.
 */

const GameSession = require('../models/GameSession');
const { applyQueryOptions } = require('./baseRepository');

const find = (filter = {}, options = {}) => applyQueryOptions(GameSession.find(filter), options);

const findById = (id, options = {}) => applyQueryOptions(GameSession.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  applyQueryOptions(GameSession.findOne(filter), options);

const count = (filter = {}) => GameSession.countDocuments(filter);

const create = data => GameSession.create(data);

const build = data => new GameSession(data);

module.exports = {
  find,
  findById,
  findOne,
  count,
  create,
  build
};
