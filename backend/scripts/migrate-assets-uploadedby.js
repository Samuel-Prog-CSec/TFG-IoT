/**
 * @fileoverview Migracion: marca como "del sistema" (uploadedBy=null) los assets
 * seedeados que conocemos por su key estable.
 *
 * Contexto:
 *   ADR-053 introduce el campo `uploadedBy` en cada asset de GameContext. La politica
 *   final (ver "Sesion QA 2026-04-17") es:
 *
 *     - asset.uploadedBy = ObjectId<User> => solo ese usuario puede gestionarlo
 *     - asset.uploadedBy = null           => asset "del sistema": NO se puede eliminar
 *                                            individualmente desde la UI; solo se
 *                                            elimina al borrar el contexto entero
 *                                            (accion exclusiva del super_admin).
 *
 *   El super_admin NO tiene override sobre assets individuales: gestiona contextos
 *   como "carpetas", no el contenido subido por profesores.
 *
 * Comportamiento:
 *   1. Recorre todos los GameContext y los assets seedeados (cuya `key` aparece en
 *      la lista canonica del seeder 04-contexts.js).
 *   2. Si el asset tiene cualquier valor en `uploadedBy`, lo pone a null.
 *   3. Idempotente.
 *
 * Uso:
 *   node scripts/migrate-assets-uploadedby.js                 # ejecuta la migracion
 *   node scripts/migrate-assets-uploadedby.js --dry-run       # simula sin escribir
 *
 * @module scripts/migrate-assets-uploadedby
 */

const mongoose = require('mongoose');
const logger = require('../src/utils/logger');
const GameContext = require('../src/models/GameContext');

require('dotenv').config();

const isDryRun = process.argv.includes('--dry-run');

// Lista canonica de keys seedeadas por contexto (espejo de seeders/04-contexts.js).
// Cualquier asset cuya key NO este aqui se considera subido por un profesor y NO se
// modifica.
const SEED_KEYS_BY_CONTEXT = {
  'geography-europe': ['spain', 'france', 'italy', 'germany', 'portugal', 'greece'],
  'animals-farm': ['cow', 'pig', 'chicken', 'horse', 'duck', 'cat'],
  'colors-basic': ['red', 'blue', 'green', 'yellow', 'orange', 'purple'],
  'numbers-1-6': ['one', 'two', 'three', 'four', 'five', 'six'],
  'shapes-basic': ['circle', 'square', 'triangle', 'star', 'heart', 'diamond']
};

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  logger.info('Migracion uploadedBy: conectado a MongoDB');
}

async function migrate() {
  const contexts = await GameContext.find({});
  logger.info(`Migracion uploadedBy: ${contexts.length} contextos en BD`);

  let totalAssets = 0;
  let resetAssets = 0;
  let skippedAssets = 0;

  for (const context of contexts) {
    const seedKeys = SEED_KEYS_BY_CONTEXT[context.contextId] || [];
    let modified = false;

    for (const asset of context.assets) {
      totalAssets += 1;
      const isSeed = seedKeys.includes(asset.key);

      if (isSeed) {
        if (asset.uploadedBy) {
          asset.uploadedBy = null;
          resetAssets += 1;
          modified = true;
        }
      } else {
        skippedAssets += 1;
      }
    }

    if (modified && !isDryRun) {
      await context.save();
    }
  }

  logger.info(
    `Migracion uploadedBy: ${resetAssets} assets seed reseteados a null, ` +
      `${skippedAssets} assets de profesor ignorados, ${totalAssets} totales`
  );

  if (isDryRun) {
    logger.warn('DRY RUN: ningun documento fue modificado en BD');
  }
}

async function main() {
  try {
    await connectDB();
    await migrate();
    await mongoose.connection.close();
    logger.info('Migracion uploadedBy: completada');
    process.exit(0);
  } catch (error) {
    logger.error(`Migracion uploadedBy fallo: ${error.message}`);
    await mongoose.connection.close();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { migrate };
