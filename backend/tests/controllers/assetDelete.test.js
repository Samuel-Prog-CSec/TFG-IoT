const request = require('supertest');

const CONTEXT_ID = '507f1f77bcf86cd799439011';

// Estos tests mockean completamente storageService, gameContextRepository y
// cardDeckRepository. No requieren credenciales reales de Supabase ni Mongo.

let app;
let storageService;
let gameContextRepository;
let cardDeckRepository;

const buildTestApp = () => {
  jest.resetModules();

  jest.doMock('../../src/repositories/gameContextRepository.js', () => ({
    findById: jest.fn()
  }));
  jest.doMock('../../src/repositories/cardDeckRepository', () => ({
    // Por defecto: ningún mazo activo usa el asset (permite el borrado).
    count: jest.fn().mockResolvedValue(0)
  }));
  jest.doMock('../../src/services/storageService.js', () => ({
    deleteFile: jest.fn()
  }));
  jest.doMock('../../src/utils/cacheInvalidators/contextCacheInvalidator', () => ({
    invalidateContextCaches: jest.fn().mockResolvedValue(undefined)
  }));

  const express = require('express');
  const assetController = require('../../src/controllers/assetController');
  const { errorHandler } = require('../../src/middlewares/errorHandler');

  storageService = require('../../src/services/storageService.js');
  gameContextRepository = require('../../src/repositories/gameContextRepository.js');
  cardDeckRepository = require('../../src/repositories/cardDeckRepository');

  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    // Simulamos al usuario autenticado — toString debe coincidir con el
    // uploadedBy de los mock assets para pasar la politica de ownership
    // introducida en ADR-053.
    req.user = {
      _id: { toString: () => 'user-123' }
    };
    next();
  });
  app.delete('/api/contexts/:id/images/:assetKey', assetController.deleteImage);
  app.delete('/api/contexts/:id/audio/:assetKey', assetController.deleteAudio);
  app.use(errorHandler);
};

