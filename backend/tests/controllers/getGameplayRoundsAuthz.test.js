const request = require('supertest');

// Regresión de seguridad (auditoría 2026-06-06): GET /api/analytics/gameplay/:id/rounds
// debe comprobar la propiedad de la sesión ANTES de servir el desglose ronda-a-ronda.
// Antes era el único endpoint de analytics sin check de ownership (IDOR): cualquier
// profesor podía leer las partidas (cardUid, tiempos, fatiga) de alumnos de OTRO
// profesor, saltándose además la puerta de consentimiento (RGPD Art. 21).
//
// Patrón de test idéntico a assetDelete.test.js: app express mínima con el controller
// real + gamePlayRepository mockeado + req.user simulado. El check de ownership ocurre
// antes que consent/cache, así que para los casos 403/404 basta con mockear el repo.

const CONTEXT_PLAY_ID = '507f1f77bcf86cd799439011';

let app;
let gamePlayRepository;

const buildTestApp = user => {
  jest.resetModules();

  jest.doMock('../../src/repositories/gamePlayRepository.js', () => ({
    findById: jest.fn()
  }));

  const express = require('express');
  const analyticsAdvancedController = require('../../src/controllers/analyticsAdvancedController');
  const { errorHandler } = require('../../src/middlewares/errorHandler');

  gamePlayRepository = require('../../src/repositories/gamePlayRepository.js');

  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  // Express 5 propaga rechazos de async handlers al errorHandler sin asyncHandler.
  app.get('/api/analytics/gameplay/:id/rounds', analyticsAdvancedController.getGameplayRounds);
  app.use(errorHandler);
};

describe('IDOR - GET /api/analytics/gameplay/:id/rounds (ownership)', () => {
  afterEach(() => jest.clearAllMocks());

  it('responde 403 si un profesor pide la partida de un alumno de OTRO profesor', async () => {
    buildTestApp({ _id: { toString: () => 'attacker-teacher' }, role: 'teacher' });
    gamePlayRepository.findById.mockResolvedValue({
      // La sesión pertenece a otro profesor → ensureResourceOwnershipOrAdmin rechaza.
      sessionId: { createdBy: { toString: () => 'owner-teacher' } },
      playerId: { toString: () => 'student-1' }
    });

    const res = await request(app).get(`/api/analytics/gameplay/${CONTEXT_PLAY_ID}/rounds`);

    expect(res.status).toBe(403);
    expect(gamePlayRepository.findById).toHaveBeenCalledTimes(1);
  });

  it('responde 404 si la partida no existe', async () => {
    buildTestApp({ _id: { toString: () => 'any-teacher' }, role: 'teacher' });
    gamePlayRepository.findById.mockResolvedValue(null);

    const res = await request(app).get(`/api/analytics/gameplay/${CONTEXT_PLAY_ID}/rounds`);

    expect(res.status).toBe(404);
  });
});
