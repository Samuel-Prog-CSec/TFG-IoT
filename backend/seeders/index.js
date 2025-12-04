/**
 * @fileoverview Seeder principal - Ejecutor de todos los seeders en orden.
 * Permite resetear la base de datos y poblarla con datos de prueba.
 *
 * Uso:
 *   npm run seed          - Ejecuta todos los seeders
 *   npm run seed:reset    - Limpia la BD y ejecuta seeders desde cero
 *
 * @module seeders/index
 */

const mongoose = require('mongoose');
const logger = require('../src/utils/logger');
require('dotenv').config();

// Importar seeders individuales
const seedUsers = require('./01-users');
const seedCards = require('./02-cards');
const seedMechanics = require('./03-mechanics');
const seedContexts = require('./04-contexts');
const seedSessions = require('./05-sessions');
const seedGamePlays = require('./06-gameplays');

/**
 * Conecta a la base de datos.
 */
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });
    logger.info('📦 Base de datos conectada para seeders');
  } catch (error) {
    logger.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  }
}

/**
 * Limpia todas las colecciones de la base de datos.
 */
async function cleanDatabase() {
  try {
    const collections = await mongoose.connection.db.collections();

    logger.info('🧹 Limpiando base de datos...');

    for (const collection of collections) {
      await collection.deleteMany({});
      logger.info(`  ✓ Colección ${collection.collectionName} limpiada`);
    }

    logger.info('✅ Base de datos limpiada exitosamente\n');
  } catch (error) {
    logger.error('❌ Error limpiando base de datos:', error);
    throw error;
  }
}

/**
 * Ejecuta todos los seeders en orden.
 */
async function runSeeders() {
  try {
    logger.info('🌱 Iniciando seeders...\n');

    // 1. Usuarios (profesores y alumnos)
    logger.info('1️⃣  Seeding usuarios...');
    const users = await seedUsers();
    logger.info(`  ✓ ${users.teachers.length} profesores creados`);
    logger.info(`  ✓ ${users.students.length} alumnos creados\n`);

    // 2. Tarjetas RFID
    logger.info('2️⃣  Seeding tarjetas RFID...');
    const cards = await seedCards();
    logger.info(`  ✓ ${cards.length} tarjetas creadas\n`);

    // 3. Mecánicas de juego
    logger.info('3️⃣  Seeding mecánicas de juego...');
    const mechanics = await seedMechanics();
    logger.info(`  ✓ ${mechanics.length} mecánicas creadas\n`);

    // 4. Contextos de juego
    logger.info('4️⃣  Seeding contextos de juego...');
    const contexts = await seedContexts();
    logger.info(`  ✓ ${contexts.length} contextos creados\n`);

    // 5. Sesiones de juego
    logger.info('5️⃣  Seeding sesiones de juego...');
    const sessions = await seedSessions(users, mechanics, contexts, cards);
    logger.info(`  ✓ ${sessions.length} sesiones creadas\n`);

    // 6. Partidas individuales (GamePlays)
    logger.info('6️⃣  Seeding partidas (GamePlays)...');
    const gamePlays = await seedGamePlays(sessions, users.students);
    logger.info(`  ✓ ${gamePlays.length} partidas creadas\n`);

    logger.info('✅ Seeders completados exitosamente!');
    logger.info('\n📊 Resumen:');
    logger.info(`   - ${users.teachers.length} profesores`);
    logger.info(`   - ${users.students.length} alumnos`);
    logger.info(`   - ${cards.length} tarjetas RFID`);
    logger.info(`   - ${mechanics.length} mecánicas de juego`);
    logger.info(`   - ${contexts.length} contextos de juego`);
    logger.info(`   - ${sessions.length} sesiones de juego`);
    logger.info(`   - ${gamePlays.length} partidas (GamePlays)\n`);

    // Mostrar credenciales de profesores
    logger.info('🔑 Credenciales de profesores para testing:');
    logger.info('   ┌────────────────────────────────────────────┐');
    logger.info('   │  Email              │  Password            │');
    logger.info('   ├────────────────────────────────────────────┤');
    logger.info('   │  maria@test.com     │  Test1234!           │');
    logger.info('   │  carlos@test.com    │  Test1234!           │');
    logger.info('   │  ana@test.com       │  Test1234!           │');
    logger.info('   │  admin@test.com     │  Admin1234!          │');
    logger.info('   └────────────────────────────────────────────┘');
    logger.info('');
  } catch (error) {
    logger.error('❌ Error ejecutando seeders:', error);
    throw error;
  }
}

/**
 * Función principal.
 */
async function main() {
  try {
    // Parsear argumentos de línea de comandos
    const args = process.argv.slice(2);
    const shouldReset = args.includes('--reset');

    await connectDB();

    if (shouldReset) {
      logger.info('🔄 Modo RESET activado\n');
      await cleanDatabase();
    }

    await runSeeders();

    await mongoose.connection.close();
    logger.info('👋 Conexión a MongoDB cerrada');

    process.exit(0);
  } catch (error) {
    logger.error('💥 Error fatal:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Ejecutar solo si se llama directamente
if (require.main === module) {
  main();
}

module.exports = { runSeeders, cleanDatabase };
