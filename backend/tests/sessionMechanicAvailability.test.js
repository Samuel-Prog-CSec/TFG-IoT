const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const GameMechanic = require('../src/models/GameMechanic');
const GameContext = require('../src/models/GameContext');
const CardDeck = require('../src/models/CardDeck');
const GameSession = require('../src/models/GameSession');

const fingerprintHeaders = {
  'User-Agent': 'jest-test',
  'Accept-Language': 'en',
  'Accept-Encoding': 'gzip'
};

describe('Session mechanic availability (Sprint 4)', () => {
  let teacherToken;
  let teacherId;
  let associationMechanicId;
  let sequenceMechanicId;
  let memoryMechanicId;
  let deckId;
  const originalEnabledMechanics = process.env.SESSION_ENABLED_MECHANICS;

  const buildMemoryBoardLayout = cards =>
    cards.map((card, slotIndex) => ({
      slotIndex,
      uid: card.uid,
      assignedValue: card.assignedValue,
      displayData: card.displayData
    }));

  beforeEach(async () => {
    await Promise.all([
      GameSession.deleteMany({}),
      CardDeck.deleteMany({}),
      GameContext.deleteMany({}),
      GameMechanic.deleteMany({}),
      User.deleteMany({})
    ]);

    const teacher = await User.create({
      name: 'Teacher Sprint',
      email: 'teacher.sprint@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });
    teacherId = teacher._id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set(fingerprintHeaders)
      .send({ email: 'teacher.sprint@test.com', password: 'Password123' });

    expect(loginRes.statusCode).toBe(200);
    teacherToken = loginRes.body.data.accessToken;

    const [associationMechanic, sequenceMechanic, memoryMechanic] = await Promise.all([
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
        name: 'sequence',
        displayName: 'Secuencia',
        isActive: true,
        rules: {
          behavior: { availability: 'coming_soon' },
          limits: {
            minRounds: 1,
            maxRounds: 10,
            minTimeLimit: 10,
            maxTimeLimit: 120,
            minCards: 3,
            maxCards: 10
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
    sequenceMechanicId = sequenceMechanic._id;
    memoryMechanicId = memoryMechanic._id;

    const context = await GameContext.create({
      contextId: 'sprint-mechanics',
      name: 'Sprint Mechanics',
      assets: [
        { key: 'a', value: 'A', display: 'A' },
        { key: 'b', value: 'B', display: 'B' }
      ]
    });

    const deckMappings = [
      {
        uid: 'AB12CD34',
        assignedValue: 'A',
        displayData: { value: 'A', display: 'A' }
      },
      {
        uid: 'EF56AB78',
        assignedValue: 'A',
        displayData: { value: 'A', display: 'A' }
      },
      {
        uid: 'CD34EF56',
        assignedValue: 'B',
        displayData: { value: 'B', display: 'B' }
      },
      {
        uid: '7856ABCD',
        assignedValue: 'B',
        displayData: { value: 'B', display: 'B' }
      }
    ];

    const deck = await CardDeck.create({
      name: 'Deck Sprint Mechanics',
      contextId: context._id,
      createdBy: teacherId,
      status: 'active',
      cardMappings: deckMappings
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

  it('rejects non-enabled mechanics by SESSION_ENABLED_MECHANICS env var', async () => {
    process.env.SESSION_ENABLED_MECHANICS = 'association,memory';

    const res = await request(app)
      .post('/api/sessions')
      .set({ Authorization: `Bearer ${teacherToken}`, ...fingerprintHeaders })
      .send({
        mechanicId: sequenceMechanicId,
        deckId,
        config: {
          numberOfRounds: 3,
          timeLimit: 15,
          pointsPerCorrect: 10,
          penaltyPerError: -2
        }
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/no está habilitada|entorno actual/i);
  });

  it('allows association sessions', async () => {
    const deck = await CardDeck.findById(deckId).lean();
    const cardMappings = deck?.cardMappings || [];
    const associationChallengePlan = Array.from({ length: 3 }, (_, index) => {
      const mapping = cardMappings[index % cardMappings.length];
      return {
        roundNumber: index + 1,
        uid: mapping.uid,
        assignedValue: mapping.assignedValue,
        displayData: mapping.displayData,
        promptText: `Reto ${index + 1}`
      };
    });

    const res = await request(app)
      .post('/api/sessions')
      .set({ Authorization: `Bearer ${teacherToken}`, ...fingerprintHeaders })
      .send({
        mechanicId: associationMechanicId,
        deckId,
        config: {
          numberOfRounds: 3,
          timeLimit: 15,
          pointsPerCorrect: 10,
          penaltyPerError: -2
        },
        associationChallengePlan
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.mechanicId).toBe(associationMechanicId.toString());
  });

  it('allows memory sessions with complete boardLayout and timeLimit up to 300', async () => {
    process.env.SESSION_ENABLED_MECHANICS = 'association,memory';

    const deck = await CardDeck.findById(deckId).lean();
    const boardLayout = buildMemoryBoardLayout(deck.cardMappings || []);

    const res = await request(app)
      .post('/api/sessions')
      .set({ Authorization: `Bearer ${teacherToken}`, ...fingerprintHeaders })
      .send({
        mechanicId: memoryMechanicId,
        deckId,
        config: {
          numberOfRounds: 5,
          timeLimit: 300,
          pointsPerCorrect: 20,
          penaltyPerError: -3
        },
        boardLayout
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.config.timeLimit).toBe(300);
    expect(Array.isArray(res.body.data.boardLayout)).toBe(true);
    const deckForAssert = await CardDeck.findById(deckId).lean();
    expect(res.body.data.boardLayout).toHaveLength((deckForAssert.cardMappings || []).length);
  });

  it('allows memory session creation without boardLayout (validated at startPlay)', async () => {
    process.env.SESSION_ENABLED_MECHANICS = 'association,memory';

    const res = await request(app)
      .post('/api/sessions')
      .set({ Authorization: `Bearer ${teacherToken}`, ...fingerprintHeaders })
      .send({
        mechanicId: memoryMechanicId,
        deckId,
        config: {
          numberOfRounds: 5,
          timeLimit: 120,
          pointsPerCorrect: 20,
          penaltyPerError: -3
        }
      });

    // La validación de boardLayout se ha movido a startPlay para permitir
    // el flujo frontend donde la sesión se crea primero y boardLayout se configura después
    expect(res.statusCode).toBe(201);
  });

  it('rejects memory sessions with timeLimit above mechanic max', async () => {
    process.env.SESSION_ENABLED_MECHANICS = 'association,memory';

    const deck = await CardDeck.findById(deckId).lean();
    const boardLayout = buildMemoryBoardLayout(deck.cardMappings || []);

    const res = await request(app)
      .post('/api/sessions')
      .set({ Authorization: `Bearer ${teacherToken}`, ...fingerprintHeaders })
      .send({
        mechanicId: memoryMechanicId,
        deckId,
        config: {
          numberOfRounds: 5,
          timeLimit: 301,
          pointsPerCorrect: 20,
          penaltyPerError: -3
        },
        boardLayout
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/validación|timeLimit/i);
  });
});
