/**
 * @fileoverview Repositorio para mazos de cartas.
 */

const CardDeck = require('../models/CardDeck');
const { applyQueryOptions } = require('./baseRepository');

const find = (filter = {}, options = {}) => applyQueryOptions(CardDeck.find(filter), options);

const findById = (id, options = {}) => applyQueryOptions(CardDeck.findById(id), options);

const findOne = (filter = {}, options = {}) => applyQueryOptions(CardDeck.findOne(filter), options);

const count = (filter = {}) => CardDeck.countDocuments(filter);

const create = data => CardDeck.create(data);

module.exports = {
  find,
  findById,
  findOne,
  count,
  create
};
