jest.mock('ioredis', () => {
  const RedisMock = require('ioredis-mock');
  return RedisMock;
});

const mongoose = require('mongoose');
const GameEngine = require('../src/services/gameEngine');
const User = require('../src/models/User');
const GameSession = require('../src/models/GameSession');
const GamePlay = require('../src/models/GamePlay');
const GameMechanic = require('../src/models/GameMechanic');
const GameContext = require('../src/models/GameContext');
const Card = require('../src/models/Card');
const CardDeck = require('../src/models/CardDeck');
const redisService = require('../src/services/redisService');
const { connectRedis, disconnectRedis } = require('../src/config/redis');

describe('GamePlay atomic event persistence', () => {
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
    await Card.deleteMany({});
    await CardDeck.deleteMany({});

    for (const namespace of Object.values(redisService.NAMESPACES)) {
      await redisService.flushNamespace(namespace);
    }

    teacher = await User.create({
      name: 'Teacher Persistence',
      email: 'teacher-persistence@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    student = await User.create({
      name: 'Student Persistence',
      role: 'student',
      createdBy: teacher._id,
      status: 'active'
    });

    const mechanic = await GameMechanic.create({
      name: 'association',
      displayName: 'Association',
      isActive: true,
      rules: {}
    });

    const context = await GameContext.create({
      contextId: 'persistence-context',
      name: 'Persistence Context',
      createdBy: teacher._id,
      assets: [
        { key: 'one', display: 'One', value: 'One' },
        { key: 'two', display: 'Two', value: 'Two' }
      ]
    });

    const card1 = await Card.create({ uid: 'DD110001', type: 'NTAG', status: 'active' });
    const card2 = await Card.create({ uid: 'DD110002', type: 'NTAG', status: 'active' });

    const deck = await CardDeck.create({
      name: 'Persistence Deck',
      contextId: context._id,
      createdBy: teacher._id,
      status: 'active',
      cardMappings: [
        {
          cardId: card1._id,
          uid: 'DD110001',
          assignedValue: 'One',
          displayData: { key: 'one', display: 'One', value: 'One' }
        },
        {
          cardId: card2._id,
          uid: 'DD110002',
          assignedValue: 'Two',
          displayData: { key: 'two', display: 'Two', value: 'Two' }
        }
      ]
    });

    session = await GameSession.create({
      mechanicId: mechanic._id,
      deckId: deck._id,
      contextId: context._id,
      config: {
        numberOfCards: 2,
        numberOfRounds: 3,
        timeLimit: 20,
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

  it('updates score, metrics and round atomically with addEventAtomic', async () => {
    await play.addEventAtomic(
      {
        eventType: 'correct',
        cardUid: 'DD110001',
        expectedValue: 'One',
        actualValue: 'One',
        pointsAwarded: 10,
        timeElapsed: 1200,
        roundNumber: 1
      },
      { advanceRound: true }
    );

    const persisted = await GamePlay.findById(play._id);

    expect(persisted.score).toBe(10);
    expect(persisted.currentRound).toBe(2);
    expect(persisted.metrics.totalAttempts).toBe(1);
    expect(persisted.metrics.correctAttempts).toBe(1);
    expect(persisted.metrics.errorAttempts).toBe(0);
    expect(persisted.metrics.timeoutAttempts).toBe(0);
    expect(persisted.events).toHaveLength(1);
    expect(persisted.events[0].eventType).toBe('correct');
  });

  it('does not increment totalAttempts for non-answer events', async () => {
    await play.addEvent({
      eventType: 'round_start',
      roundNumber: 1
    });

    const persisted = await GamePlay.findById(play._id);
    expect(persisted.metrics.totalAttempts).toBe(0);
    expect(persisted.metrics.correctAttempts).toBe(0);
    expect(persisted.events).toHaveLength(1);
    expect(persisted.events[0].eventType).toBe('round_start');
  });

  it('gameEngine startPlay does not persist round_start when policy is disabled', async () => {
    const ioMock = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };

    const engine = new GameEngine(ioMock);

    const playDoc = await GamePlay.findById(play._id);
    const sessionDoc = await GameSession.findById(session._id).populate('mechanicId');

    await engine.startPlay(playDoc, sessionDoc);

    const persisted = await GamePlay.findById(play._id);
    expect(persisted.events).toHaveLength(0);

    await engine.endPlay(play._id.toString());
    await engine.shutdown();
  });
});
