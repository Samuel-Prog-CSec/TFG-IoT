/**
 * @fileoverview Verifica que GameEngine.endPlay invalida el cache 'cache:analytics'
 * de forma ACOTADA (D1) tras persistir la partida: TODAS las analíticas del alumno que
 * jugó y del profesor dueño (patrones amplios por id `*<studentId>*` y `*<teacherId>*`),
 * NO el namespace entero. Las keys de OTROS alumnos/profesores deben SOBREVIVIR.
 * Fire-and-forget. Usa ioredis-mock como backend real.
 */

jest.mock('ioredis', () => require('ioredis-mock'));

jest.mock('../src/services/sessionStatusService', () => ({
  recalculateSessionStatusFromPlays: jest.fn().mockResolvedValue(undefined)
}));

const { connectRedis, disconnectRedis } = require('../src/config/redis');
const redisService = require('../src/services/redisService');
const userRepository = require('../src/repositories/userRepository');
const GameEngine = require('../src/services/gameEngine');

describe('GameEngine.endPlay invalida cache:analytics de forma acotada (D1)', () => {
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
      // createdBy = profesor dueño → endPlay invalida también teacherSessions:teacher-1:*
      sessionDoc: { cardMappings: [], createdBy: 'teacher-1' },
      roundTimer: null,
      nextRoundTimer: null,
      playTimer: null,
      createdAt: Date.now() - 10_000,
      transientTimers: new Set()
    });
  };

  it('invalida TODAS las analíticas del alumno + profesor de la partida; las de otros sobreviven', async () => {
    await seedAnalyticsCache([
      // TODAS las formas de key del profesor teacher-1 (las que agregan la partida):
      'contentEffectiveness:teacher-1:30d:context:undefined',
      'comparison:teacher-1:7d',
      'distribution:teacher-1:f:::7d',
      'difficulties:teacher-1',
      'teacherSessions:teacher-1:active',
      'excluded:teacher-1',
      // ...y las del alumno student-1:
      'engagement:student:student-1:30d',
      // De OTROS profesores/alumnos → deben SOBREVIVIR (scoping por id):
      'contentEffectiveness:teacher-2:30d:context:undefined',
      'engagement:student:student-2:30d'
    ]);
    const playId = 'play-abc';
    registerFakePlayState(playId);

    await engine.endPlay(playId);
    await new Promise(resolve => setTimeout(resolve, 100));

    // TODAS las del profesor + alumno de la partida → invalidadas
    expect(
      await redisService.get(
        'cache:analytics',
        'contentEffectiveness:teacher-1:30d:context:undefined'
      )
    ).toBeNull();
    expect(await redisService.get('cache:analytics', 'comparison:teacher-1:7d')).toBeNull();
    expect(await redisService.get('cache:analytics', 'distribution:teacher-1:f:::7d')).toBeNull();
    expect(await redisService.get('cache:analytics', 'difficulties:teacher-1')).toBeNull();
    expect(
      await redisService.get('cache:analytics', 'teacherSessions:teacher-1:active')
    ).toBeNull();
    expect(await redisService.get('cache:analytics', 'excluded:teacher-1')).toBeNull();
    expect(
      await redisService.get('cache:analytics', 'engagement:student:student-1:30d')
    ).toBeNull();
    // De OTROS profesores/alumnos → SOBREVIVEN (la mejora de D1: sin flush global)
    expect(
      await redisService.get(
        'cache:analytics',
        'contentEffectiveness:teacher-2:30d:context:undefined'
      )
    ).not.toBeNull();
    expect(
      await redisService.get('cache:analytics', 'engagement:student:student-2:30d')
    ).not.toBeNull();
  });

  it('también invalida (acotado) tras una partida abandonada', async () => {
    await seedAnalyticsCache([
      'engagement:student:student-1:7d',
      'engagement:student:student-2:7d'
    ]);
    const playId = 'play-def';
    registerFakePlayState(playId, { abandoned: true });

    await engine.endPlay(playId, { abandoned: true });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(await redisService.get('cache:analytics', 'engagement:student:student-1:7d')).toBeNull();
    expect(
      await redisService.get('cache:analytics', 'engagement:student:student-2:7d')
    ).not.toBeNull();
  });

  it('no lanza si no había playState en memoria', async () => {
    await expect(engine.endPlay('play-nonexistent')).resolves.toBeUndefined();
  });
});
