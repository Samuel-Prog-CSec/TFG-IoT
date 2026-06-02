/**
 * @fileoverview Seed bulk de alumnos sintéticos para validar virtualización
 * en /admin/students (T-952 Fase B). Solo para entornos dev/QA.
 *
 * Inserta N alumnos sintéticos vinculados a un teacher existente, con
 * consentimiento granted y métricas vacías. Salta si ya hay >= N
 * alumnos en bulk seed (idempotente).
 *
 * Uso:
 *   docker compose exec backend node scripts/seed-bulk-students.js [count]
 *
 *   Por defecto count = 1200 (supera el threshold 50 del hook
 *   `useVirtualizedList` con holgura).
 */

const mongoose = require('mongoose');
const path = require('path');

// Cargar variables de entorno desde la raíz del backend (mismo patrón que
// otros scripts del directorio).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../src/models/User');
const logger = require('../src/utils/logger');

const FIRST_NAMES = [
  'Aitor',
  'Beatriz',
  'Cristina',
  'David',
  'Esther',
  'Fernando',
  'Gabriela',
  'Héctor',
  'Iris',
  'Jaime',
  'Kira',
  'Lorena',
  'Manuel',
  'Nuria',
  'Óscar',
  'Patricia',
  'Quim',
  'Raquel',
  'Sergio',
  'Tania',
  'Unai',
  'Vega',
  'Wendy',
  'Xavi',
  'Yaiza',
  'Zoe',
  'Alba',
  'Borja',
  'Clara',
  'Diana',
  'Enrique',
  'Fátima',
  'Guillermo',
  'Helena',
  'Ignacio',
  'Julia',
  'Karim',
  'Lola',
  'Marco',
  'Noa',
  'Olivia',
  'Pablo',
  'Rocío',
  'Salvador'
];

const LAST_NAMES = [
  'Aguilar',
  'Bermúdez',
  'Castillo',
  'Delgado',
  'Esteban',
  'Flores',
  'Guzmán',
  'Herrera',
  'Iglesias',
  'Jiménez',
  'Kowalski',
  'Lara',
  'Mendoza',
  'Navarro',
  'Ortega',
  'Peña',
  'Quintero',
  'Ramírez',
  'Sosa',
  'Trujillo',
  'Urbina',
  'Vargas',
  'Wong',
  'Yuste',
  'Zambrano'
];

const CLASSROOMS = ['Infantil A', 'Infantil B', 'Infantil C', 'Infantil D', 'Infantil E'];
const AGES = [4, 5, 6];
const BULK_MARKER = '[BULK-QA]';

function pickFromArray(arr, idx) {
  return arr[idx % arr.length];
}

function generateName(idx) {
  const first = pickFromArray(FIRST_NAMES, idx);
  const last1 = pickFromArray(LAST_NAMES, idx * 7 + 3);
  const last2 = pickFromArray(LAST_NAMES, idx * 13 + 11);
  // Marker en el nombre permite identificar y limpiar este seed después.
  return `${first} ${last1} ${last2} ${BULK_MARKER}`;
}

async function run() {
  // eslint-disable-next-line sonarjs/process-argv -- script CLI de dev: lee el count de partidas de argv
  const count = Number(process.argv[2]) || 1200;
  if (!Number.isFinite(count) || count <= 0) {
    // eslint-disable-next-line sonarjs/process-argv -- script CLI de dev: argv en el mensaje de error
    logger.error(`count inválido: ${process.argv[2]}`);
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI || 'mongodb://mongo:27017/rfid-games';
  await mongoose.connect(mongoUri);
  logger.info(`[seed-bulk] Conectado a ${mongoUri}`);

  try {
    // Verificar idempotencia: si ya hay >=count students con marker, salir.
    const existing = await User.countDocuments({
      role: 'student',
      name: { $regex: BULK_MARKER.replace(/[[\]]/g, '\\$&') }
    });
    if (existing >= count) {
      logger.info(`[seed-bulk] Ya existen ${existing} students bulk. Nada que hacer.`);
      return;
    }

    // Localizar un profesor existente como createdBy. El seeder regular ya
    // crea maria@test.com — esperamos que esté presente.
    const teacher = await User.findOne({ email: 'maria@test.com' });
    if (!teacher) {
      logger.error('[seed-bulk] No se encuentra maria@test.com. Ejecuta `npm run seed` primero.');
      process.exit(1);
    }

    const remaining = count - existing;
    logger.info(`[seed-bulk] Insertando ${remaining} students bulk vinculados a ${teacher.email}…`);

    const docs = Array.from({ length: remaining }, (_, i) => {
      const idx = existing + i;
      return {
        name: generateName(idx),
        role: 'student',
        profile: {
          age: pickFromArray(AGES, idx),
          classroom: pickFromArray(CLASSROOMS, idx),
          avatar: null
        },
        consent: {
          granted: true,
          grantedBy: `Tutor sintético #${idx}`,
          grantedAt: new Date(),
          purposes: ['educational_tracking', 'performance_analytics'],
          policyVersion: '1.0',
          withdrawnAt: null
        },
        status: 'active',
        createdBy: teacher._id,
        studentMetrics: {
          totalGamesPlayed: 0,
          totalScore: 0,
          averageScore: 0,
          bestScore: 0,
          totalCorrectAnswers: 0,
          totalErrors: 0,
          totalTimeouts: 0,
          totalAbandonedGames: 0,
          averageResponseTime: 0,
          lastPlayedAt: null
        }
      };
    });

    // insertMany con `ordered: false` para que un duplicate name no rompa el batch.
    const result = await User.insertMany(docs, { ordered: false, rawResult: false });
    logger.info(`[seed-bulk] Insertados ${result.length} students bulk.`);
  } catch (err) {
    // BulkWriteError con writeErrors detallados — los registramos sin fallar
    // el script completo para que la mayoría se inserten.
    const inserted = err.result?.insertedCount;
    if (Number.isFinite(inserted)) {
      logger.warn(
        `[seed-bulk] Partial insert (${inserted} ok, ${err.writeErrors?.length ?? 0} errors).`
      );
    } else {
      logger.error('[seed-bulk] Error inesperado:', err);
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

run();
