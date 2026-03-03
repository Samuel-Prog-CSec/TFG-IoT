const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const GameMechanic = require('../src/models/GameMechanic');
const GameContext = require('../src/models/GameContext');
const Card = require('../src/models/Card');
const CardDeck = require('../src/models/CardDeck');
const GameSession = require('../src/models/GameSession');

const fingerprintHeaders = {
  'User-Agent': 'jest-test',
  'Accept-Language': 'en',
  'Accept-Encoding': 'gzip'
};

describe('Session clone endpoint (T-037)', () => {
  let ownerToken;
  let otherTeacherToken;
  let ownerId;
  let deckId;
  let associationMechanicId;
  let memoryMechanicId;
  let contextId;
  let baseMappings;
  const originalEnabledMechanics = process.env.SESSION_ENABLED_MECHANICS;

  const buildBoardLayout = cardMappings =>
    cardMappings.map((mapping, slotIndex) => ({
      slotIndex,
      cardId: mapping.cardId,
      uid: mapping.uid,
      assignedValue: mapping.assignedValue,
      displayData: mapping.displayData
    }));

  beforeEach(async () => {
    process.env.SESSION_ENABLED_MECHANICS = 'association,memory';

    await Promise.all([
      GameSession.deleteMany({}),
      CardDeck.deleteMany({}),
      Card.deleteMany({}),
      GameContext.deleteMany({}),
      GameMechanic.deleteMany({}),
      User.deleteMany({})
    ]);

    const [owner] = await Promise.all([
      User.create({
        name: 'Owner Teacher',
        email: 'owner.teacher@test.com',
        password: 'Password123',
        role: 'teacher',
        status: 'active',
        accountStatus: 'approved'
      }),
      User.create({
        name: 'Other Teacher',
        email: 'other.teacher@test.com',
        password: 'Password123',
        role: 'teacher',
        status: 'active',
        accountStatus: 'approved'
      })
    ]);

    ownerId = owner._id;

    const [ownerLogin, otherLogin] = await Promise.all([
      request(app)
        .post('/api/auth/login')
        .set(fingerprintHeaders)
        .send({ email: 'owner.teacher@test.com', password: 'Password123' }),
      request(app)
        .post('/api/auth/login')
        .set(fingerprintHeaders)
        .send({ email: 'other.teacher@test.com', password: 'Password123' })
    ]);

    ownerToken = ownerLogin.body.data.accessToken;
    otherTeacherToken = otherLogin.body.data.accessToken;

    const [associationMechanic, memoryMechanic] = await Promise.all([
      GameMechanic.create({
        name: 'association',
        displayName: 'Asociación',
        isActive: true,
        rules: {
          limits: {
            minRounds: 1,
            maxRounds: 20,
            minTimeLimit: 5,
            maxTimeLimit: 60,
            minCards: 2,
            maxCards: 20
          }
        }
      }),
      GameMechanic.create({
        name: 'memory',
        displayName: 'Memoria',
        isActive: true,
        rules: {
          limits: {
            minRounds: 1,
            maxRounds: 10,
            minTimeLimit: 10,
            maxTimeLimit: 300,
            minCards: 4,
            maxCards: 20
          },
          behavior: {
            matchingGroupSize: 2
          }
        }
      })
    ]);

    associationMechanicId = associationMechanic._id;
    memoryMechanicId = memoryMechanic._id;

    const context = await GameContext.create({
      contextId: 'clone-context',
      name: 'Clone Context',
      assets: [
        { key: 'a', value: 'A', display: 'A' },
        { key: 'b', value: 'B', display: 'B' },
        { key: 'c', value: 'C', display: 'C' },
        { key: 'd', value: 'D', display: 'D' }
      ]
    });

    contextId = context._id;

    const [cardOne, cardTwo, cardThree, cardFour] = await Promise.all([
      Card.create({ uid: 'AA11BB22', type: 'NTAG', status: 'active' }),
      Card.create({ uid: 'CC33DD44', type: 'NTAG', status: 'active' }),
      Card.create({ uid: 'EE55FF66', type: 'NTAG', status: 'active' }),
      Card.create({ uid: '1122AABB', type: 'NTAG', status: 'active' })
    ]);

    baseMappings = [
      {
        cardId: cardOne._id,
        uid: cardOne.uid,
        assignedValue: 'A',
        displayData: { value: 'A', display: 'A' }
      },
      {
        cardId: cardTwo._id,
        uid: cardTwo.uid,
        assignedValue: 'A',
        displayData: { value: 'A', display: 'A' }
      },
      {
        cardId: cardThree._id,
        uid: cardThree.uid,
        assignedValue: 'B',
        displayData: { value: 'B', display: 'B' }
      },
      {
        cardId: cardFour._id,
        uid: cardFour.uid,
        assignedValue: 'B',
        displayData: { value: 'B', display: 'B' }
      }
    ];

    const deck = await CardDeck.create({
      name: 'Deck Clone',
      contextId,
      createdBy: ownerId,
      status: 'active',
      cardMappings: baseMappings
    });

    deckId = deck._id;
  });

  afterEach(() => {
    if (originalEnabledMechanics === undefined) {
      delete process.env.SESSION_ENABLED_MECHANICS;
    } else {
      process.env.SESSION_ENABLED_MECHANICS = originalEnabledMechanics;
    }
  });

  it('clones an owner session and resets runtime state to created', async () => {
    const sourceSession = await GameSession.create({
      mechanicId: associationMechanicId,
      deckId,
      contextId,
      sensorId: 'sensor-clone-1',
      config: {
        numberOfCards: 4,
        numberOfRounds: 5,
        timeLimit: 20,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      },
      cardMappings: baseMappings,
      status: 'completed',
      startedAt: new Date('2026-03-01T10:00:00.000Z'),
      endedAt: new Date('2026-03-01T10:10:00.000Z'),
      createdBy: ownerId
    });

    const res = await request(app)
      .post(`/api/sessions/${sourceSession._id}/clone`)
      .set({ Authorization: `Bearer ${ownerToken}`, ...fingerprintHeaders })
      .send({});

    expect(res.statusCode).toBe(201);
    expect(res.body.data.id).not.toBe(sourceSession._id.toString());
    expect(res.body.data.status).toBe('created');
    expect(res.body.data.startedAt).toBeFalsy();
    expect(res.body.data.endedAt).toBeFalsy();
    expect(res.body.data.config.numberOfCards).toBe(4);
    expect(res.body.data.cardMappings).toHaveLength(4);

    const clonedSession = await GameSession.findById(res.body.data.id).lean();
    expect(clonedSession.status).toBe('created');
    expect(clonedSession.startedAt).toBeFalsy();
    expect(clonedSession.endedAt).toBeFalsy();
    expect(clonedSession.createdBy.toString()).toBe(ownerId.toString());
  });

  it('rejects cloning when the requester is not the owner', async () => {
    const sourceSession = await GameSession.create({
      mechanicId: associationMechanicId,
      deckId,
      contextId,
      config: {
        numberOfCards: 4,
        numberOfRounds: 5,
        timeLimit: 20,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      },
      cardMappings: baseMappings,
      status: 'created',
      createdBy: ownerId
    });

    const res = await request(app)
      .post(`/api/sessions/${sourceSession._id}/clone`)
      .set({ Authorization: `Bearer ${otherTeacherToken}`, ...fingerprintHeaders })
      .send({});

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/no tienes permiso/i);
  });

  it('resyncs memory clone with updated deck mappings and requires boardLayout reconfiguration', async () => {
    const sourceSession = await GameSession.create({
      mechanicId: memoryMechanicId,
      deckId,
      contextId,
      config: {
        numberOfCards: 4,
        numberOfRounds: 5,
        timeLimit: 120,
        pointsPerCorrect: 15,
        penaltyPerError: -3
      },
      cardMappings: baseMappings,
      boardLayout: buildBoardLayout(baseMappings),
      status: 'completed',
      startedAt: new Date('2026-03-01T10:00:00.000Z'),
      endedAt: new Date('2026-03-01T10:10:00.000Z'),
      createdBy: ownerId
    });

    const updatedMappings = [
      {
        ...baseMappings[0],
        assignedValue: 'C',
        displayData: { value: 'C', display: 'C' }
      },
      {
        ...baseMappings[1],
        assignedValue: 'C',
        displayData: { value: 'C', display: 'C' }
      },
      {
        ...baseMappings[2],
        assignedValue: 'D',
        displayData: { value: 'D', display: 'D' }
      },
      {
        ...baseMappings[3],
        assignedValue: 'D',
        displayData: { value: 'D', display: 'D' }
      }
    ];

    await CardDeck.updateOne(
      { _id: deckId },
      {
        $set: {
          cardMappings: updatedMappings
        }
      }
    );

    const res = await request(app)
      .post(`/api/sessions/${sourceSession._id}/clone`)
      .set({ Authorization: `Bearer ${ownerToken}`, ...fingerprintHeaders })
      .send({});

    expect(res.statusCode).toBe(201);
    expect(res.body.data.status).toBe('created');
    expect(res.body.message).toMatch(/configurar de nuevo el tablero/i);

    const clonedMappings = res.body.data.cardMappings || [];
    const clonedLayout = res.body.data.boardLayout || [];

    expect(clonedMappings).toHaveLength(4);
    expect(clonedLayout).toHaveLength(0);

    const assignedValues = new Set(clonedMappings.map(mapping => mapping.assignedValue));
    expect(assignedValues.has('C')).toBe(true);
    expect(assignedValues.has('D')).toBe(true);

    const startRes = await request(app)
      .post(`/api/sessions/${res.body.data.id}/start`)
      .set({ Authorization: `Bearer ${ownerToken}`, ...fingerprintHeaders })
      .send({});

    expect(startRes.statusCode).toBe(400);
    expect(startRes.body.message).toMatch(/boardLayout es obligatorio/i);

    const sourceAfterClone = await GameSession.findById(sourceSession._id).lean();
    expect(sourceAfterClone.cardMappings[0].assignedValue).toBe('A');
    expect(sourceAfterClone.status).toBe('completed');
  });

  it('preloads association challenge draft on clone and still requires confirmation before start', async () => {
    const sourceSession = await GameSession.create({
      mechanicId: associationMechanicId,
      deckId,
      contextId,
      config: {
        numberOfCards: 4,
        numberOfRounds: 5,
        timeLimit: 20,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      },
      cardMappings: baseMappings,
      associationChallengePlan: [
        {
          roundNumber: 1,
          cardId: baseMappings[0].cardId,
          uid: baseMappings[0].uid,
          assignedValue: baseMappings[0].assignedValue,
          displayData: baseMappings[0].displayData,
          promptText: 'Reto original'
        }
      ],
      status: 'completed',
      createdBy: ownerId
    });

    const cloneRes = await request(app)
      .post(`/api/sessions/${sourceSession._id}/clone`)
      .set({ Authorization: `Bearer ${ownerToken}`, ...fingerprintHeaders })
      .send({});

    expect(cloneRes.statusCode).toBe(201);
    expect(cloneRes.body.message).toMatch(/precargaron los retos de asociación/i);
    expect(cloneRes.body.data.requiresAssociationPlanConfiguration).toBe(true);
    expect(cloneRes.body.data.associationChallengePlan).toHaveLength(5);
    expect(cloneRes.body.data.associationChallengePlan[0].promptText).toBe('Reto original');

    const clonedId = cloneRes.body.data.id;

    const startBlockedRes = await request(app)
      .post(`/api/sessions/${clonedId}/start`)
      .set({ Authorization: `Bearer ${ownerToken}`, ...fingerprintHeaders })
      .send({});

    expect(startBlockedRes.statusCode).toBe(400);
    expect(startBlockedRes.body.message).toMatch(/configurar los retos de asociación/i);

    const clonedMappings = cloneRes.body.data.cardMappings;
    const associationChallengePlan = Array.from({ length: 5 }, (_, index) => {
      const mapping = clonedMappings[index % clonedMappings.length];
      return {
        roundNumber: index + 1,
        cardId: mapping.cardId,
        uid: mapping.uid,
        assignedValue: mapping.assignedValue,
        displayData: mapping.displayData,
        promptText: `Reto ronda ${index + 1}`
      };
    });

    const updateRes = await request(app)
      .put(`/api/sessions/${clonedId}`)
      .set({ Authorization: `Bearer ${ownerToken}`, ...fingerprintHeaders })
      .send({ associationChallengePlan });

    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.body.data.requiresAssociationPlanConfiguration).toBe(false);
    expect(updateRes.body.data.associationChallengePlan).toHaveLength(5);

    const startRes = await request(app)
      .post(`/api/sessions/${clonedId}/start`)
      .set({ Authorization: `Bearer ${ownerToken}`, ...fingerprintHeaders })
      .send({});

    expect(startRes.statusCode).toBe(200);
    expect(startRes.body.data.status).toBe('active');
  });
});
