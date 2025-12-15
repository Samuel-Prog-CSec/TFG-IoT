const mongoose = require('mongoose');
const { app, server, gameEngine } = require('../src/server'); // Import app, server AND gameEngine
const { stopBlacklistCleanup } = require('../src/middlewares/auth');
const rfidService = require('../src/services/rfidService');

beforeAll(async () => {
  // Use a distinct database for testing to avoid data loss
  const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/rfid-games-test';
  
  if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
  }
  
  await mongoose.connect(TEST_MONGO_URI);
});

afterAll(async () => {
    // Drop the test database after tests
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    }
    // Close the server to avoid open handles
    if (server) {
        server.close();
    }
    // Shutdown game engine (clears timers)
    if (gameEngine) {
        await gameEngine.shutdown();
    }
    
    // Stop auth blacklist cleanup interval
    stopBlacklistCleanup();
    
    // Disconnect RFID service to clear reconnection timers
    if (rfidService) {
        rfidService.disconnect();
    }
});

// Increase timeout for DB operations
jest.setTimeout(30000);
