const mongoose = require('mongoose');
const logger = require('../src/utils/logger');

// T-905 cleanup: Sentry + Mongoose + Pino + graceful shutdown registran cada uno
// listeners sobre `process` (SIGTERM/SIGINT/exit). En la suite de Jest se acumulan
// (especialmente al importar el server) y disparan MaxListenersExceededWarning.
// Subir el límite específicamente para tests — no afecta runtime de producción.
process.setMaxListeners(50);

// T-905 B7: opt-out de MFA enforcement por defecto en tests. Los tests legacy
// de endpoints super_admin (lockout unlock, etc.) no preparan MFA token en sus
// fixtures; cuando `.env` del entorno trae `MFA_REQUIRED_FOR_SUPER_ADMIN=true`
// (QA, staging) la suite falla porque `requireMfa` devuelve 428 antes de la
// lógica del endpoint. Los tests específicos de MFA (`requireMfa.test.js`) y
// los de mfaController override esta env localmente cuando necesitan enforcement.
process.env.MFA_REQUIRED_FOR_SUPER_ADMIN = 'false';

// Mock de Redis ANTES de importar cualquier módulo que lo use
// Usar prefijo 'mock' para que Jest permita la referencia
require('ioredis-mock');

// Cada instancia de ioredis-mock comparte el mismo almacenamiento por defecto
jest.mock('ioredis', () => require('ioredis-mock'));

// Ahora importar los módulos que dependen de Redis
const { server, gameEngine } = require('../src/server');
const rfidService = require('../src/services/rfidService');
const { disconnectRedis } = require('../src/config/redis');

beforeAll(async () => {
  // Use a distinct database for testing to avoid data loss.
  //
  // AISLAMIENTO POR PROCESO (causa raíz de los tests "flaky"): el `afterAll` hace
  // `dropDatabase()` sobre esta BD. Con el nombre fijo `rfid-games-test`, dos
  // procesos de test concurrentes (dos `npm test`, o un benchmark que siembre la
  // misma BD) se pisan: el `dropDatabase` de uno borra los datos del otro a mitad
  // de test → fallos intermitentes (404/500/conteos). Sufijar la BD con worker+pid
  // la hace única por proceso, elimina la colisión y permite correr suites en
  // paralelo de forma segura. En ejecución normal (un solo `npm test`) el
  // comportamiento es idéntico salvo el nombre de la BD efímera.
  const baseUri = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/rfid-games-test';
  const worker = process.env.JEST_WORKER_ID || '1';
  let TEST_MONGO_URI;
  try {
    const parsed = new URL(baseUri);
    parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}-w${worker}-p${process.pid}`;
    TEST_MONGO_URI = parsed.toString();
  } catch {
    // Fallback defensivo si la URI no es parseable por `URL` (p. ej. multi-host).
    TEST_MONGO_URI = `${baseUri}-w${worker}-p${process.pid}`;
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(TEST_MONGO_URI);
});

afterAll(async () => {
  try {
    // Shutdown game engine (clears timers)
    if (gameEngine) {
      await gameEngine.shutdown();
    }

    // Detener servicio RFID
    if (rfidService) {
      rfidService.stop();
    }

    // Disconnect Redis (mock)
    try {
      await disconnectRedis();
    } catch (error) {
      logger.warn('Redis mock disconnect error', { error: error?.message });
    }

    // Close the server to avoid open handles
    if (server && server.listening) {
      await new Promise(resolve => server.close(resolve));
    }

    // Drop the test database after tests
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  } catch (error) {
    // Best-effort teardown: don't block test completion

    console.error('Error during Jest teardown:', error);
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    } catch (error) {
      logger.warn('Error during fallback mongoose disconnect', { error: error?.message });
    }
  }
});

// Increase timeout for DB operations
jest.setTimeout(30000);
