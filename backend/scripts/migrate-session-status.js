/**
 * @fileoverview Migración de estados de GameSession: paused -> active.
 * Ejecutar manualmente al desplegar la eliminación del estado paused.
 *
 * Uso:
 *   node backend/scripts/migrate-session-status.js
 */

const dotenv = require('dotenv');
const { connectDB, disconnectDB } = require('../src/config/database');
const GameSession = require('../src/models/GameSession');
const logger = require('../src/utils/logger');

dotenv.config();

const migrate = async () => {
  try {
    await connectDB();

    const result = await GameSession.updateMany(
      { status: 'paused' },
      { $set: { status: 'active' } }
    );

    logger.info('Migración de sesiones completada', {
      matched: result.matchedCount,
      modified: result.modifiedCount
    });
  } catch (error) {
    logger.error('Error en migración de sesiones', { message: error.message });
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
};

migrate();
