/**
 * @fileoverview Helpers base para repositorios de Mongo.
 * Centraliza la aplicacion de opciones comunes sobre queries.
 */

const applyQueryOptions = (query, options = {}) => {
  const { select, populate, sort, limit, skip } = options;

  if (select) {
    query = query.select(select);
  }
  if (populate) {
    query = query.populate(populate);
  }
  if (sort) {
    query = query.sort(sort);
  }
  if (Number.isInteger(limit)) {
    query = query.limit(limit);
  }
  if (Number.isInteger(skip)) {
    query = query.skip(skip);
  }

  return query;
};

module.exports = {
  applyQueryOptions
};
