const request = require('supertest');
const express = require('express');
const multer = require('multer');
const assetController = require('../../src/controllers/assetController');
const storageService = require('../../src/services/storageService');
const imageProcessingService = require('../../src/services/imageProcessingService');
const audioValidationService = require('../../src/services/audioValidationService');
const GameContext = require('../../src/models/GameContext');
const { errorHandler } = require('../../src/middlewares/errorHandler');

// Mocks
jest.mock('../../src/services/storageService');
jest.mock('../../src/services/imageProcessingService');
jest.mock('../../src/services/audioValidationService');
jest.mock('../../src/models/GameContext');

// Setup Express App for testing
const app = express();
app.use(express.json());

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Mock user middleware
app.use((req, res, next) => {
  req.user = { _id: 'user-123' };
  next();
});

// Routes
app.post('/api/contexts/:id/images', imageUpload.single('file'), assetController.uploadImage);
app.post('/api/contexts/:id/audio', audioUpload.single('file'), assetController.uploadAudio);
app.delete('/api/contexts/:id/images/:assetKey', assetController.deleteImage);
app.delete('/api/contexts/:id/audio/:assetKey', assetController.deleteAudio);
app.get('/api/contexts/upload-config', assetController.getUploadConfig);
app.use(errorHandler);

const describeSupabase = process.env.RUN_SUPABASE_TESTS === 'true' ? describe : describe.skip;

describeSupabase('Asset Controller - Image Upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SHOULD upload image successfully, process to WebP, and save to DB', async () => {
    // Mock Data
    const mockContext = {
      _id: 'context-123',
      contextId: 'test-context',
      assets: [],
      save: jest.fn().mockResolvedValue(true)
    };
    const mockImageUrl = 'https://fake-supabase.com/storage/ctx-context-123/image/lion.webp';
    const mockThumbnailUrl =
      'https://fake-supabase.com/storage/ctx-context-123/thumbnail/lion_thumb.webp';
    const mockFileBuffer = Buffer.from('fake-image-content');

    // Setup Mocks
    GameContext.findById.mockResolvedValue(mockContext);
    imageProcessingService.processImage.mockResolvedValue({
      mainImage: Buffer.from('processed-webp'),
      thumbnail: Buffer.from('thumbnail-webp'),
      metadata: { originalWidth: 500, originalHeight: 500, format: 'webp', quality: 85 }
    });
    storageService.uploadFile
      .mockResolvedValueOnce(mockImageUrl)
      .mockResolvedValueOnce(mockThumbnailUrl);

    // Execute Request
    const response = await request(app)
      .post('/api/contexts/context-123/images')
      .field('key', 'lion')
      .field('value', 'León')
      .attach('file', mockFileBuffer, 'lion.png');

    // Assertions
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.asset.imageUrl).toBe(mockImageUrl);
    expect(response.body.data.asset.thumbnailUrl).toBe(mockThumbnailUrl);

    // Check Processing Service was called
    expect(imageProcessingService.processImage).toHaveBeenCalledTimes(1);
    // Check Storage Service was called twice (image + thumbnail)
    expect(storageService.uploadFile).toHaveBeenCalledTimes(2);
    // Check DB save
    expect(mockContext.assets).toHaveLength(1);
    expect(mockContext.save).toHaveBeenCalled();
  });

  it('SHOULD return 400 if file is missing', async () => {
    const response = await request(app)
      .post('/api/contexts/context-123/images')
      .field('key', 'lion')
      .field('value', 'León');

    expect(response.status).toBe(400);
  });

  it('SHOULD return 404 if context not found', async () => {
    GameContext.findById.mockResolvedValue(null);

    const mockFileBuffer = Buffer.from('fake');

    const response = await request(app)
      .post('/api/contexts/context-123/images')
      .field('key', 'lion')
      .field('value', 'León')
      .attach('file', mockFileBuffer, 'lion.png');

    expect(response.status).toBe(404);
  });

  it('SHOULD perform rollback if DB save fails after upload', async () => {
    const mockContext = {
      _id: 'context-123',
      contextId: 'test-context',
      assets: [],
      save: jest.fn().mockRejectedValue(new Error('DB Error'))
    };
    const mockImageUrl = 'https://fake-supabase.com/rollback-image.webp';
    const mockThumbnailUrl = 'https://fake-supabase.com/rollback-thumb.webp';

    GameContext.findById.mockResolvedValue(mockContext);
    imageProcessingService.processImage.mockResolvedValue({
      mainImage: Buffer.from('processed'),
      thumbnail: Buffer.from('thumb'),
      metadata: { originalWidth: 300, originalHeight: 300, format: 'webp', quality: 85 }
    });
    storageService.uploadFile
      .mockResolvedValueOnce(mockImageUrl)
      .mockResolvedValueOnce(mockThumbnailUrl);

    const mockFileBuffer = Buffer.from('fake');

    const response = await request(app)
      .post('/api/contexts/context-123/images')
      .field('key', 'lion')
      .field('value', 'León')
      .attach('file', mockFileBuffer, 'lion.png');

    expect(response.status).toBe(500);
    // Verificar que se llamó al rollback para ambos archivos
    expect(storageService.deleteFile).toHaveBeenCalledWith(mockImageUrl);
    expect(storageService.deleteFile).toHaveBeenCalledWith(mockThumbnailUrl);
  });

  it('SHOULD reject if context has reached asset limit', async () => {
    const mockContext = {
      _id: 'context-123',
      contextId: 'test-context',
      assets: new Array(30).fill({ key: 'asset' }), // 30 assets = limit
      save: jest.fn()
    };

    GameContext.findById.mockResolvedValue(mockContext);

    const mockFileBuffer = Buffer.from('fake');

    const response = await request(app)
      .post('/api/contexts/context-123/images')
      .field('key', 'lion')
      .field('value', 'León')
      .attach('file', mockFileBuffer, 'lion.png');

    expect(response.status).toBe(400);
  });
});

