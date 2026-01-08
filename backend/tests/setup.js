const mongoose = require('mongoose');

// Mock de Redis ANTES de importar cualquier módulo que lo use
// Usar prefijo 'mock' para que Jest permita la referencia
const mockRedisMock = require('ioredis-mock');
const mockRedisInstance = new mockRedisMock();

jest.mock('ioredis', () => {
  const mockRedisMockInner = require('ioredis-mock');
  // Cada instancia de ioredis-mock comparte el mismo almacenamiento por defecto
  return mockRedisMockInner;
});

// Ahora importar los módulos que dependen de Redis
const { app, server, gameEngine } = require('../src/server');
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

    // Disconnect RFID service to clear reconnection timers
    if (rfidService) {
      await rfidService.disconnect();
    }

    // Disconnect Redis (mock)
    try {
      await disconnectRedis();
    } catch (_) {
      // Mock may not support disconnect fully
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
    // eslint-disable-next-line no-console
    console.error('Error during Jest teardown:', error);
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    } catch (_) {
      // ignore
    }
  }
});

// Increase timeout for DB operations
jest.setTimeout(30000);
