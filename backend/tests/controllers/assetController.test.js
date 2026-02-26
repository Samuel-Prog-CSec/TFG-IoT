const request = require('supertest');

const CONTEXT_ID = '507f1f77bcf86cd799439011';
const describeSupabase = process.env.RUN_SUPABASE_TESTS === 'true' ? describe : describe.skip;

let app;
let storageService;
let imageProcessingService;
let audioValidationService;
let gameContextRepository;

const buildTestApp = () => {
  jest.resetModules();

  jest.doMock('../../src/repositories/gameContextRepository.js', () => ({
    findById: jest.fn()
  }));
  jest.doMock('../../src/services/storageService.js', () => ({
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
    isEnabled: jest.fn(),
    getBucketName: jest.fn()
  }));
  jest.doMock('../../src/services/imageProcessingService.js', () => ({
    processImage: jest.fn(),
    getConfig: jest.fn()
  }));
  jest.doMock('../../src/services/audioValidationService.js', () => ({
    validateAudio: jest.fn(),
    getConfig: jest.fn()
  }));

  const express = require('express');
  const multer = require('multer');
  const assetController = require('../../src/controllers/assetController');
  const { errorHandler } = require('../../src/middlewares/errorHandler');

  storageService = require('../../src/services/storageService.js');
  imageProcessingService = require('../../src/services/imageProcessingService.js');
  audioValidationService = require('../../src/services/audioValidationService.js');
  gameContextRepository = require('../../src/repositories/gameContextRepository.js');

  app = express();
  app.use(express.json());

  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }
  });
  const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
  });

  app.use((req, res, next) => {
    req.user = { _id: 'user-123' };
    next();
  });

  app.post('/api/contexts/:id/images', imageUpload.single('file'), assetController.uploadImage);
  app.post('/api/contexts/:id/audio', audioUpload.single('file'), assetController.uploadAudio);
  app.delete('/api/contexts/:id/images/:assetKey', assetController.deleteImage);
  app.delete('/api/contexts/:id/audio/:assetKey', assetController.deleteAudio);
  app.get('/api/contexts/upload-config', assetController.getUploadConfig);
  app.use(errorHandler);
};

