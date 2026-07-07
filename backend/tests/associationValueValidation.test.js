jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const GameEngine = require('../src/services/gameEngine');
const User = require('../src/models/User');
const GameSession = require('../src/models/GameSession');
const GamePlay = require('../src/models/GamePlay');
const GameMechanic = require('../src/models/GameMechanic');
const GameContext = require('../src/models/GameContext');
const CardDeck = require('../src/models/CardDeck');
const redisService = require('../src/services/redisService');
const { connectRedis, disconnectRedis } = require('../src/config/redis');

/**
 * Regresión ADR-222 (ASSOC-VALUE-UNIQ / BUG-FALLBACK-1): la respuesta de
 * Asociación se valida por VALOR (`assignedValue`), no por UID. Con un mazo de
 * valores duplicados (válido: el validador solo exige UIDs únicos), escanear la
 * carta GEMELA del mismo valor debe contar CORRECTA, no ERROR.
 */
describe('Asociación: validación de respuesta por VALOR (no por UID)', () => {
  let teacher;
  let student;
  let session;
  let play;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const TEST_MONGO_URI =
        process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/rfid-games-test';
      await mongoose.connect(TEST_MONGO_URI);
    }
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await GameSession.deleteMany({});
    await GamePlay.deleteMany({});
    await GameMechanic.deleteMany({});
    await GameContext.deleteMany({});
    await CardDeck.deleteMany({});

    for (const namespace of Object.values(redisService.NAMESPACES)) {
      await redisService.flushNamespace(namespace);
    }

    teacher = await User.create({
      name: 'Teacher Assoc',
      email: 'teacher-assoc-value@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    student = await User.create({
      name: 'Student Assoc',
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

    const mechanic = await GameMechanic.create({
      name: 'association',
      displayName: 'Association',
      isActive: true,
      rules: {}
    });

    const context = await GameContext.create({
      contextId: 'assoc-value-context',
      name: 'Assoc Value Context',
      createdBy: teacher._id,
      assets: [
        { key: 'circle', display: 'Círculo', value: 'Circle' },
        { key: 'square', display: 'Cuadrado', value: 'Square' }
      ]
    });

    // Mazo con VALORES DUPLICADOS: dos cartas "Circle" (UID distinto) y dos
    // "Square". Es válido (el validador de mazos solo exige UIDs únicos).
    const deck = await CardDeck.create({
      name: 'Dup Value Deck',
      contextId: context._id,
      createdBy: teacher._id,
      status: 'active',
      cardMappings: [
        {
          uid: 'CC110001',
          assignedValue: 'Circle',
          displayData: { key: 'circle', display: 'Círculo', value: 'Circle' }
        },
        {
          uid: 'CC110002',
          assignedValue: 'Circle',
          displayData: { key: 'circle', display: 'Círculo', value: 'Circle' }
        },
        {
          uid: 'DD110001',
          assignedValue: 'Square',
          displayData: { key: 'square', display: 'Cuadrado', value: 'Square' }
        },
        {
          uid: 'DD110002',
          assignedValue: 'Square',
          displayData: { key: 'square', display: 'Cuadrado', value: 'Square' }
        }
      ]
    });

    session = await GameSession.create({
      mechanicId: mechanic._id,
      deckId: deck._id,
      contextId: context._id,
      config: {
        numberOfCards: 4,
        numberOfRounds: 1,
        timeLimit: 60,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      },
      cardMappings: deck.cardMappings,
      status: 'active',
      createdBy: teacher._id
    });

    play = await GamePlay.create({
      sessionId: session._id,
      playerId: student._id,
      status: 'in-progress',
      currentRound: 1,
      score: 0
    });
  });

  it('una carta del MISMO valor que el reto cuenta CORRECTA aunque su UID sea distinto (regresión BUG-FALLBACK-1/ADR-222)', async () => {
    const ioMock = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    const engine = new GameEngine(ioMock);

    const playDoc = await GamePlay.findById(play._id);
    const sessionDoc = await GameSession.findById(session._id).populate('mechanicId');
    await engine.startPlay(playDoc, sessionDoc);

    const activePlayState = engine.activePlays.get(play._id.toString());
    expect(activePlayState).toBeTruthy();
    const challengeValue = activePlayState.currentChallenge.assignedValue;
    const challengeUid = activePlayState.currentChallenge.uid;
    expect(challengeValue).toBeTruthy();

    // La OTRA carta del mismo valor (gemela, UID distinto al del reto).
    const twin = sessionDoc.cardMappings.find(
      mapping => mapping.assignedValue === challengeValue && mapping.uid !== challengeUid
    );
    expect(twin).toBeTruthy();

    await engine.handleCardScan(twin.uid);

    const persisted = await GamePlay.findById(play._id);
    const answerEvents = persisted.events.filter(event =>
      ['correct', 'error'].includes(event.eventType)
    );
    expect(answerEvents).toHaveLength(1);
    // Con el bug (validar por UID), la gemela daba 'error'. Por VALOR es 'correct'.
    expect(answerEvents[0].eventType).toBe('correct');
    expect(persisted.score).toBe(sessionDoc.config.pointsPerCorrect);

    await engine.endPlay(play._id.toString());
    await engine.shutdown();
  });
});
