/**
 * @fileoverview Tests del servicio de efectividad de contenido (T-942 Fase A).
 *
 * Cubre la nueva variante `groupBy: 'cross'` que devuelve la matriz cruzada
 * mecánica × contexto, además de salvaguardas sobre la forma del payload y la
 * cache key (incluye `includeEmpty` para evitar cache cruzado).
 *
 * Estrategia: inserta datos reales en MongoDB (vía setup global) y verifica
 * el agregado contra el repositorio compartido.
 */

const mongoose = require('mongoose');

const GameContext = require('../../../src/models/GameContext');
const GameMechanic = require('../../../src/models/GameMechanic');
const GameSession = require('../../../src/models/GameSession');
const GamePlay = require('../../../src/models/GamePlay');
const CardDeck = require('../../../src/models/CardDeck');
const User = require('../../../src/models/User');

const contentEffectivenessService = require('../../../src/services/analytics/contentEffectivenessService');
const controller = require('../../../src/controllers/analyticsAdvancedController');
const { connectRedis } = require('../../../src/config/redis');
const redisService = require('../../../src/services/redisService');

// ══════════════════════════════════════════════════════════════════════
// Fixtures: 1 profesor, 2 contextos × 2 mecánicas → 4 celdas posibles.
// Se generan plays sólo para 3 de las 4 celdas para verificar que la
// celda restante no aparece en el output (filtrado por totalPlays>0).
// ══════════════════════════════════════════════════════════════════════

// Anclado a la fecha de ejecución (no una fecha absoluta): las partidas se siembran
// con `completedAt = NOW - daysAgo`, así que una fecha fija acababa cayendo fuera de
// la ventana real de 30/90 días (`completedAt >= startDate`) y la matriz cruzada salía
// vacía. Relativo a hoy mantiene el espaciado por días sin caducar nunca.
const NOW = new Date();

let teacher;
let otherTeacher;
let contextGeo;
let contextHistory;
let mechanicAssoc;
let mechanicMemory;
let deck;
let sessionAssocGeo; // celda con plays
let sessionMemoryGeo; // celda con plays
let sessionAssocHistory; // celda con plays
// (sin sesión memory × history → celda vacía)
let studentA;
let studentB;

const baseCardMappings = [
  { uid: 'AAAA1111', assignedValue: 'val1', displayData: { label: 'Display 1' } },
  { uid: 'BBBB2222', assignedValue: 'val2', displayData: { label: 'Display 2' } }
];

const buildPlay = ({ sessionId, playerId, score, daysAgo, mech = 'good' }) => {
  const completedAt = new Date(NOW);
  completedAt.setDate(completedAt.getDate() - daysAgo);
  const correct = mech === 'good' ? 8 : 4;
  const errors = mech === 'good' ? 2 : 6;
  return {
    sessionId,
    playerId,
    status: 'completed',
    score,
    startedAt: new Date(completedAt.getTime() - 90_000),
    completedAt,
    metrics: {
      totalAttempts: correct + errors,
      correctAttempts: correct,
      errorAttempts: errors,
      timeoutAttempts: 0,
      averageResponseTime: 2500,
      completionTime: 90_000
    },
    events: [
      { roundNumber: 1, cardUid: 'AAAA1111', eventType: 'correct', timeElapsed: 2200 },
      { roundNumber: 2, cardUid: 'BBBB2222', eventType: 'correct', timeElapsed: 2500 }
    ]
  };
};

