/**
 * @fileoverview Script de migración: eliminar profile.birthdate de estudiantes.
 *
 * Fundamentación normativa:
 * - Art. 5.1.c RGPD (minimización de datos): la fecha de nacimiento completa
 *   tiene alto potencial identificativo y no aporta valor pedagógico respecto a profile.age.
 * - Considerando 39 RGPD: los datos deben ser estrictamente necesarios.
 *
 * Acciones:
 * 1. Para estudiantes con birthdate pero sin age: calcular age desde birthdate.
 * 2. Eliminar profile.birthdate y lastLoginAt de todos los estudiantes.
 *
 * Uso:
 *   node scripts/migrateBirthdate.js            # Ejecutar migración
 *   node scripts/migrateBirthdate.js --dry-run   # Solo mostrar lo que se haría
 */

const mongoose = require('mongoose');
const pino = require('pino');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid_games';
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

const calculateAge = birthdate => {
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

async function run() {
  logger.info('=== Migración: Eliminar birthdate de estudiantes (Art. 5.1.c RGPD) ===');
  if (DRY_RUN) {
    logger.warn('=== MODO DRY-RUN: no se realizarán cambios ===');
  }

  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');

  // Fase 1: Convertir birthdate a age donde sea necesario
  const studentsWithBirthdate = await usersCollection
    .find({
      role: 'student',
      'profile.birthdate': { $exists: true, $ne: null }
    })
    .toArray();

  logger.info(`Estudiantes con birthdate: ${studentsWithBirthdate.length}`);

  let convertedCount = 0;
  for (const student of studentsWithBirthdate) {
    if (!student.profile?.age && student.profile?.birthdate) {
      const age = calculateAge(student.profile.birthdate);
      if (DRY_RUN) {
        logger.info(`[DRY-RUN] Convertiría birthdate a age=${age} para ${student._id}`);
      } else {
        await usersCollection.updateOne({ _id: student._id }, { $set: { 'profile.age': age } });
      }
      convertedCount++;
    }
  }

  logger.info(`Birthdates convertidos a age: ${convertedCount}`);

  // Fase 2: Eliminar birthdate y lastLoginAt de todos los estudiantes
  if (DRY_RUN) {
    logger.info(
      `[DRY-RUN] Se haría $unset de profile.birthdate y lastLoginAt en ${studentsWithBirthdate.length} estudiantes`
    );
  } else {
    const result = await usersCollection.updateMany(
      { role: 'student' },
      {
        $unset: {
          'profile.birthdate': 1,
          lastLoginAt: 1
        }
      }
    );
    logger.info(`Campos eliminados: ${result.modifiedCount} documentos actualizados`);
  }

  // Verificación
  const remaining = await usersCollection.countDocuments({
    role: 'student',
    'profile.birthdate': { $exists: true, $ne: null }
  });

  if (!DRY_RUN && remaining > 0) {
    logger.error(`ATENCIÓN: Quedan ${remaining} estudiantes con birthdate`);
    process.exitCode = 1;
  } else {
    logger.info(
      DRY_RUN
        ? 'DRY-RUN completado exitosamente'
        : 'Migración completada exitosamente — birthdate eliminado de todos los estudiantes'
    );
  }
}

(async () => {
  try {
    await connect();
    await run();
  } catch (error) {
    logger.error({ err: error }, 'Error durante la migración');
    process.exitCode = 1;
  } finally {
    await disconnect();
  }
})();