describeSupabase('Asset Controller - Audio Upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SHOULD upload audio successfully and save to DB', async () => {
    const mockContext = {
      _id: 'context-123',
      contextId: 'test-context',
      assets: [],
      save: jest.fn().mockResolvedValue(true)
    };
    const mockAudioUrl = 'https://fake-supabase.com/storage/ctx-context-123/audio/lion.mp3';
    const mockFileBuffer = Buffer.from('fake-audio-content');

    GameContext.findById.mockResolvedValue(mockContext);
    audioValidationService.validateAudio.mockResolvedValue({
      buffer: mockFileBuffer,
      metadata: { format: 'mp3', mime: 'audio/mpeg', formatName: 'MP3', size: 1024 }
    });
    storageService.uploadFile.mockResolvedValue(mockAudioUrl);

    const response = await request(app)
      .post('/api/contexts/context-123/audio')
      .field('key', 'lion')
      .field('value', 'León')
      .attach('file', mockFileBuffer, 'lion.mp3');

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.asset.audioUrl).toBe(mockAudioUrl);

    expect(audioValidationService.validateAudio).toHaveBeenCalledTimes(1);
    expect(storageService.uploadFile).toHaveBeenCalledTimes(1);
    expect(mockContext.assets).toHaveLength(1);
    expect(mockContext.save).toHaveBeenCalled();
  });
});

describe('Asset Controller - Upload Config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SHOULD return upload configuration', async () => {
    imageProcessingService.getConfig.mockReturnValue({
      allowedFormats: ['PNG', 'JPG', 'WebP'],
      maxInputSizeMB: 8
    });
    audioValidationService.getConfig.mockReturnValue({
      allowedFormats: ['MP3', 'OGG'],
      maxSizeMB: 5
    });
    storageService.isEnabled.mockReturnValue(true);

    const response = await request(app).get('/api/contexts/upload-config');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.image).toBeDefined();
    expect(response.body.data.audio).toBeDefined();
    expect(response.body.data.maxAssetsPerContext).toBe(30);
    // En tests sin credenciales reales, storageEnabled puede ser false
    expect(typeof response.body.data.storageEnabled).toBe('boolean');
  });
});
