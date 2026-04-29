/**
 * @fileoverview Verifica que GameEngine.endPlay invalida el namespace 'cache:analytics'
 * de forma fire-and-forget tras persistir la partida. Usa ioredis-mock como backend real
 * para observar el efecto (keys borradas) y mocks ligeros para dependencies transversales.
 */

jest.mock('ioredis', () => require('ioredis-mock'));

jest.mock('../src/services/sessionStatusService', () => ({
  recalculateSessionStatusFromPlays: jest.fn().mockResolvedValue(undefined)
}));

const { connectRedis, disconnectRedis } = require('../src/config/redis');
const redisService = require('../src/services/redisService');
const userRepository = require('../src/repositories/userRepository');
const GameEngine = require('../src/services/gameEngine');

describe('GameEngine.endPlay invalidates cache:analytics', () => {
  let engine;
  let io;

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    io = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };
    engine = new GameEngine(io);
    await redisService.flushNamespace('cache:analytics');

    jest.spyOn(userRepository, 'findById').mockResolvedValue({
      _id: 'student-1',
      hasConsentFor: () => false,
      recordAbandonedGame: jest.fn().mockResolvedValue(undefined),
      updateStudentMetrics: jest.fn().mockResolvedValue(undefined)
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await engine?.shutdown?.();
  });

  const seedAnalyticsCache = async (keys = []) => {
    for (const key of keys) {
      await redisService.setWithTTL('cache:analytics', key, JSON.stringify({ seeded: true }), 300);
    }
  };

  const registerFakePlayState = (playId, { abandoned = false } = {}) => {
    const playDoc = {
      _id: `${playId}-doc`,
      playerId: 'student-1',
      // sessionId: null permite que recalculateSessionStatusFromPlays haga early return
      // sin tocar Mongo (evita castear 'session-id' como ObjectId).
      sessionId: null,
      status: abandoned ? 'abandoned' : 'in-progress',
      currentRound: 3,
      score: 10,
      metrics: {
        completionTime: 0,
        correctAttempts: 2,
        errorAttempts: 0,
        timeoutAttempts: 0,
        averageResponseTime: 1500
      },
      events: [],
      save: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined)
    };

    engine.activePlays.set(playId, {
      playDoc,
      sessionDoc: { cardMappings: [] },
      roundTimer: null,
      nextRoundTimer: null,
      playTimer: null,
      createdAt: Date.now() - 10_000,
      transientTimers: new Set()
    });
  };

  it('borra las keys de cache:analytics al completar una partida normalmente', async () => {
    await seedAnalyticsCache(['summary:teacher-xyz', 'trends:teacher-xyz:7d']);
    const playId = 'play-abc';
    registerFakePlayState(playId);

    await engine.endPlay(playId);
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(await redisService.get('cache:analytics', 'summary:teacher-xyz')).toBeNull();
    expect(await redisService.get('cache:analytics', 'trends:teacher-xyz:7d')).toBeNull();
  });

  it('también borra keys tras una partida abandonada', async () => {
    await seedAnalyticsCache(['distribution:teacher-xyz']);
    const playId = 'play-def';
    registerFakePlayState(playId, { abandoned: true });

    await engine.endPlay(playId, { abandoned: true });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(await redisService.get('cache:analytics', 'distribution:teacher-xyz')).toBeNull();
  });

  it('no lanza si no había playState en memoria', async () => {
    await expect(engine.endPlay('play-nonexistent')).resolves.toBeUndefined();
  });
});
