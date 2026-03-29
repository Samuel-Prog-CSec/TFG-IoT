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
/**
 * Detecta si un error indica que MongoDB no soporta transacciones (standalone).
 * @param {Error} error
 * @returns {boolean}
 */
const isTransactionNotSupportedError = error => {
  const msg = error?.message || '';
  return (
    msg.includes('Transaction numbers') ||
    msg.includes('transaction') ||
    error?.codeName === 'IllegalOperation'
  );
};

const withTransaction = async callback => {
  let session;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch {
    // Standalone MongoDB (sin replica set): ejecutar sin transacción
    logger.debug('Transacciones no disponibles (standalone), ejecutando sin sesión');
    return callback(null);
  }

  try {
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch {
      // Puede fallar si la transacción ya fue abortada por el driver
    }

    // Si el error es por falta de replica set, reintentar sin transacción
    if (isTransactionNotSupportedError(error)) {
      logger.debug('Transacciones no soportadas, reintentando sin sesión');
      session.endSession();
      return callback(null);
    }

    logger.error('Transacción abortada', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    if (session.hasEnded !== undefined ? !session.hasEnded : true) {
      session.endSession();
    }
  }
};

module.exports = { withTransaction };
