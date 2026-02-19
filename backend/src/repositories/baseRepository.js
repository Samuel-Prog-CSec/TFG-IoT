/**
 * @fileoverview Helpers base para repositorios de Mongo.
 * Centraliza la aplicacion de opciones comunes sobre queries.
 */

const applyQueryOptions = (query, options = {}) => {
  const { select, populate, sort, limit, skip, lean } = options;

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
  if (lean) {
    const leanOptions = typeof lean === 'object' ? lean : undefined;
    query = query.lean(leanOptions);
  }

  return query;
};

module.exports = {
  applyQueryOptions
};
