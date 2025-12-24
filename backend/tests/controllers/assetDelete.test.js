const request = require('supertest');
const express = require('express');
const assetController = require('../../src/controllers/assetController');
const storageService = require('../../src/services/storageService');
const GameContext = require('../../src/models/GameContext');

jest.mock('../../src/services/storageService');
jest.mock('../../src/models/GameContext');

const app = express();
app.use(express.json());
app.delete('/api/contexts/:contextId/assets/:assetId', assetController.deleteAsset);

const describeSupabase = process.env.RUN_SUPABASE_TESTS === 'true' ? describe : describe.skip;

describeSupabase('Asset Controller - Delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SHOULD delete asset successfully', async () => {
    const mockContext = {
      _id: 'ctx-1',
      assets: {
        id: jest.fn().mockReturnValue({
          _id: 'asset-1',
          imageUrl: 'http://supa.base/img.png'
        }),
        pull: jest.fn()
      },
      save: jest.fn().mockResolvedValue(true)
    };

    GameContext.findById.mockResolvedValue(mockContext);
    storageService.deleteFile.mockResolvedValue(true);

    const response = await request(app).delete('/api/contexts/ctx-1/assets/asset-1');

    expect(response.status).toBe(200);
    expect(GameContext.findById).toHaveBeenCalledWith('ctx-1');
    expect(mockContext.assets.id).toHaveBeenCalledWith('asset-1');
    expect(storageService.deleteFile).toHaveBeenCalledWith('http://supa.base/img.png');
    expect(mockContext.assets.pull).toHaveBeenCalledWith({ _id: 'asset-1' });
    expect(mockContext.save).toHaveBeenCalled();
  });

  it('SHOULD return 404 if context not found', async () => {
    GameContext.findById.mockResolvedValue(null);
    const response = await request(app).delete('/api/contexts/ctx-1/assets/asset-1');
    expect(response.status).toBe(404);
  });

  it('SHOULD return 404 if asset not found', async () => {
    const mockContext = {
      assets: {
        id: jest.fn().mockReturnValue(null)
      }
    };
    GameContext.findById.mockResolvedValue(mockContext);
    const response = await request(app).delete('/api/contexts/ctx-1/assets/asset-1');
    expect(response.status).toBe(404);
  });
});
