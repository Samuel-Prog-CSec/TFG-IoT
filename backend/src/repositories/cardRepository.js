/**
 * @fileoverview Repositorio para tarjetas RFID.
 */

const Card = require('../models/Card');
const { applyQueryOptions } = require('./baseRepository');

const find = (filter = {}, options = {}) => applyQueryOptions(Card.find(filter), options);

const findById = (id, options = {}) => applyQueryOptions(Card.findById(id), options);

const findOne = (filter = {}, options = {}) => applyQueryOptions(Card.findOne(filter), options);

const count = (filter = {}) => Card.countDocuments(filter);

const create = data => Card.create(data);

const insertMany = data => Card.insertMany(data);

const aggregate = pipeline => Card.aggregate(pipeline);

module.exports = {
  find,
  findById,
  findOne,
  count,
  create,
  insertMany,
  aggregate
};
