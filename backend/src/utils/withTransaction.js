/**
 * @fileoverview Utilidad para ejecutar operaciones dentro de transacciones de MongoDB.
 * Envuelve el patrón session/startTransaction/commit/abort/endSession.
 *
 * REQUISITO: Las transacciones requieren un replica set de MongoDB.
 * En desarrollo local con Docker, el docker-compose configura un replica set.
 * En entornos standalone (algunos tests), las transacciones no están disponibles.
 *
 * @module utils/withTransaction
 */

const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * Ejecuta un callback dentro de una transacción de MongoDB.
 * Commit automático en éxito, abort automático en error.
 *
 * @param {Function} callback - Función async que recibe (session) como parámetro.
 *   Todas las operaciones de MongoDB dentro deben pasar { session } como opción.
 * @returns {Promise<*>} Resultado del callback
 * @throws {Error} Re-lanza el error del callback tras abortar la transacción
 *
 * @example
 * const result = await withTransaction(async (session) => {
 *   const user = await User.create([{ name: 'Test' }], { session });
 *   await GamePlay.updateMany({ playerId: user[0]._id }, { status: 'archived' }, { session });
 *   return user[0];
 * });
 */
const withTransaction = async callback => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Transacción abortada', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = { withTransaction };
