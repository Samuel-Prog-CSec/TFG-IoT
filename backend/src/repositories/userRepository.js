/**
 * @fileoverview Repositorio para usuarios.
 */

const User = require('../models/User');
const { applyQueryOptions } = require('./baseRepository');

const find = (filter = {}, options = {}) => applyQueryOptions(User.find(filter), options);

const findById = (id, options = {}) => applyQueryOptions(User.findById(id), options);

const findOne = (filter = {}, options = {}) => applyQueryOptions(User.findOne(filter), options);

const count = (filter = {}) => User.countDocuments(filter);

const create = data => User.create(data);

const aggregate = pipeline => User.aggregate(pipeline);

module.exports = {
  find,
  findById,
  findOne,
  count,
  create,
  aggregate
};
