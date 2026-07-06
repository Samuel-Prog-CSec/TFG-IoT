/**
 * @fileoverview Utilidad para ejecutar operaciones dentro de transacciones de MongoDB.
 * Envuelve el patrón session/startTransaction/commit/abort/endSession.
 *
 * REQUISITO: Las transacciones requieren un replica set de MongoDB.
 * `docker-compose.yml` configura Mongo como replica set de un solo nodo
 * (`rs0`, inicializado por el servicio `mongo-init`) en desarrollo local Y en
 * despliegue. En entornos standalone (tests con mongodb-memory-server sin
 * replSet), las transacciones no están disponibles y este módulo degrada con
 * gracia a ejecución sin sesión (ver `isTransactionNotSupportedError`).
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
 * Detecta si un error indica que MongoDB NO soporta transacciones (standalone,
 * sin replica set). DEBE ser específico: el `errmsg` de un WriteConflict contiene
 * la subcadena "...retry your operation or multi-document transaction", así que
 * un filtro genérico `includes('transaction')` lo malclasificaba y degradaba a
 * ejecución SIN sesión, perdiendo la atomicidad. Un WriteConflict debe
 * reintentarse CON sesión (es transitorio), no degradarse.
 * @param {Error} error
 * @returns {boolean}
 */
const isTransactionNotSupportedError = error => {
  const msg = error?.message || '';
  return (
    msg.includes('Transaction numbers are only allowed on a replica set') ||
    msg.includes('Transactions are not supported') ||
    // Un mongod STANDALONE (algunos tests / entornos locales sin replica set)
    // rechaza la escritura transaccional con este mensaje en vez del de "replica
    // set". Ambos significan lo mismo: este deployment no soporta transacciones,
    // así que hay que degradar a ejecución sin sesión. En producción (Atlas replica
    // set) nunca se dispara, así que la atomicidad real se mantiene allí.
    msg.includes('does not support retryable writes') ||
    (error?.codeName === 'IllegalOperation' && /transaction/i.test(msg))
  );
};

/**
 * Un WriteConflict (u otro fallo transitorio) dentro de una transacción se marca
 * con la etiqueta `TransientTransactionError`; el patrón oficial es reintentar la
 * transacción completa, no abortar definitivamente.
 * @param {Error} error
 * @returns {boolean}
 */
const isTransientTransactionError = error =>
  Array.isArray(error?.errorLabels) && error.errorLabels.includes('TransientTransactionError');

const MAX_TRANSACTION_RETRIES = 3;

/**
 * Ejecuta el callback una vez dentro de una transacción.
 * @param {Function} callback
 * @returns {Promise<{result?: *, retriable: boolean, error?: Error}>}
 */
const runTransactionOnce = async callback => {
  let session;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch {
    // Standalone MongoDB (sin replica set, p. ej. el Mongo local de Docker o
    // algunos tests): ejecutar sin transacción.
    logger.warn('MongoDB sin soporte de transacciones (standalone), ejecutando sin sesión');
    return { result: await callback(null), retriable: false };
  }

  try {
    const result = await callback(session);
    await session.commitTransaction();
    return { result, retriable: false };
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch {
      // Puede fallar si la transacción ya fue abortada por el driver
    }

    // Standalone real (el servidor rechaza la transacción): degradar sin sesión.
    if (isTransactionNotSupportedError(error)) {
      logger.warn('Transacciones no soportadas, reintentando sin sesión');
      return { result: await callback(null), retriable: false };
    }

    // Transitorio (WriteConflict): señalar para reintentar la transacción completa.
    if (isTransientTransactionError(error)) {
      return { retriable: true, error };
    }

    logger.error('Transacción abortada', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    if (session && (session.hasEnded !== undefined ? !session.hasEnded : true)) {
      session.endSession();
    }
  }
};

const withTransaction = async callback => {
  let lastError;
  for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt += 1) {
    const outcome = await runTransactionOnce(callback);
    if (!outcome.retriable) {
      return outcome.result;
    }
    lastError = outcome.error;
    logger.warn(
      `Transacción transitoria (WriteConflict), reintento ${attempt}/${MAX_TRANSACTION_RETRIES}`,
      { error: lastError.message }
    );
  }

  logger.error('Transacción agotó los reintentos transitorios', {
    error: lastError?.message
  });
  throw lastError;
};

module.exports = { withTransaction };