describe('Asset Controller - Delete Image', () => {
  beforeEach(() => {
    buildTestApp();
    jest.clearAllMocks();
    cardDeckRepository.count.mockResolvedValue(0);
  });

  it('SHOULD delete image asset successfully (Mongo primero, Storage best-effort)', async () => {
    const mockAsset = {
      key: 'espana',
      value: 'España',
      imageUrl: 'https://supa.base/img.png',
      thumbnailUrl: 'https://supa.base/thumb.png',
      audioUrl: null,
      // ADR-053: el asset debe pertenecer al usuario autenticado para autorizar borrado
      uploadedBy: { toString: () => 'user-123' }
    };

    const mockContext = {
      _id: CONTEXT_ID,
      contextId: 'europe-flags',
      assets: [mockAsset],
      save: jest.fn().mockResolvedValue(true)
    };

    gameContextRepository.findById.mockResolvedValue(mockContext);
    storageService.deleteFile.mockResolvedValue(true);

    const response = await request(app).delete(`/api/contexts/${CONTEXT_ID}/images/espana`);

    expect(response.status).toBe(200);
    expect(gameContextRepository.findById).toHaveBeenCalledWith(CONTEXT_ID);
    // AS-4 (H2): Storage se borra best-effort, SIN `{ strict: true }`, tras save().
    expect(storageService.deleteFile).toHaveBeenCalledWith('https://supa.base/img.png');
    expect(storageService.deleteFile).toHaveBeenCalledWith('https://supa.base/thumb.png');
    expect(mockContext.save).toHaveBeenCalled();
  });

  it('SHOULD return 409 if an active deck uses the asset (AS-1)', async () => {
    const mockAsset = {
      key: 'espana',
      value: 'España',
      imageUrl: 'https://supa.base/img.png',
      thumbnailUrl: 'https://supa.base/thumb.png',
      audioUrl: null,
      uploadedBy: { toString: () => 'user-123' }
    };
    const mockContext = {
      _id: CONTEXT_ID,
      contextId: 'europe-flags',
      assets: [mockAsset],
      save: jest.fn().mockResolvedValue(true)
    };

    gameContextRepository.findById.mockResolvedValue(mockContext);
    cardDeckRepository.count.mockResolvedValue(2); // 2 mazos activos lo usan

    const response = await request(app).delete(`/api/contexts/${CONTEXT_ID}/images/espana`);

    expect(response.status).toBe(409);
    // Ni se persiste ni se borra nada de Storage.
    expect(mockContext.save).not.toHaveBeenCalled();
    expect(storageService.deleteFile).not.toHaveBeenCalled();
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

  it('SHOULD persist (200) even if Storage deletion fails — best-effort (AS-4)', async () => {
    // Cambio de contrato vs comportamiento previo: antes se borraba Storage
    // (strict) ANTES de persistir y un fallo daba 500 sin persistir, dejando el
    // asset con URLs muertas si el save posterior fallaba. Ahora se persiste
    // Mongo PRIMERO y el borrado de Storage es best-effort (no fatal): un fallo
    // de Storage NO revierte el borrado del registro ni devuelve error.
    const mockAsset = {
      key: 'espana',
      value: 'España',
      imageUrl: 'https://supa.base/img.png',
      thumbnailUrl: 'https://supa.base/thumb.png',
      audioUrl: null,
      uploadedBy: { toString: () => 'user-123' }
    };
    const mockContext = {
      _id: CONTEXT_ID,
      contextId: 'europe-flags',
      assets: [mockAsset],
      save: jest.fn().mockResolvedValue(true)
    };

    gameContextRepository.findById.mockResolvedValue(mockContext);
    storageService.deleteFile.mockRejectedValue(new Error('Storage failure'));

    const response = await request(app).delete(`/api/contexts/${CONTEXT_ID}/images/espana`);

    expect(response.status).toBe(200);
    expect(mockContext.save).toHaveBeenCalled();
  });
});

describe('Asset Controller - Delete Audio', () => {
  beforeEach(() => {
    buildTestApp();
    jest.clearAllMocks();
    cardDeckRepository.count.mockResolvedValue(0);
  });

  it('SHOULD delete audio-only asset successfully (Mongo primero, Storage best-effort)', async () => {
    const mockAsset = {
      key: 'espana',
      value: 'España',
      imageUrl: null,
      thumbnailUrl: null,
      audioUrl: 'https://supa.base/audio.mp3',
      uploadedBy: { toString: () => 'user-123' }
    };

    const mockContext = {
      _id: CONTEXT_ID,
      contextId: 'europe-flags',
      assets: [mockAsset],
      save: jest.fn().mockResolvedValue(true)
    };

    gameContextRepository.findById.mockResolvedValue(mockContext);
    storageService.deleteFile.mockResolvedValue(true);

    const response = await request(app).delete(`/api/contexts/${CONTEXT_ID}/audio/espana`);

    expect(response.status).toBe(200);
    expect(gameContextRepository.findById).toHaveBeenCalledWith(CONTEXT_ID);
    // best-effort: sin `{ strict: true }`.
    expect(storageService.deleteFile).toHaveBeenCalledWith('https://supa.base/audio.mp3');
    expect(mockContext.save).toHaveBeenCalled();
  });

  it('SHOULD keep the asset and only unlink audio when it also has an image', async () => {
    const mockAsset = {
      key: 'espana',
      value: 'España',
      imageUrl: 'https://supa.base/img.png',
      thumbnailUrl: 'https://supa.base/thumb.png',
      audioUrl: 'https://supa.base/audio.mp3',
      uploadedBy: { toString: () => 'user-123' }
    };
    const mockContext = {
      _id: CONTEXT_ID,
      contextId: 'europe-flags',
      assets: [mockAsset],
      save: jest.fn().mockResolvedValue(true)
    };

    gameContextRepository.findById.mockResolvedValue(mockContext);
    storageService.deleteFile.mockResolvedValue(true);

    const response = await request(app).delete(`/api/contexts/${CONTEXT_ID}/audio/espana`);

    expect(response.status).toBe(200);
    // El asset se conserva (solo se desvincula el audio) → no se comprueba uso en mazos.
    expect(cardDeckRepository.count).not.toHaveBeenCalled();
    expect(mockAsset.audioUrl).toBeUndefined();
    expect(mockContext.save).toHaveBeenCalled();
  });
});
