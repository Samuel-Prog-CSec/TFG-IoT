/**
 * @fileoverview Script de retención de datos — cumplimiento Art. 5.1.e RGPD.
 *
 * Fundamentación normativa:
 * - Art. 5.1.e RGPD: los datos deben conservarse durante no más tiempo del necesario.
 * - Considerando 26 RGPD: los datos anonimizados no están sujetos al RGPD.
 * - Art. 17.1 RGPD: derecho de supresión.
 *
 * Acciones:
 * 1. Anonimizar GamePlays completados hace más de 12 meses (eliminar playerId, cardUid).
 * 2. Eliminar (hard delete) estudiantes inactivos hace más de 24 meses.
 *
 * Uso:
 *   node scripts/dataRetention.js            # Ejecutar retención
 *   node scripts/dataRetention.js --dry-run   # Solo mostrar lo que se haría
 */

const mongoose = require('mongoose');
const pino = require('pino');
const {
  GAMEPLAY_ANONYMIZATION_MONTHS,
  INACTIVE_STUDENT_DELETION_MONTHS
} = require('../src/config/dataRetention');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid_games';
// eslint-disable-next-line sonarjs/process-argv -- script CLI, uso seguro de process.argv
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

const connect = async () => {
  await mongoose.connect(MONGODB_URI);
  logger.info(`Conectado a MongoDB: ${mongoose.connection.host}`);
};

const disconnect = async () => {
  await mongoose.connection.close();
  logger.info('Conexión a MongoDB cerrada');
};

function monthsAgo(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
}

async function anonymizeOldGamePlays(db) {
  const cutoffDate = monthsAgo(GAMEPLAY_ANONYMIZATION_MONTHS);
  const gameplaysCollection = db.collection('gameplays');

  logger.info(
    `Buscando GamePlays anteriores a ${cutoffDate.toISOString()} (${GAMEPLAY_ANONYMIZATION_MONTHS} meses)...`
  );

  // Contar candidatos
  const candidateCount = await gameplaysCollection.countDocuments({
    $or: [
      { completedAt: { $lt: cutoffDate } },
      {
        completedAt: null,
        updatedAt: { $lt: cutoffDate },
        status: { $in: ['completed', 'abandoned'] }
      }
    ],
    playerId: { $ne: null }
  });

  logger.info(`GamePlays candidatos a anonimización: ${candidateCount}`);

  if (candidateCount === 0) {
    logger.info('No hay GamePlays para anonimizar');
    return 0;
  }

  if (DRY_RUN) {
    logger.info(
      `[DRY-RUN] Se anonimizarían ${candidateCount} GamePlays (eliminar playerId, limpiar cardUid)`
    );
    return candidateCount;
  }

  // Anonimizar: eliminar playerId y limpiar cardUid de eventos
  const result = await gameplaysCollection.updateMany(
    {
      $or: [
        { completedAt: { $lt: cutoffDate } },
        {
          completedAt: null,
          updatedAt: { $lt: cutoffDate },
          status: { $in: ['completed', 'abandoned'] }
        }
      ],
      playerId: { $ne: null }
    },
    [
      {
        $set: {
          playerId: null,
          events: {
            $map: {
              input: '$events',
              as: 'event',
              in: {
                $mergeObjects: ['$$event', { cardUid: null }]
              }
            }
          }
        }
      }
    ]
  );

  logger.info(
    `GamePlays anonimizados: ${result.modifiedCount} (Considerando 26 RGPD — datos anónimos)`
  );
  return result.modifiedCount;
}

async function deleteInactiveStudents(db) {
  const cutoffDate = monthsAgo(INACTIVE_STUDENT_DELETION_MONTHS);
  const usersCollection = db.collection('users');
  const gameplaysCollection = db.collection('gameplays');

  logger.info(
    `Buscando estudiantes inactivos desde antes de ${cutoffDate.toISOString()} (${INACTIVE_STUDENT_DELETION_MONTHS} meses)...`
  );

  const candidates = await usersCollection
    .find({
      role: 'student',
      status: 'inactive',
      updatedAt: { $lt: cutoffDate }
    })
    .project({ _id: 1 })
    .toArray();

  logger.info(`Estudiantes inactivos candidatos a borrado: ${candidates.length}`);

  if (candidates.length === 0) {
    logger.info('No hay estudiantes inactivos para eliminar');
    return { studentsDeleted: 0, gamePlaysDeleted: 0 };
  }

  const studentIds = candidates.map(c => c._id);

  if (DRY_RUN) {
    const relatedPlays = await gameplaysCollection.countDocuments({
      playerId: { $in: studentIds }
    });
    logger.info(
      `[DRY-RUN] Se eliminarían ${candidates.length} estudiantes y ${relatedPlays} GamePlays asociados`
    );
    return {
      studentsDeleted: candidates.length,
      gamePlaysDeleted: relatedPlays
    };
  }

  // Cascada: eliminar GamePlays primero, luego Users
  const playsResult = await gameplaysCollection.deleteMany({
    playerId: { $in: studentIds }
  });

  const usersResult = await usersCollection.deleteMany({
    _id: { $in: studentIds }
  });

  logger.info(
    `Estudiantes eliminados: ${usersResult.deletedCount}, GamePlays eliminados: ${playsResult.deletedCount} (Art. 17 RGPD)`
  );

  return {
    studentsDeleted: usersResult.deletedCount,
    gamePlaysDeleted: playsResult.deletedCount
  };
}

async function run() {
  logger.info('=== Política de retención de datos (Art. 5.1.e RGPD) ===');
  if (DRY_RUN) {
    logger.warn('=== MODO DRY-RUN: no se realizarán cambios ===');
  }

  const db = mongoose.connection.db;

  // Fase 1: Anonimizar GamePlays antiguos
  const anonymized = await anonymizeOldGamePlays(db);

  // Fase 2: Eliminar estudiantes inactivos
  const deleted = await deleteInactiveStudents(db);

  // Informe final
  logger.info('=== INFORME DE RETENCIÓN ===');
  logger.info(`GamePlays anonimizados: ${anonymized}`);
  logger.info(`Estudiantes eliminados: ${deleted.studentsDeleted}`);
  logger.info(`GamePlays eliminados (cascada): ${deleted.gamePlaysDeleted}`);
  logger.info(
    DRY_RUN ? 'DRY-RUN completado — no se realizaron cambios' : 'Retención completada exitosamente'
  );
}

(async () => {
  try {
    await connect();
    await run();
  } catch (error) {
    logger.error({ err: error }, 'Error durante la retención de datos');
    process.exitCode = 1;
  } finally {
    await disconnect();
  }
})();
