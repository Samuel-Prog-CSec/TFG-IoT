/**
 * @fileoverview Migración one-shot: elimina 10 índices monocampo REDUNDANTES.
 *
 * Cada uno es PREFIJO EXACTO de un índice compuesto ya existente, de modo que
 * MongoDB ya resolvía esas consultas con el compuesto. Mantenerlos solo añadía
 * coste de escritura (gameplays/notifications se escriben con mucha frecuencia)
 * y storage de índice en Atlas M0 (512 MB), sin ninguna ganancia de lectura.
 *
 * Las DECLARACIONES ya se quitaron de los modelos (schema.index() y `index: true`),
 * por lo que en una BD nueva estos índices no llegan a crearse. Este script limpia
 * las BD ya desplegadas (donde `autoIndex` los creó en arranques previos).
 *
 * Idempotente: si un índice ya no existe, lo salta.
 *
 * Uso (dentro del contenedor backend o con MONGO_URI apuntando al Mongo correcto):
 *   npm run migrate:drop-redundant-indexes
 *   npm run migrate:drop-redundant-indexes -- --dry-run
 */

const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../src/config/database');
const logger = require('../src/utils/logger');

dotenv.config();

// Script de administrador ejecutado manualmente; process.argv es seguro aqui.
// eslint-disable-next-line sonarjs/process-argv
const isDryRun = process.argv.includes('--dry-run');

// Cada entrada: el índice monocampo a eliminar y el compuesto que ya lo cubre
// (su prefijo). Verificado contra el volcado real de índices de la BD.
const REDUNDANT_INDEXES = [
  {
    collection: 'gameplays',
    index: 'playerId_1',
    coveredBy: 'playerId_1_status_1_completedAt_-1'
  },
  {
    collection: 'gameplays',
    index: 'sessionId_1',
    coveredBy: 'sessionId_1_playerId_1_status_1'
  },
  {
    collection: 'users',
    index: 'role_1',
    coveredBy: 'role_1_accountStatus_1'
  },
  {
    collection: 'users',
    index: 'createdBy_1',
    coveredBy: 'createdBy_1_role_1'
  },
  {
    collection: 'smartalerts',
    index: 'teacherId_1',
    coveredBy: 'teacherId_1_status_1_pinned_-1_detectedAt_-1'
  },
  {
    collection: 'systemalerts',
    index: 'status_1',
    coveredBy: 'status_1_pinned_-1_severity_1_detectedAt_-1'
  },
  {
    collection: 'systemalerts',
    index: 'source_1',
    coveredBy: 'source_1_status_1'
  },
  {
    collection: 'notifications',
    index: 'userId_1',
    coveredBy: 'userId_1_createdAt_-1'
  },
  {
    collection: 'generated_reports',
    index: 'teacherId_1',
    coveredBy: 'teacherId_1_generatedAt_-1'
  },
  {
    collection: 'systemannouncements',
    index: 'active_1',
    coveredBy: 'active_1_audience_1_publishedAt_-1'
  }
];

const dropOne = async ({ collection, index, coveredBy }) => {
  const coll = mongoose.connection.db.collection(collection);
  const existing = await coll.indexes().catch(() => []);
  const present = existing.some(i => i.name === index);

  if (!present) {
    logger.info(`[drop-redundant-indexes] ${collection}.${index} ya ausente — skip`);
    return 'absent';
  }
  if (isDryRun) {
    logger.info(
      `[drop-redundant-indexes] (dry-run) eliminaría ${collection}.${index} (cubierto por ${coveredBy})`
    );
    return 'dry-run';
  }
  await coll.dropIndex(index);
  logger.info(`[drop-redundant-indexes] DROP ${collection}.${index} (cubierto por ${coveredBy})`);
  return 'dropped';
};

const migrate = async () => {
  await connectDB();
  logger.info(`[drop-redundant-indexes] Iniciando (${isDryRun ? 'DRY-RUN' : 'aplicar cambios'})`);

  const results = { dropped: 0, absent: 0, 'dry-run': 0 };
  for (const entry of REDUNDANT_INDEXES) {
    const outcome = await dropOne(entry);
    results[outcome] += 1;
  }

  logger.info(
    `[drop-redundant-indexes] Completado. dropped=${results.dropped}, absent=${results.absent}, dryRun=${results['dry-run']}`
  );
  await disconnectDB();
  process.exit(0);
};

migrate().catch(err => {
  logger.error(`[drop-redundant-indexes] Error: ${err.message}`);
  process.exit(1);
});