describeSupabase('Asset Controller - Image Upload', () => {
  beforeEach(() => {
    buildTestApp();
    jest.clearAllMocks();
  });

  it('SHOULD upload image successfully, process to WebP, and save to DB', async () => {
    const mockContext = {
      _id: CONTEXT_ID,
      contextId: 'test-context',
      assets: [],
      save: jest.fn().mockResolvedValue(true)
    };
    const mockImageUrl = 'https://fake-supabase.com/storage/ctx-context-123/image/lion.webp';
    const mockThumbnailUrl =
      'https://fake-supabase.com/storage/ctx-context-123/thumbnail/lion_thumb.webp';
    const mockFileBuffer = Buffer.from('fake-image-content');

    gameContextRepository.findById.mockResolvedValue(mockContext);
    imageProcessingService.processImage.mockResolvedValue({
      mainImage: Buffer.from('processed-webp'),
      thumbnail: Buffer.from('thumbnail-webp'),
      metadata: { originalWidth: 500, originalHeight: 500, format: 'webp', quality: 85 }
    });
    storageService.uploadFile
      .mockResolvedValueOnce(mockImageUrl)
      .mockResolvedValueOnce(mockThumbnailUrl);

    const response = await request(app)
      .post(`/api/contexts/${CONTEXT_ID}/images`)
      .field('key', 'lion')
      .field('value', 'León')
      .attach('file', mockFileBuffer, 'lion.png');

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.asset.imageUrl).toBe(mockImageUrl);
    expect(response.body.data.asset.thumbnailUrl).toBe(mockThumbnailUrl);
    expect(imageProcessingService.processImage).toHaveBeenCalledTimes(1);
    expect(storageService.uploadFile).toHaveBeenCalledTimes(2);
    expect(mockContext.assets).toHaveLength(1);
    expect(mockContext.save).toHaveBeenCalled();
  });

  it('SHOULD return 400 if file is missing', async () => {
    const response = await request(app)
      .post(`/api/contexts/${CONTEXT_ID}/images`)
      .field('key', 'lion')
      .field('value', 'León');

    expect(response.status).toBe(400);
  });

  it('SHOULD return 404 if context not found', async () => {
    gameContextRepository.findById.mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/contexts/${CONTEXT_ID}/images`)
      .field('key', 'lion')
      .field('value', 'León')
      .attach('file', Buffer.from('fake'), 'lion.png');

    expect(response.status).toBe(404);
  });

  it('SHOULD perform rollback if DB save fails after upload', async () => {
    const mockContext = {
      _id: CONTEXT_ID,
      contextId: 'test-context',
      assets: [],
      save: jest.fn().mockRejectedValue(new Error('DB Error'))
    };
    const mockImageUrl = 'https://fake-supabase.com/rollback-image.webp';
    const mockThumbnailUrl = 'https://fake-supabase.com/rollback-thumb.webp';

    gameContextRepository.findById.mockResolvedValue(mockContext);
    imageProcessingService.processImage.mockResolvedValue({
      mainImage: Buffer.from('processed'),
      thumbnail: Buffer.from('thumb'),
      metadata: { originalWidth: 300, originalHeight: 300, format: 'webp', quality: 85 }
    });
    storageService.uploadFile
      .mockResolvedValueOnce(mockImageUrl)
      .mockResolvedValueOnce(mockThumbnailUrl);

    const response = await request(app)
      .post(`/api/contexts/${CONTEXT_ID}/images`)
      .field('key', 'lion')
      .field('value', 'León')
      .attach('file', Buffer.from('fake'), 'lion.png');

    expect(response.status).toBe(500);
    expect(storageService.deleteFile).toHaveBeenCalledWith(mockImageUrl);
    expect(storageService.deleteFile).toHaveBeenCalledWith(mockThumbnailUrl);
  });

  it('SHOULD reject if context has reached asset limit', async () => {
    const mockContext = {
      _id: CONTEXT_ID,
      contextId: 'test-context',
      assets: new Array(30).fill({ key: 'asset' }),
      save: jest.fn()
    };

    gameContextRepository.findById.mockResolvedValue(mockContext);

    const response = await request(app)
      .post(`/api/contexts/${CONTEXT_ID}/images`)
      .field('key', 'lion')
      .field('value', 'León')
      .attach('file', Buffer.from('fake'), 'lion.png');

    expect(response.status).toBe(400);
  });
});

describeSupabase('Asset Controller - Audio Upload', () => {
  beforeEach(() => {
    buildTestApp();
    jest.clearAllMocks();
  });

  it('SHOULD upload audio successfully and save to DB', async () => {
    const mockContext = {
      _id: CONTEXT_ID,
      contextId: 'test-context',
      assets: [],
      save: jest.fn().mockResolvedValue(true)
    };
    const mockAudioUrl = 'https://fake-supabase.com/storage/ctx-context-123/audio/lion.mp3';
    const mockFileBuffer = Buffer.from('fake-audio-content');

    gameContextRepository.findById.mockResolvedValue(mockContext);
    audioValidationService.validateAudio.mockResolvedValue({
      buffer: mockFileBuffer,
      metadata: {
        format: 'mp3',
        mime: 'audio/mpeg',
        formatName: 'MP3',
        size: 1024,
        durationSeconds: 1.2
      }
    });
    storageService.uploadFile.mockResolvedValue(mockAudioUrl);

    const response = await request(app)
      .post(`/api/contexts/${CONTEXT_ID}/audio`)
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
    buildTestApp();
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
    expect(typeof response.body.data.storageEnabled).toBe('boolean');
  });
});
