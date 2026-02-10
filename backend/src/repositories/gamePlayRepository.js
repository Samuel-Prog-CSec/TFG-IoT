/**
 * @fileoverview Repositorio para partidas (GamePlay).
 */

const GamePlay = require('../models/GamePlay');
const { applyQueryOptions } = require('./baseRepository');

const find = (filter = {}, options = {}) => applyQueryOptions(GamePlay.find(filter), options);

const findById = (id, options = {}) => applyQueryOptions(GamePlay.findById(id), options);

const findOne = (filter = {}, options = {}) => applyQueryOptions(GamePlay.findOne(filter), options);

const count = (filter = {}) => GamePlay.countDocuments(filter);

const create = data => GamePlay.create(data);

const aggregate = pipeline => GamePlay.aggregate(pipeline);

module.exports = {
  find,
  findById,
  findOne,
  count,
  create,
  aggregate
};
