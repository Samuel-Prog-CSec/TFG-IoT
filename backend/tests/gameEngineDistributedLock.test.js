jest.mock('ioredis', () => {
  const RedisMock = require('ioredis-mock');
  return RedisMock;
});

const mongoose = require('mongoose');
const { connectRedis, disconnectRedis } = require('../src/config/redis');
const redisService = require('../src/services/redisService');
const GameEngine = require('../src/services/gameEngine');
const User = require('../src/models/User');
const GameSession = require('../src/models/GameSession');
const GamePlay = require('../src/models/GamePlay');
const GameMechanic = require('../src/models/GameMechanic');
const GameContext = require('../src/models/GameContext');
const Card = require('../src/models/Card');
const CardDeck = require('../src/models/CardDeck');

describe('GameEngine distributed UID lock', () => {
  let engineA;
  let engineB;
  let ioA;
  let ioB;

  let teacher;
  let student1;
  let student2;
  let session;
  let playA;
  let playB;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const TEST_MONGO_URI =
        process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/rfid-games-test';
      await mongoose.connect(TEST_MONGO_URI);
    }

    await connectRedis();
  });

  afterAll(async () => {
    await engineA?.shutdown();
    await engineB?.shutdown();

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

    ioA = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };

    ioB = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };

    engineA = new GameEngine(ioA);
    engineB = new GameEngine(ioB);

    teacher = await User.create({
      name: 'Teacher Lock',
      email: 'teacher-lock@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    student1 = await User.create({
      name: 'Student One',
      role: 'student',
      createdBy: teacher._id,
      status: 'active'
    });

    student2 = await User.create({
      name: 'Student Two',
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
      contextId: 'lock-test-context',
      name: 'Lock Test Context',
      createdBy: teacher._id,
      assets: [
        { key: 'one', display: 'One', value: 'One' },
        { key: 'two', display: 'Two', value: 'Two' }
      ]
    });

    const card1 = await Card.create({ uid: 'CC110001', type: 'NTAG', status: 'active' });
    const card2 = await Card.create({ uid: 'CC110002', type: 'NTAG', status: 'active' });

    const deck = await CardDeck.create({
      name: 'Lock Deck',
      contextId: context._id,
      createdBy: teacher._id,
      status: 'active',
      cardMappings: [
        {
          cardId: card1._id,
          uid: 'CC110001',
          assignedValue: 'One',
          displayData: { key: 'one', display: 'One', value: 'One' }
        },
        {
          cardId: card2._id,
          uid: 'CC110002',
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
        numberOfRounds: 5,
        timeLimit: 15,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      },
      cardMappings: deck.cardMappings,
      status: 'active',
      createdBy: teacher._id
    });

    playA = await GamePlay.create({
      sessionId: session._id,
      playerId: student1._id,
      status: 'in-progress'
    });

    playB = await GamePlay.create({
      sessionId: session._id,
      playerId: student2._id,
      status: 'in-progress'
    });
  });

  afterEach(async () => {
    if (playA) {
      await engineA.endPlay(playA._id.toString());
    }
    if (playB) {
      await engineB.endPlay(playB._id.toString());
    }

    await engineA?.shutdown();
    await engineB?.shutdown();
  });

  it('blocks second engine when the same UID set is already reserved in Redis', async () => {
    const playDocA = await GamePlay.findById(playA._id);
    const playDocB = await GamePlay.findById(playB._id);
    const sessionDoc = await GameSession.findById(session._id).populate('mechanicId');

    await engineA.startPlay(playDocA, sessionDoc);

    const lock1Owner = await redisService.get(redisService.NAMESPACES.CARD, 'CC110001');
    const lock2Owner = await redisService.get(redisService.NAMESPACES.CARD, 'CC110002');
    expect(lock1Owner).toBe(playA._id.toString());
    expect(lock2Owner).toBe(playA._id.toString());

    await engineB.startPlay(playDocB, sessionDoc);

    expect(engineA.getPlayState(playA._id.toString())).toBeTruthy();
    expect(engineB.getPlayState(playB._id.toString())).toBeNull();

    expect(ioB.to).toHaveBeenCalledWith(`play_${playB._id.toString()}`);
    expect(ioB.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        message: expect.stringContaining('ya está en uso')
      })
    );

    const lock1OwnerAfter = await redisService.get(redisService.NAMESPACES.CARD, 'CC110001');
    const lock2OwnerAfter = await redisService.get(redisService.NAMESPACES.CARD, 'CC110002');
    expect(lock1OwnerAfter).toBe(playA._id.toString());
    expect(lock2OwnerAfter).toBe(playA._id.toString());
  });

  it('creates TTL leases for PLAY and CARD keys when starting a play', async () => {
    const playDocA = await GamePlay.findById(playA._id);
    const sessionDoc = await GameSession.findById(session._id).populate('mechanicId');

    await engineA.startPlay(playDocA, sessionDoc);

    const playTtl = await redisService.ttl(redisService.NAMESPACES.PLAY, playA._id.toString());
    const card1Ttl = await redisService.ttl(redisService.NAMESPACES.CARD, 'CC110001');
    const card2Ttl = await redisService.ttl(redisService.NAMESPACES.CARD, 'CC110002');

    expect(playTtl).toBeGreaterThan(0);
    expect(card1Ttl).toBeGreaterThan(0);
    expect(card2Ttl).toBeGreaterThan(0);
  });

  it('renews distributed lock leases through heartbeat refresh', async () => {
    const playDocA = await GamePlay.findById(playA._id);
    const sessionDoc = await GameSession.findById(session._id).populate('mechanicId');

    await engineA.startPlay(playDocA, sessionDoc);

    const playId = playA._id.toString();
    const beforeRenewalTtl = await redisService.ttl(redisService.NAMESPACES.CARD, 'CC110001');
    await wait(1200);

    const playState = engineA.activePlays.get(playId);
    await engineA.refreshPlayLease(playId, playState);

    const afterRenewalTtl = await redisService.ttl(redisService.NAMESPACES.CARD, 'CC110001');
    expect(afterRenewalTtl).toBeGreaterThan(0);
    expect(afterRenewalTtl).toBeGreaterThanOrEqual(beforeRenewalTtl - 1);
    expect(engineA.metrics.distributedLockLeaseRenewed).toBeGreaterThan(0);
  });
});
