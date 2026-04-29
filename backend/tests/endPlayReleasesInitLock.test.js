/**
 * @fileoverview Verifica que GameEngine.endPlay libera explícitamente el lock
 * distribuido `play:init:<playId>` adquirido por startPlay (OBS-QA-1). El TTL
 * de 60s actuaba como única garantía, lo que provocaba "abort silencioso" si
 * el cliente intentaba reiniciar la misma partida durante esos 60s. Ahora la
 * liberación es explícita y silenciosa ante errores (TTL queda como red de
 * seguridad).
 */

jest.mock('ioredis', () => require('ioredis-mock'));

jest.mock('../src/services/sessionStatusService', () => ({
  recalculateSessionStatusFromPlays: jest.fn().mockResolvedValue(undefined)
}));

const { connectRedis, disconnectRedis } = require('../src/config/redis');
const redisService = require('../src/services/redisService');
const userRepository = require('../src/repositories/userRepository');
const GameEngine = require('../src/services/gameEngine');

describe('GameEngine.endPlay releases play:init lock (OBS-QA-1)', () => {
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
    await redisService.flushNamespace(redisService.NAMESPACES.PLAY_INIT_LOCK);
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

  const registerFakePlayState = playId => {
    const playDoc = {
      _id: `${playId}-doc`,
      playerId: 'student-1',
      sessionId: null,
      status: 'in-progress',
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

  const acquireLock = async playId =>
    redisService.setIfNotExists(redisService.NAMESPACES.PLAY_INIT_LOCK, playId, 'initializing', 60);

  it('libera el lock play:init tras una partida completada normalmente', async () => {
    const playId = 'play-end-1';
    await acquireLock(playId);
    expect(await redisService.get(redisService.NAMESPACES.PLAY_INIT_LOCK, playId)).not.toBeNull();

    registerFakePlayState(playId);
    await engine.endPlay(playId);

    expect(await redisService.get(redisService.NAMESPACES.PLAY_INIT_LOCK, playId)).toBeNull();
  });

  it('libera el lock también en partida abandonada', async () => {
    const playId = 'play-end-2';
    await acquireLock(playId);
    registerFakePlayState(playId);

    await engine.endPlay(playId, { abandoned: true });

    expect(await redisService.get(redisService.NAMESPACES.PLAY_INIT_LOCK, playId)).toBeNull();
  });

  it('no propaga el error si redisService.del lanza al liberar el lock', async () => {
    const playId = 'play-end-3';
    await acquireLock(playId);
    registerFakePlayState(playId);

    // Spy específico solo para la liberación del lock — el resto de del() del flow funciona
    const originalDel = redisService.del;
    jest.spyOn(redisService, 'del').mockImplementation(async (namespace, id) => {
      if (namespace === redisService.NAMESPACES.PLAY_INIT_LOCK) {
        throw new Error('Redis no disponible');
      }
      return originalDel.call(redisService, namespace, id);
    });

    await expect(engine.endPlay(playId)).resolves.toBeUndefined();
  });

  it('si no se había adquirido el lock, endPlay sigue funcionando sin error', async () => {
    const playId = 'play-end-4';
    // No acquireLock — la key nunca existió
    registerFakePlayState(playId);

    await expect(engine.endPlay(playId)).resolves.toBeUndefined();
  });
});
