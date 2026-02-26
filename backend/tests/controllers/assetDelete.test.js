const request = require('supertest');

const CONTEXT_ID = '507f1f77bcf86cd799439011';
const describeSupabase = process.env.RUN_SUPABASE_TESTS === 'true' ? describe : describe.skip;

let app;
let storageService;
let gameContextRepository;

const buildTestApp = () => {
  jest.resetModules();

  jest.doMock('../../src/repositories/gameContextRepository.js', () => ({
    findById: jest.fn()
  }));
  jest.doMock('../../src/services/storageService.js', () => ({
    deleteFile: jest.fn()
  }));

  const express = require('express');
  const assetController = require('../../src/controllers/assetController');
  const { errorHandler } = require('../../src/middlewares/errorHandler');

  storageService = require('../../src/services/storageService.js');
  gameContextRepository = require('../../src/repositories/gameContextRepository.js');

  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { _id: 'user-123' };
    next();
  });
  app.delete('/api/contexts/:id/images/:assetKey', assetController.deleteImage);
  app.delete('/api/contexts/:id/audio/:assetKey', assetController.deleteAudio);
  app.use(errorHandler);
};

describeSupabase('Asset Controller - Delete Image', () => {
  beforeEach(() => {
    buildTestApp();
    jest.clearAllMocks();
  });

  it('SHOULD delete image asset successfully', async () => {
    const mockAsset = {
      key: 'espana',
      imageUrl: 'https://supa.base/img.png',
      thumbnailUrl: 'https://supa.base/thumb.png',
      audioUrl: null
    };

    const mockContext = {
      _id: CONTEXT_ID,
      assets: [mockAsset],
      save: jest.fn().mockResolvedValue(true)
    };

    gameContextRepository.findById.mockResolvedValue(mockContext);
    storageService.deleteFile.mockResolvedValue(true);

    const response = await request(app).delete(`/api/contexts/${CONTEXT_ID}/images/espana`);

    expect(response.status).toBe(200);
    expect(gameContextRepository.findById).toHaveBeenCalledWith(CONTEXT_ID);
    expect(storageService.deleteFile).toHaveBeenCalledWith('https://supa.base/img.png', {
      strict: true
    });
    expect(storageService.deleteFile).toHaveBeenCalledWith('https://supa.base/thumb.png', {
      strict: true
    });
    expect(mockContext.save).toHaveBeenCalled();
  });

  it('SHOULD return 404 if context not found', async () => {
    gameContextRepository.findById.mockResolvedValue(null);
    const response = await request(app).delete(`/api/contexts/${CONTEXT_ID}/images/espana`);
    expect(response.status).toBe(404);
  });

  it('SHOULD return 404 if asset not found', async () => {
    const mockContext = {
      assets: []
    };

    gameContextRepository.findById.mockResolvedValue(mockContext);

    const response = await request(app).delete(`/api/contexts/${CONTEXT_ID}/images/espana`);

    expect(response.status).toBe(404);
  });

  it('SHOULD return 500 and not persist if storage deletion fails', async () => {
    const mockAsset = {
      key: 'espana',
      imageUrl: 'https://supa.base/img.png',
      thumbnailUrl: 'https://supa.base/thumb.png',
      audioUrl: null
    };
    const mockContext = {
      _id: CONTEXT_ID,
      assets: [mockAsset],
      save: jest.fn().mockResolvedValue(true)
    };

    gameContextRepository.findById.mockResolvedValue(mockContext);
    storageService.deleteFile.mockRejectedValue(new Error('Storage failure'));

    const response = await request(app).delete(`/api/contexts/${CONTEXT_ID}/images/espana`);

    expect(response.status).toBe(500);
    expect(mockContext.save).not.toHaveBeenCalled();
  });
});

describeSupabase('Asset Controller - Delete Audio', () => {
  beforeEach(() => {
    buildTestApp();
    jest.clearAllMocks();
  });

  it('SHOULD delete audio asset successfully', async () => {
    const mockAsset = {
      key: 'espana',
      imageUrl: null,
      thumbnailUrl: null,
      audioUrl: 'https://supa.base/audio.mp3'
    };

    const mockContext = {
      _id: CONTEXT_ID,
      assets: [mockAsset],
      save: jest.fn().mockResolvedValue(true)
    };

    gameContextRepository.findById.mockResolvedValue(mockContext);
    storageService.deleteFile.mockResolvedValue(true);

    const response = await request(app).delete(`/api/contexts/${CONTEXT_ID}/audio/espana`);

    expect(response.status).toBe(200);
    expect(gameContextRepository.findById).toHaveBeenCalledWith(CONTEXT_ID);
    expect(storageService.deleteFile).toHaveBeenCalledWith('https://supa.base/audio.mp3', {
      strict: true
    });
    expect(mockContext.save).toHaveBeenCalled();
  });
});
