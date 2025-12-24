const request = require('supertest');
const express = require('express');
const multer = require('multer');
const assetController = require('../../src/controllers/assetController');
const storageService = require('../../src/services/storageService');
const GameContext = require('../../src/models/GameContext');

// Mocks
jest.mock('../../src/services/storageService');
jest.mock('../../src/models/GameContext');

// Setup Express App for testing
const app = express();
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/contexts/:contextId/assets', upload.single('file'), assetController.uploadAsset);

const describeSupabase = process.env.RUN_SUPABASE_TESTS === 'true' ? describe : describe.skip;

describeSupabase('Asset Controller - Upload', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SHOULD upload asset successfully and save to DB', async () => {
    // Mock Data
    const mockContext = { 
      _id: 'context-123', 
      assets: [], 
      save: jest.fn().mockResolvedValue(true) 
    };
    const mockPublicUrl = 'https://fake-supabase.com/storage/ctx-context-123/image/test.png';
    const mockFileBuffer = Buffer.from('fake-image-content');

    // Setup Mocks
    GameContext.findById.mockResolvedValue(mockContext);
    storageService.uploadFile.mockResolvedValue(mockPublicUrl);

    // Execute Request
    const response = await request(app)
      .post('/api/contexts/context-123/assets')
      .field('key', 'lion')
      .field('value', 'León')
      .field('type', 'image')
      .attach('file', mockFileBuffer, 'lion.png');

    // Assertions
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.imageUrl).toBe(mockPublicUrl);
    
    // Check Storage Service was called correctly
    expect(storageService.uploadFile).toHaveBeenCalledTimes(1);
    // Check DB save
    expect(mockContext.assets).toHaveLength(1);
    expect(mockContext.save).toHaveBeenCalled();
  });

  it('SHOULD return 400 if file is missing', async () => {
    const response = await request(app)
      .post('/api/contexts/context-123/assets')
      .field('key', 'lion')
      .field('value', 'León')
      .field('type', 'image');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/no se ha subido ningún archivo/i);
  });

  it('SHOULD return 404 if context not found', async () => {
    GameContext.findById.mockResolvedValue(null);

    const mockFileBuffer = Buffer.from('fake');
    
    const response = await request(app)
      .post('/api/contexts/context-123/assets')
      .field('key', 'lion')
      .field('value', 'León')
      .field('type', 'image')
      .attach('file', mockFileBuffer, 'lion.png');

    expect(response.status).toBe(404);
  });

  it('SHOULD perform rollback (delete file) if DB save fails', async () => {
    const mockContext = { 
        _id: 'context-123', 
        assets: [], 
        save: jest.fn().mockRejectedValue(new Error('DB Error')) 
    };
    const mockPublicUrl = 'https://fake-supabase.com/rollback.png';
    
    GameContext.findById.mockResolvedValue(mockContext);
    storageService.uploadFile.mockResolvedValue(mockPublicUrl);

    const mockFileBuffer = Buffer.from('fake');

    const response = await request(app)
      .post('/api/contexts/context-123/assets')
      .field('key', 'lion')
      .field('value', 'León')
      .field('type', 'image')
      .attach('file', mockFileBuffer, 'lion.png');

    expect(response.status).toBe(500);
    // Verificar que se llamó al rollback
    expect(storageService.deleteFile).toHaveBeenCalledWith(mockPublicUrl);
  });
});
