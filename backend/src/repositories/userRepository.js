/**
 * @fileoverview Repositorio para usuarios.
 */

const User = require('../models/User');
const baseRepo = require('./baseRepository');

const find = (filter = {}, options = {}) => baseRepo.applyQueryOptions(User.find(filter), options);

const findById = (id, options = {}) => baseRepo.applyQueryOptions(User.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(User.findOne(filter), options);

const count = (filter = {}) => User.countDocuments(filter);

const create = data => User.create(data);

const aggregate = pipeline => User.aggregate(pipeline);

const updateById = (id, update, options = {}) => baseRepo.updateById(User, id, update, options);

const updateOne = (filter, update, options = {}) =>
  baseRepo.updateOne(User, filter, update, options);

const deleteById = id => baseRepo.deleteById(User, id);

const deleteMany = filter => baseRepo.deleteMany(User, filter);

const insertMany = (docs, options = {}) => baseRepo.insertMany(User, docs, options);

const bulkWrite = (operations, options = {}) => baseRepo.bulkWrite(User, operations, options);

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
