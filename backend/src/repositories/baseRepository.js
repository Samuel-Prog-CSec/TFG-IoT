/**
 * @fileoverview Helpers base para repositorios de Mongo.
 * Centraliza la aplicación de opciones comunes sobre queries (lectura)
 * y operaciones genéricas de escritura, actualización, eliminación y batch.
 *
 * Las funciones genéricas reciben el Model como primer parámetro para que
 * cada repositorio concreto las envuelva con su modelo bindeado.
 *
 * @module repositories/baseRepository
 */

// ───────────────────────────── Lectura ─────────────────────────────

/**
 * Aplica opciones comunes (select, populate, sort, limit, skip, lean)
 * a una query de Mongoose.
 *
 * lean: true devuelve POJOs (~5x menos memoria que documentos Mongoose).
 * Se activa por defecto en queries de listado (cuando hay sort/limit/skip),
 * donde el resultado nunca necesita .save(). Para findById/findOne se mantiene
 * desactivado por defecto porque muchos flujos hacen find → modify → .save().
 * Se puede forzar con lean: true/false explícito en cualquier caso.
 *
 * @param {import('mongoose').Query} query - Query de Mongoose en curso
 * @param {Object} options - Opciones a aplicar
 * @param {boolean} [options.lean] - true para POJOs, false para documentos Mongoose
 * @returns {import('mongoose').Query} Query con opciones aplicadas
 */
const applyQueryOptions = (query, options = {}) => {
  const { select, populate, sort, limit, skip, lean, session } = options;

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

  // lean: activar por defecto en queries de listado (tienen sort/limit/skip)
  // para devolver POJOs ligeros. Desactivar explícitamente con lean: false.
  const isListQuery = sort || Number.isInteger(limit) || Number.isInteger(skip);
  const shouldLean = lean !== undefined ? lean : isListQuery;

  if (shouldLean) {
    const leanOptions = typeof lean === 'object' ? lean : undefined;
    query = query.lean(leanOptions);
  }

  if (session) {
    query = query.session(session);
  }

  return query;
};

// ───────────────────────── Escritura / Update ───────────────────────

/**
 * Actualiza un documento por ID con opciones seguras por defecto.
 *
 * @param {import('mongoose').Model} Model - Modelo de Mongoose
 * @param {string} id - ID del documento
 * @param {Object} update - Campos a actualizar (operadores $ o campos planos)
 * @param {Object} [options={}] - Opciones adicionales de Mongoose
 * @returns {Promise<Object|null>} Documento actualizado o null
 */
const updateById = (Model, id, update, options = {}) =>
  Model.findByIdAndUpdate(id, update, {
    returnDocument: 'after',
    runValidators: true,
    ...options
  });

/**
 * Actualiza un documento por filtro con opciones seguras por defecto.
 *
 * @param {import('mongoose').Model} Model - Modelo de Mongoose
 * @param {Object} filter - Filtro de búsqueda
 * @param {Object} update - Campos a actualizar
 * @param {Object} [options={}] - Opciones adicionales de Mongoose
 * @returns {Promise<Object|null>} Documento actualizado o null
 */
const updateOne = (Model, filter, update, options = {}) =>
  Model.findOneAndUpdate(filter, update, {
    returnDocument: 'after',
    runValidators: true,
    ...options
  });

// ───────────────────────── Eliminación ─────────────────────────────

/**
 * Elimina un documento por ID.
 *
 * @param {import('mongoose').Model} Model - Modelo de Mongoose
 * @param {string} id - ID del documento a eliminar
 * @returns {Promise<Object|null>} Documento eliminado o null
 */
const deleteById = (Model, id) => Model.findByIdAndDelete(id);

/**
 * Elimina múltiples documentos que coincidan con el filtro.
 *
 * @param {import('mongoose').Model} Model - Modelo de Mongoose
 * @param {Object} filter - Filtro de búsqueda
 * @returns {Promise<{deletedCount: number}>} Resultado de la eliminación
 */
const deleteMany = (Model, filter) => Model.deleteMany(filter);

// ────────────────────── Operaciones Batch ───────────────────────────

/**
 * Inserta múltiples documentos de una vez.
 *
 * @param {import('mongoose').Model} Model - Modelo de Mongoose
 * @param {Array<Object>} docs - Array de documentos a insertar
 * @param {Object} [options={}] - Opciones de Mongoose (ej: { session })
 * @returns {Promise<Array<Object>>} Documentos insertados
 */
const insertMany = (Model, docs, options = {}) => Model.insertMany(docs, options);

/**
 * Ejecuta operaciones bulk (insertOne, updateOne, deleteOne, etc.) de forma atómica.
 *
 * @param {import('mongoose').Model} Model - Modelo de Mongoose
 * @param {Array<Object>} operations - Array de operaciones bulk
 * @param {Object} [options={}] - Opciones de Mongoose (ej: { session, ordered })
 * @returns {Promise<import('mongoose').mongo.BulkWriteResult>} Resultado de las operaciones
 */
const bulkWrite = (Model, operations, options = {}) => Model.bulkWrite(operations, options);

module.exports = {
  applyQueryOptions,
  updateById,
  updateOne,
  deleteById,
  deleteMany,
  insertMany,
  bulkWrite
};
