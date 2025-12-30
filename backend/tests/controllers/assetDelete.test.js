const request = require('supertest');
const express = require('express');
const assetController = require('../../src/controllers/assetController');
const storageService = require('../../src/services/storageService');
const GameContext = require('../../src/models/GameContext');

jest.mock('../../src/services/storageService');
jest.mock('../../src/models/GameContext');

const app = express();
app.use(express.json());
app.delete('/api/contexts/:contextId/images/:assetKey', assetController.deleteImage);
app.delete('/api/contexts/:contextId/audio/:assetKey', assetController.deleteAudio);

const describeSupabase = process.env.RUN_SUPABASE_TESTS === 'true' ? describe : describe.skip;

describeSupabase('Asset Controller - Delete Image', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SHOULD delete image asset successfully', async () => {
    const mockAsset = {
      key: 'espana',
      imageUrl: 'http://supa.base/img.png',
      thumbnailUrl: 'http://supa.base/thumb.png',
      audioUrl: null
    };

    const mockContext = {
      _id: 'ctx-1',
      assets: [mockAsset],
      save: jest.fn().mockResolvedValue(true)
    };
    mockContext.assets.find = jest.fn().mockReturnValue(mockAsset);

    GameContext.findById.mockResolvedValue(mockContext);
    storageService.deleteFile.mockResolvedValue(true);

    const response = await request(app).delete('/api/contexts/ctx-1/images/espana');

    expect(response.status).toBe(200);
    expect(GameContext.findById).toHaveBeenCalledWith('ctx-1');
    expect(storageService.deleteFile).toHaveBeenCalledWith('http://supa.base/img.png');
    expect(storageService.deleteFile).toHaveBeenCalledWith('http://supa.base/thumb.png');
    expect(mockContext.save).toHaveBeenCalled();
  });

  it('SHOULD return 404 if context not found', async () => {
    GameContext.findById.mockResolvedValue(null);
    const response = await request(app).delete('/api/contexts/ctx-1/images/espana');
    expect(response.status).toBe(404);
  });

  it('SHOULD return 404 if asset not found', async () => {
    const mockContext = {
      assets: []
    };
    mockContext.assets.find = jest.fn().mockReturnValue(undefined);
    GameContext.findById.mockResolvedValue(mockContext);
    const response = await request(app).delete('/api/contexts/ctx-1/images/espana');
    expect(response.status).toBe(404);
  });
});

describeSupabase('Asset Controller - Delete Audio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SHOULD delete audio asset successfully', async () => {
    const mockAsset = {
      key: 'espana',
      imageUrl: null,
      thumbnailUrl: null,
      audioUrl: 'http://supa.base/audio.mp3'
    };

    const mockContext = {
      _id: 'ctx-1',
      assets: [mockAsset],
      save: jest.fn().mockResolvedValue(true)
    };
    mockContext.assets.find = jest.fn().mockReturnValue(mockAsset);

    GameContext.findById.mockResolvedValue(mockContext);
    storageService.deleteFile.mockResolvedValue(true);

    const response = await request(app).delete('/api/contexts/ctx-1/audio/espana');

    expect(response.status).toBe(200);
    expect(GameContext.findById).toHaveBeenCalledWith('ctx-1');
    expect(storageService.deleteFile).toHaveBeenCalledWith('http://supa.base/audio.mp3');
    expect(mockContext.save).toHaveBeenCalled();
  });
});
