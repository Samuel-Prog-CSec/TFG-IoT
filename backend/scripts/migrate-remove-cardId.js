/**
 * @fileoverview Migración para eliminar el campo cardId de los subdocumentos
 * de card_decks y game_sessions, y eliminar la colección cards.
 *
 * Operaciones (en orden):
 *   1. $unset cardMappings.$[].cardId en card_decks
 *   2. $unset cardMappings.$[].cardId, boardLayout.$[].cardId,
 *      associationChallengePlan.$[].cardId en game_sessions
 *   3. Eliminar la colección cards (si existe)
 *
 * Es idempotente: ejecutarlo varias veces produce el mismo resultado sin error.
 *
 * Uso:
 *   node backend/scripts/migrate-remove-cardId.js              # ejecutar migración
 *   node backend/scripts/migrate-remove-cardId.js --dry-run    # solo previsualizar
 *
 * @requires mongoose
 * @requires pino
 */

const mongoose = require('mongoose');
const pino = require('pino');

// --- Configuración del logger ---
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' }
  }
});

// --- Constantes ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid_games';

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Conecta a MongoDB usando mongoose.
 *
 * @async
 * @returns {Promise<void>}
 */
const connect = async () => {
  await mongoose.connect(MONGODB_URI);
  logger.info(`Conectado a MongoDB: ${mongoose.connection.host}`);
};

/**
 * Desconecta de MongoDB de forma controlada.
 *
 * @async
 * @returns {Promise<void>}
 */
const disconnect = async () => {
  await mongoose.connection.close();
  logger.info('Conexión a MongoDB cerrada');
};

/**
 * Cuenta los documentos que contienen el campo cardId en un array de subdocumentos.
 *
 * @async
 * @param {import('mongodb').Collection} collection - Colección de MongoDB
 * @param {string} arrayField - Nombre del campo array (ej. "cardMappings")
 * @returns {Promise<number>} Cantidad de documentos afectados
 */
const countDocsWithCardId = async (collection, arrayField) =>
  collection.countDocuments({
    [`${arrayField}.cardId`]: { $exists: true }
  });

/**
 * Elimina el campo cardId de un array de subdocumentos en la colección indicada.
 * Utiliza updateMany con el operador positional all ($[]).
 *
 * @async
 * @param {import('mongodb').Db} db - Instancia de la base de datos
 * @param {string} collectionName - Nombre de la colección
 * @param {string[]} arrayFields - Campos array que contienen cardId
 * @returns {Promise<void>}
 */
const unsetCardIdFromArrays = async (db, collectionName, arrayFields) => {
  const collection = db.collection(collectionName);

  for (const field of arrayFields) {
    const beforeCount = await countDocsWithCardId(collection, field);

    if (beforeCount === 0) {
      logger.info(
        `[${collectionName}] "${field}.cardId" no encontrado en ningún documento — nada que migrar`
      );
      continue;
    }

    logger.info(`[${collectionName}] ${beforeCount} documento(s) contienen "${field}.cardId"`);

    if (DRY_RUN) {
      logger.info(`[DRY-RUN] Se haría $unset de "${field}.$[].cardId" en ${collectionName}`);
      continue;
    }

    const result = await collection.updateMany(
      { [`${field}.cardId`]: { $exists: true } },
      { $unset: { [`${field}.$[].cardId`]: '' } }
    );

    const afterCount = await countDocsWithCardId(collection, field);

    logger.info(
      `[${collectionName}] $unset "${field}.$[].cardId" — matched: ${result.matchedCount}, modified: ${result.modifiedCount}, restantes: ${afterCount}`
    );
  }
};

/**
 * Elimina la colección "cards" si existe en la base de datos.
 *
 * @async
 * @param {import('mongodb').Db} db - Instancia de la base de datos
 * @returns {Promise<void>}
 */
const dropCardsCollection = async db => {
  const collections = await db.listCollections({ name: 'cards' }).toArray();

  if (collections.length === 0) {
    logger.info('La colección "cards" no existe — nada que eliminar');
    return;
  }

  const count = await db.collection('cards').countDocuments();
  logger.info(`La colección "cards" existe con ${count} documento(s)`);

  if (DRY_RUN) {
    logger.info('[DRY-RUN] Se eliminaría la colección "cards"');
    return;
  }

  await db.collection('cards').drop();
  logger.info('Colección "cards" eliminada correctamente');
};

/**
 * Función principal de migración. Ejecuta todas las operaciones en orden.
 *
 * @async
 * @returns {Promise<void>}
 */
const migrate = async () => {
  if (DRY_RUN) {
    logger.warn('=== MODO DRY-RUN: no se realizarán cambios ===');
  }

  logger.info('Iniciando migración: eliminar campo cardId');

  try {
    await connect();
    const db = mongoose.connection.db;

    // 1. card_decks — eliminar cardMappings.$[].cardId
    logger.info('--- Paso 1: card_decks ---');
    await unsetCardIdFromArrays(db, 'card_decks', ['cardMappings']);

    // 2. game_sessions — eliminar cardId de tres arrays de subdocumentos
    logger.info('--- Paso 2: game_sessions ---');
    await unsetCardIdFromArrays(db, 'game_sessions', [
      'cardMappings',
      'boardLayout',
      'associationChallengePlan'
    ]);

    // 3. Eliminar colección cards
    logger.info('--- Paso 3: colección cards ---');
    await dropCardsCollection(db);

    logger.info('Migración completada con éxito');
  } catch (error) {
    logger.error({ err: error }, 'Error durante la migración');
    process.exitCode = 1;
  } finally {
    await disconnect();
  }
};

migrate();
