/**
 * @fileoverview Repositorio para mazos de cartas.
 */

const CardDeck = require('../models/CardDeck');
const baseRepo = require('./baseRepository');

const find = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(CardDeck.find(filter), options);

const findById = (id, options = {}) => baseRepo.applyQueryOptions(CardDeck.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(CardDeck.findOne(filter), options);

const count = (filter = {}) => CardDeck.countDocuments(filter);

const create = data => CardDeck.create(data);

const updateById = (id, update, options = {}) => baseRepo.updateById(CardDeck, id, update, options);

const updateOne = (filter, update, options = {}) =>
  baseRepo.updateOne(CardDeck, filter, update, options);

const findByIdAndUpdate = (id, update, options = {}) =>
  baseRepo.updateById(CardDeck, id, update, options);

const deleteById = id => baseRepo.deleteById(CardDeck, id);

const deleteMany = filter => baseRepo.deleteMany(CardDeck, filter);

const insertMany = (docs, options = {}) => baseRepo.insertMany(CardDeck, docs, options);

const bulkWrite = (operations, options = {}) => baseRepo.bulkWrite(CardDeck, operations, options);

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
  deleteMany,
  insertMany,
  bulkWrite
};
