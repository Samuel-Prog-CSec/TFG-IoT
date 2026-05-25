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
const { connectRedis, disconnectRedis } = require('../src/config/redis');
const { cacheInvalidateNamespace } = require('../src/utils/cacheHelper');
require('dotenv').config();

// Importar seeders individuales
const seedSuperAdmin = require('./00-super-admin');
const seedUsers = require('./01-users');
const seedMechanics = require('./03-mechanics');
const seedContexts = require('./04-contexts');
const seedCardDecks = require('./05-carddecks');
const seedSessions = require('./06-sessions');
const seedGamePlays = require('./07-gameplays');
const seedReportTemplates = require('./08-report-templates');

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

    // 1. Super Admin inicial
    logger.info('1️⃣  Seeding super admin...');
    const superAdmin = await seedSuperAdmin();
    if (!superAdmin) {
      throw new Error('Seeder falló: no se creó el super admin');
    }
    logger.info(`  ✓ Super admin listo: ${superAdmin.email}\n`);

    // 2. Usuarios (profesores y alumnos)
    logger.info('2️⃣  Seeding usuarios...');
    const users = await seedUsers();
    if (!users?.teachers?.length || !users?.students?.length) {
      throw new Error('Seeder falló: no se crearon teachers o students');
    }
    logger.info(`  ✓ ${users.teachers.length} profesores creados`);
    logger.info(`  ✓ ${users.students.length} alumnos creados\n`);

    // 3. Mecánicas de juego
    logger.info('3️⃣  Seeding mecánicas de juego...');
    const mechanics = await seedMechanics();
    if (!mechanics?.length) {
      throw new Error('Seeder falló: no se crearon mecánicas');
    }
    logger.info(`  ✓ ${mechanics.length} mecánicas creadas\n`);

    // 4. Contextos de juego (los assets seedeados quedan como "del sistema",
    //    sin uploadedBy: forman la base del producto y no son eliminables vía UI)
    logger.info('4️⃣  Seeding contextos de juego...');
    const contexts = await seedContexts();
    if (!contexts?.length) {
      throw new Error('Seeder falló: no se crearon contextos');
    }
    logger.info(`  ✓ ${contexts.length} contextos creados\n`);

    // 5. Mazos de tarjetas (CardDecks)
    logger.info('5️⃣  Seeding mazos de tarjetas...');
    const decks = await seedCardDecks(users, contexts);
    if (!decks?.length) {
      throw new Error('Seeder falló: no se crearon mazos');
    }
    logger.info(`  ✓ ${decks.length} mazos creados\n`);

    // 6. Sesiones de juego
    logger.info('6️⃣  Seeding sesiones de juego...');
    const sessions = await seedSessions(users, mechanics, contexts, decks);
    if (!sessions?.length) {
      throw new Error('Seeder falló: no se crearon sesiones');
    }
    logger.info(`  ✓ ${sessions.length} sesiones creadas\n`);

    // 7. Partidas individuales (GamePlays)
    logger.info('7️⃣  Seeding partidas (GamePlays)...');
    const gamePlays = await seedGamePlays(sessions, users.students);
    if (!gamePlays?.length) {
      throw new Error('Seeder falló: no se crearon partidas');
    }
    logger.info(`  ✓ ${gamePlays.length} partidas creadas\n`);

    // 8. Plantillas de informe predefinidas (T-942 Fase B).
    //    Idempotente: upsert por `key`, no falla si ya existen.
    logger.info('8️⃣  Seeding plantillas de informe...');
    const reportTemplates = await seedReportTemplates();
    logger.info(`  ✓ ${reportTemplates.length} plantillas de informe listas\n`);

    logger.info('✅ Seeders completados exitosamente!');
    logger.info('\n📊 Resumen:');
    logger.info(`   - 1 super admin`);
    logger.info(`   - ${users.teachers.length} profesores`);
    logger.info(`   - ${users.students.length} alumnos`);
    logger.info(`   - ${mechanics.length} mecánicas de juego`);
    logger.info(`   - ${contexts.length} contextos de juego`);
    logger.info(`   - ${decks.length} mazos de tarjetas`);
    logger.info(`   - ${sessions.length} sesiones de juego`);
    logger.info(`   - ${gamePlays.length} partidas (GamePlays)`);
    logger.info(`   - ${reportTemplates.length} plantillas de informe\n`);

    // Mostrar credenciales de profesores
    logger.info('🔑 Credenciales para testing:');
    logger.info('   ┌────────────────────────────────────────────┐');
    logger.info('   │  Email              │  Password            │');
    logger.info('   ├────────────────────────────────────────────┤');
    logger.info('   │  admin@test.com     │  Admin1234!          │');
    logger.info('   │  maria@test.com     │  Test1234!           │');
    logger.info('   │  carlos@test.com    │  Test1234!           │');
    logger.info('   └────────────────────────────────────────────┘');
    logger.info('');
  } catch (error) {
    logger.error('❌ Error ejecutando seeders:', error);
    throw error;
  }
}

/**
 * Vacía los caches de lectura (analytics, contextos, mecánicas) tras el seed.
 *
 * Un `seed:reset` recrea los documentos con nuevos ObjectId, así que cualquier
 * valor que quedara cacheado en Redis del seed anterior pasa a ser obsoleto
 * (p. ej. el dashboard del docente serviría IDs de sesión que ya no existen
 * hasta que expirara el TTL). Vaciar los namespaces `cache:*` deja la demo
 * consistente al instante, sin tocar los namespaces de tokens/seguridad.
 *
 * Best-effort: si Redis no está disponible (CI o entorno sin Redis) se omite
 * sin hacer fallar el seed (`connectRedis` devuelve null en desarrollo).
 */
async function flushReadCaches() {
  try {
    const client = await connectRedis();
    if (!client) {
      logger.warn('🧼 Redis no disponible; se omite el vaciado de caches de lectura\n');
      return;
    }
    for (const namespace of ['cache:analytics', 'cache:context', 'cache:mechanic']) {
      await cacheInvalidateNamespace(namespace);
    }
    logger.info('🧼 Caches de lectura (analytics/contextos/mecánicas) vaciados\n');
  } catch (error) {
    logger.warn(`🧼 No se pudo limpiar el cache de Redis (se omite): ${error.message}\n`);
  } finally {
    await disconnectRedis().catch(() => {});
  }
}

/**
 * Función principal.
 */
async function main() {
  try {
    // Parsear argumentos de línea de comandos
    // eslint-disable-next-line sonarjs/process-argv -- script CLI, parseo seguro de argumentos
    const args = process.argv.slice(2);
    const shouldReset = args.includes('--reset');

    await connectDB();

    if (shouldReset) {
      logger.info('🔄 Modo RESET activado\n');
      await cleanDatabase();
    }

    await runSeeders();

    // Tras poblar la BD, invalidar los caches de lectura para que la aplicación
    // sirva los datos recién seedeados sin esperar a que expire el TTL.
    await flushReadCaches();

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
