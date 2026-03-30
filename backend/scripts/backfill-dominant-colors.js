/**
 * @fileoverview Migración para poblar el campo dominantColor en assets existentes.
 * Descarga cada imagen desde Supabase Storage, extrae el color dominante con Sharp,
 * y actualiza el subdocumento correspondiente en MongoDB.
 *
 * Es idempotente: solo procesa assets que tienen imageUrl pero no dominantColor.
 *
 * Uso:
 *   node backend/scripts/backfill-dominant-colors.js              # ejecutar migración
 *   node backend/scripts/backfill-dominant-colors.js --dry-run    # solo previsualizar
 *
 * @requires mongoose
 * @requires sharp
 * @requires pino
 */

const mongoose = require('mongoose');
const sharp = require('sharp');
const pino = require('pino');
const path = require('node:path');

// Cargar variables de entorno
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// --- Logger ---
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
 * Extrae el color dominante de un buffer de imagen.
 *
 * @param {Buffer} buffer - Contenido binario de la imagen
 * @returns {Promise<string>} Color en formato hex (#RRGGBB)
 */
async function extractDominantColor(buffer) {
  const { dominant } = await sharp(buffer).stats();
  const toHex = n => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(dominant.r)}${toHex(dominant.g)}${toHex(dominant.b)}`;
}

/**
 * Descarga una imagen desde su URL pública.
 *
 * @param {string} url - URL pública de la imagen
 * @returns {Promise<Buffer>} Contenido binario de la imagen
 */
async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al descargar ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Ejecuta la migración de backfill de dominant colors.
 */
async function run() {
  logger.info(
    DRY_RUN
      ? '🔍 Modo DRY-RUN: no se modificará la base de datos'
      : '🚀 Ejecutando migración de dominant colors'
  );

  await mongoose.connect(MONGODB_URI);
  logger.info('Conectado a MongoDB');

  const GameContext = mongoose.connection.collection('game_contexts');

  // Buscar contextos con assets que tienen imagen pero no dominantColor
  const contexts = await GameContext.find({
    'assets.imageUrl': { $exists: true, $ne: null }
  }).toArray();

  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const context of contexts) {
    const contextId = context.contextId || context._id;
    logger.info(`Procesando contexto: ${contextId} (${context.assets?.length || 0} assets)`);

    for (const asset of context.assets || []) {
      // Solo procesar assets con imagen y sin dominantColor
      if (!asset.imageUrl || asset.dominantColor) {
        totalSkipped++;
        continue;
      }

      try {
        logger.info(`  Descargando imagen: ${asset.key} (${asset.imageUrl.slice(-40)})`);
        const buffer = await downloadImage(asset.imageUrl);
        const dominantColor = await extractDominantColor(buffer);

        logger.info(`  Color dominante de "${asset.key}": ${dominantColor}`);

        if (!DRY_RUN) {
          await GameContext.updateOne(
            { _id: context._id, 'assets.key': asset.key },
            { $set: { 'assets.$.dominantColor': dominantColor } }
          );
        }

        totalProcessed++;
      } catch (err) {
        logger.error(`  Error procesando "${asset.key}": ${err.message}`);
        totalErrors++;
      }
    }
  }

  logger.info('--- Resumen ---');
  logger.info(`  Procesados: ${totalProcessed}`);
  logger.info(`  Omitidos (ya tienen color o sin imagen): ${totalSkipped}`);
  logger.info(`  Errores: ${totalErrors}`);

  if (DRY_RUN) {
    logger.info('  (DRY-RUN: no se realizaron cambios)');
  }

  await mongoose.disconnect();
  logger.info('Desconectado de MongoDB');
}

run().catch(err => {
  logger.error(`Error fatal: ${err.message}`);
  process.exit(1);
});
