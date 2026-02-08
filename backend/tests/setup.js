const mongoose = require('mongoose');
const logger = require('../src/utils/logger');

// Mock de Redis ANTES de importar cualquier módulo que lo use
// Usar prefijo 'mock' para que Jest permita la referencia
require('ioredis-mock');

jest.mock('ioredis', () => {
  const mockRedisMockInner = require('ioredis-mock');
  // Cada instancia de ioredis-mock comparte el mismo almacenamiento por defecto
  return mockRedisMockInner;
});

// Ahora importar los módulos que dependen de Redis
const { server, gameEngine } = require('../src/server');
const rfidService = require('../src/services/rfidService');
const { disconnectRedis } = require('../src/config/redis');

beforeAll(async () => {
  // Use a distinct database for testing to avoid data loss
  const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/rfid-games-test';

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
