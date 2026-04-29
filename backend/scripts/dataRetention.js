/**
 * @fileoverview Script CLI de retención de datos — cumplimiento Art. 5.1.e RGPD.
 *
 * Esta es la entrada manual / programable externamente. La lógica vive en
 * `src/services/dataRetentionService.js` y la comparte con el worker BullMQ
 * `src/workers/dataRetentionWorker.js` (programado a las 03:00 cada día).
 *
 * Uso:
 *   node scripts/dataRetention.js              # ejecutar retención
 *   node scripts/dataRetention.js --dry-run    # solo mostrar lo que se haría
 */

const mongoose = require('mongoose');
const pino = require('pino');
const { runDataRetention } = require('../src/services/dataRetentionService');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid_games';
// eslint-disable-next-line sonarjs/process-argv -- CLI script
const DRY_RUN = process.argv.includes('--dry-run');

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss',
      ignore: 'pid,hostname'
    }
  }
});

(async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info(`Conectado a MongoDB: ${mongoose.connection.host}`);

    if (DRY_RUN) {
      logger.warn('=== MODO DRY-RUN: no se realizarán cambios ===');
    }

    const summary = await runDataRetention({ dryRun: DRY_RUN, logger });

    logger.info('=== INFORME DE RETENCIÓN ===');
    logger.info(summary);
  } catch (error) {
    logger.error({ err: error }, 'Error durante la retención de datos');
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    logger.info('Conexión a MongoDB cerrada');
  }
})();