describe('contentEffectivenessService.getContentEffectiveness — groupBy=cross', () => {
  beforeAll(async () => {
    await connectRedis();

    await Promise.all([
      User.deleteMany({}),
      CardDeck.deleteMany({}),
      GameContext.deleteMany({}),
      GameMechanic.deleteMany({}),
      GameSession.deleteMany({}),
      GamePlay.deleteMany({})
    ]);

    teacher = await User.create({
      name: 'Profesora Cross Matrix',
      email: 'cross-matrix@test.com',
      password: 'Password123!',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    otherTeacher = await User.create({
      name: 'Profesor Aislado',
      email: 'isolated-cross@test.com',
      password: 'Password123!',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    contextGeo = await GameContext.create({
      contextId: 'cross-geo',
      name: 'Geografía CrossTest',
      assets: [
        { key: 'a', value: 'Alfa' },
        { key: 'b', value: 'Beta' }
      ]
    });

    contextHistory = await GameContext.create({
      contextId: 'cross-history',
      name: 'Historia CrossTest',
      assets: [
        { key: 'a', value: 'Alfa' },
        { key: 'b', value: 'Beta' }
      ]
    });

    mechanicAssoc = await GameMechanic.create({
      name: 'cross-association',
      displayName: 'Asociación',
      description: 'Mecánica de asociación (cross matrix test)'
    });

    mechanicMemory = await GameMechanic.create({
      name: 'cross-memory',
      displayName: 'Memoria',
      description: 'Mecánica de memoria (cross matrix test)'
    });

    deck = await CardDeck.create({
      name: 'Deck Cross Test',
      contextId: contextGeo._id,
      createdBy: teacher._id,
      cardMappings: baseCardMappings
    });

    studentA = await User.create({
      name: 'Alumno A',
      role: 'student',
      createdBy: teacher._id,
      status: 'active',
      consent: {
        granted: true,
        grantedBy: 'Tutor Test',
        grantedAt: new Date(),
        purposes: ['educational_tracking', 'performance_analytics'],
        policyVersion: '1.0'
      }
    });

    studentB = await User.create({
      name: 'Alumno B',
      role: 'student',
      createdBy: teacher._id,
      status: 'active',
      consent: {
        granted: true,
        grantedBy: 'Tutor Test',
        grantedAt: new Date(),
        purposes: ['educational_tracking', 'performance_analytics'],
        policyVersion: '1.0'
      }
    });

    // Sesiones para 3 de las 4 combinaciones posibles
    sessionAssocGeo = await GameSession.create({
      name: 'Asoc x Geo',
      contextId: contextGeo._id,
      mechanicId: mechanicAssoc._id,
      deckId: deck._id,
      createdBy: teacher._id,
      status: 'active',
      config: { numberOfCards: 2, timeLimit: 60, numberOfRounds: 3 },
      cardMappings: baseCardMappings
    });

    sessionMemoryGeo = await GameSession.create({
      name: 'Memoria x Geo',
      contextId: contextGeo._id,
      mechanicId: mechanicMemory._id,
      deckId: deck._id,
      createdBy: teacher._id,
      status: 'active',
      config: { numberOfCards: 2, timeLimit: 60, numberOfRounds: 3 },
      cardMappings: baseCardMappings
    });

    sessionAssocHistory = await GameSession.create({
      name: 'Asoc x Historia',
      contextId: contextHistory._id,
      mechanicId: mechanicAssoc._id,
      deckId: deck._id,
      createdBy: teacher._id,
      status: 'active',
      config: { numberOfCards: 2, timeLimit: 60, numberOfRounds: 3 },
      cardMappings: baseCardMappings
    });

    // Plays:
    //  - Asoc × Geo: 4 plays con scores ascendentes (improvement)
    //  - Memoria × Geo: 3 plays con scores estables ~55
    //  - Asoc × Historia: 2 plays con scores altos (excelente)
    const plays = [];
    for (let i = 0; i < 4; i++) {
      plays.push(
        buildPlay({
          sessionId: sessionAssocGeo._id,
          playerId: i % 2 === 0 ? studentA._id : studentB._id,
          score: 60 + i * 5,
          daysAgo: 10 - i
        })
      );
    }
    for (let i = 0; i < 3; i++) {
      plays.push(
        buildPlay({
          sessionId: sessionMemoryGeo._id,
          playerId: i % 2 === 0 ? studentA._id : studentB._id,
          score: 55,
          daysAgo: 5 - i,
          mech: 'mid'
        })
      );
    }
    for (let i = 0; i < 2; i++) {
      plays.push(
        buildPlay({
          sessionId: sessionAssocHistory._id,
          playerId: studentA._id,
          score: 90 + i,
          daysAgo: 3 - i
        })
      );
    }

    await GamePlay.insertMany(plays);
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({}),
      CardDeck.deleteMany({}),
      GameContext.deleteMany({}),
      GameMechanic.deleteMany({}),
      GameSession.deleteMany({}),
      GamePlay.deleteMany({})
    ]);
  });

  it('devuelve un array de celdas con mechanicId, contextId y avgScore finito', async () => {
    const result = await contentEffectivenessService.getContentEffectiveness(
      teacher._id.toString(),
      { groupBy: 'cross', timeRange: '30d' }
    );

    expect(result.groupBy).toBe('cross');
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThanOrEqual(3);

    for (const cell of result.items) {
      expect(typeof cell.mechanicId).toBe('string');
      expect(typeof cell.contextId).toBe('string');
      expect(typeof cell.mechanicName).toBe('string');
      expect(typeof cell.contextName).toBe('string');
      expect(Number.isFinite(cell.avgScore)).toBe(true);
      expect(Number.isFinite(cell.avgAccuracy)).toBe(true);
      expect(typeof cell.totalPlays).toBe('number');
      expect(cell.totalPlays).toBeGreaterThan(0);
      expect(typeof cell.uniqueStudents).toBe('number');
      // No exponer scoreDates ni claves internas del pipeline al consumidor
      expect(cell).not.toHaveProperty('scoreDates');
      expect(cell).not.toHaveProperty('_id');
      // displayName preferido al name interno (ver Analytics_Design_Rationale)
      expect(['Asociación', 'Memoria']).toContain(cell.mechanicName);
      expect(['Geografía CrossTest', 'Historia CrossTest']).toContain(cell.contextName);
    }

    // El ranking va ordenado por avgScore DESCENDENTE. (Antes este test fijaba la
    // celda concreta del top por puntuación CRUDA; tras normalizar avgScore a %
    // real `score/maxScore×100`, el orden depende del porcentaje y no del bruto,
    // así que verificamos el invariante de orden en lugar de una celda fija.)
    for (let i = 1; i < result.items.length; i += 1) {
      expect(result.items[i - 1].avgScore).toBeGreaterThanOrEqual(result.items[i].avgScore);
    }
  });

  it('filtra celdas con totalPlays=0 por defecto (la combinación sin sesión no aparece)', async () => {
    const result = await contentEffectivenessService.getContentEffectiveness(
      teacher._id.toString(),
      { groupBy: 'cross', timeRange: '30d' }
    );

    // Sólo 3 de las 4 combinaciones tienen plays: Memoria × Historia NO aparece
    const memoryHistory = result.items.find(
      c => c.mechanicName === 'Memoria' && c.contextName === 'Historia CrossTest'
    );
    expect(memoryHistory).toBeUndefined();

    // Las 3 celdas con plays sí aparecen
    expect(result.items).toHaveLength(3);
    for (const cell of result.items) {
      expect(cell.totalPlays).toBeGreaterThan(0);
    }
  });

  it('aceptar includeEmpty=true no rompe la respuesta y mantiene la forma del payload', async () => {
    const result = await contentEffectivenessService.getContentEffectiveness(
      teacher._id.toString(),
      { groupBy: 'cross', timeRange: '30d', includeEmpty: true }
    );

    // Mongo $group sólo emite combinaciones con al menos una partida, así que
    // includeEmpty no añade celdas mágicas. Lo importante es que el output
    // sigue siendo válido y mantiene las 3 celdas con datos.
    expect(result.groupBy).toBe('cross');
    expect(result.items).toHaveLength(3);
    for (const cell of result.items) {
      expect(cell).toHaveProperty('mechanicId');
      expect(cell).toHaveProperty('contextId');
      expect(cell).toHaveProperty('avgScore');
    }
  });

  it('cada celda lleva scoreRag, learningRag e interpretation bien formados', async () => {
    const result = await contentEffectivenessService.getContentEffectiveness(
      teacher._id.toString(),
      { groupBy: 'cross', timeRange: '30d' }
    );

    for (const cell of result.items) {
      // scoreRag y learningRag tienen forma { status, thresholds }
      expect(cell.scoreRag).toBeDefined();
      expect(['RED', 'AMBER', 'GREEN']).toContain(cell.scoreRag.status);
      expect(cell.scoreRag.thresholds).toEqual(
        expect.objectContaining({
          green: expect.any(Number),
          red: expect.any(Number)
        })
      );

      expect(cell.learningRag).toBeDefined();
      expect(['RED', 'AMBER', 'GREEN']).toContain(cell.learningRag.status);

      // interpretation tiene whatHappened/soWhat/nowWhat en español
      expect(cell.interpretation).toEqual(
        expect.objectContaining({
          whatHappened: expect.any(String),
          soWhat: expect.any(String),
          nowWhat: expect.any(String)
        })
      );

      // improvementRate y learningEfficiency derivados de la pendiente
      expect(Number.isFinite(cell.improvementRate)).toBe(true);
      expect(['high', 'medium', 'low']).toContain(cell.learningEfficiency);
    }
  });

  it('no devuelve datos cruzados de otros profesores (aislamiento por createdBy)', async () => {
    const result = await contentEffectivenessService.getContentEffectiveness(
      otherTeacher._id.toString(),
      { groupBy: 'cross', timeRange: '30d' }
    );

    expect(result.groupBy).toBe('cross');
    expect(result.items).toEqual([]);
  });

  it('mantiene la firma 1D existente intacta (groupBy=context y mechanic)', async () => {
    // Salvaguarda de no-regresión: la forma del payload 1D no cambia.
    const byContext = await contentEffectivenessService.getContentEffectiveness(
      teacher._id.toString(),
      { groupBy: 'context', timeRange: '30d' }
    );
    expect(byContext.groupBy).toBe('context');
    for (const item of byContext.items) {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('id');
      expect(item).not.toHaveProperty('mechanicId');
      expect(item).not.toHaveProperty('contextId');
    }

    const byMechanic = await contentEffectivenessService.getContentEffectiveness(
      teacher._id.toString(),
      { groupBy: 'mechanic', timeRange: '30d' }
    );
    expect(byMechanic.groupBy).toBe('mechanic');
    for (const item of byMechanic.items) {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('id');
      expect(item).not.toHaveProperty('mechanicId');
      expect(item).not.toHaveProperty('contextId');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// Controller: cache key incluye includeEmpty + cache HIT
// ══════════════════════════════════════════════════════════════════════

describe('analyticsAdvancedController.getContentEffectiveness — cache key', () => {
  const TEACHER_ID = new mongoose.Types.ObjectId().toString();

  const buildReq = (query = {}) => ({
    user: { _id: { toString: () => TEACHER_ID } },
    params: {},
    query: { timeRange: '30d', groupBy: 'cross', includeEmpty: false, ...query }
  });

  const buildRes = () => {
    const res = {
      status: jest.fn(),
      json: jest.fn()
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
  };

  beforeAll(async () => {
    await connectRedis();
  });

  beforeEach(async () => {
    await redisService.flushNamespace('cache:analytics');
    jest
      .spyOn(contentEffectivenessService, 'getContentEffectiveness')
      .mockResolvedValue({ items: [], groupBy: 'cross' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cachea la respuesta bajo una key que incluye groupBy y includeEmpty', async () => {
    await controller.getContentEffectiveness(buildReq(), buildRes());
    // Cache se escribe fire-and-forget; esperar a que se propague.
    await new Promise(resolve => setTimeout(resolve, 50));

    const expectedKey = `contentEffectiveness:${TEACHER_ID}:30d:cross:false`;
    const cached = await redisService.get('cache:analytics', expectedKey);
    expect(cached).not.toBeNull();

    // Segunda llamada idéntica: cache HIT, no se vuelve a invocar el service.
    contentEffectivenessService.getContentEffectiveness.mockClear();
    await controller.getContentEffectiveness(buildReq(), buildRes());
    expect(contentEffectivenessService.getContentEffectiveness).not.toHaveBeenCalled();
  });

  it('usa cache keys distintas según includeEmpty (evita cruce de respuestas)', async () => {
    await controller.getContentEffectiveness(buildReq({ includeEmpty: false }), buildRes());
    await controller.getContentEffectiveness(buildReq({ includeEmpty: true }), buildRes());
    await new Promise(resolve => setTimeout(resolve, 50));

    const cachedFalse = await redisService.get(
      'cache:analytics',
      `contentEffectiveness:${TEACHER_ID}:30d:cross:false`
    );
    const cachedTrue = await redisService.get(
      'cache:analytics',
      `contentEffectiveness:${TEACHER_ID}:30d:cross:true`
    );
    expect(cachedFalse).not.toBeNull();
    expect(cachedTrue).not.toBeNull();

    // El service se invocó una vez por cada combinación de includeEmpty.
    expect(contentEffectivenessService.getContentEffectiveness).toHaveBeenCalledTimes(2);
  });
});
