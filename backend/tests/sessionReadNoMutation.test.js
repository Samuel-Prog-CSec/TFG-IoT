const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const GameSession = require('../src/models/GameSession');
const GameMechanic = require('../src/models/GameMechanic');
const GameContext = require('../src/models/GameContext');
const Card = require('../src/models/Card');
const CardDeck = require('../src/models/CardDeck');
const { generateTokenPair } = require('../src/middlewares/auth');

describe('Session read without mutation', () => {
  let teacherToken;
  let sessionId;

  const fingerprintHeaders = {
    'User-Agent': 'jest-test',
    'Accept-Language': 'en',
    'Accept-Encoding': 'gzip'
  };

  const mockReq = {
    headers: {
      'user-agent': 'jest-test',
      'accept-language': 'en',
      'accept-encoding': 'gzip'
    }
  };

  beforeAll(async () => {
    await User.deleteMany({});
    await GameSession.deleteMany({});
    await GameMechanic.deleteMany({});
    await GameContext.deleteMany({});
    await Card.deleteMany({});
    await CardDeck.deleteMany({});

    const teacherUser = await User.create({
      name: 'Read Session Teacher',
      email: 'read-session-teacher@test.com',
      password: 'password',
      role: 'teacher',
      status: 'active'
    });
    teacherToken = (await generateTokenPair(teacherUser, mockReq)).accessToken;

    const mechanic = await GameMechanic.create({
      name: 'read-session-mechanic',
      displayName: 'Read Session Mechanic',
      isActive: true,
      rules: {}
    });

    const card1 = await Card.create({ uid: 'DD000001', type: 'NTAG', status: 'active' });
    const card2 = await Card.create({ uid: 'DD000002', type: 'NTAG', status: 'active' });

    const context = await GameContext.create({
      contextId: 'read-session-context',
      name: 'Read Session Context',
      description: 'Test',
      assets: [
        { key: 'asset1', display: 'A1', value: 'A' },
        { key: 'asset2', display: 'A2', value: 'B' }
      ],
      createdBy: teacherUser._id
    });

    const deck = await CardDeck.create({
      name: 'Read Session Deck',
      description: 'Deck for read session no-mutation test',
      contextId: context._id,
      createdBy: teacherUser._id,
      status: 'active',
      cardMappings: [
        {
          cardId: card1._id,
          uid: 'DD000001',
          assignedValue: 'A',
          displayData: { key: 'asset1', display: 'A1', value: 'A' }
        },
        {
          cardId: card2._id,
          uid: 'DD000002',
          assignedValue: 'B',
          displayData: { key: 'asset2', display: 'A2', value: 'B' }
        }
      ]
    });

    const sessionRes = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({
        mechanicId: mechanic._id.toString(),
        deckId: deck._id.toString(),
        config: {
          pointsPerCorrect: 10,
          numberOfRounds: 5,
          timeLimit: 15,
          penaltyPerError: -2
        }
      });

    expect(sessionRes.statusCode).toBe(201);
    sessionId = sessionRes.body.data.id;
  });

  it('GET /api/sessions/:id no debe mutar updatedAt', async () => {
    const before = await GameSession.findById(sessionId).select('updatedAt');

    await new Promise(resolve => setTimeout(resolve, 30));

    const res = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders);

    expect(res.statusCode).toBe(200);

    const after = await GameSession.findById(sessionId).select('updatedAt');
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('GET /api/sessions no debe mutar updatedAt', async () => {
    const before = await GameSession.findById(sessionId).select('updatedAt');

    await new Promise(resolve => setTimeout(resolve, 30));

    const res = await request(app)
      .get('/api/sessions?page=1&limit=10')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders);

    expect(res.statusCode).toBe(200);

    const after = await GameSession.findById(sessionId).select('updatedAt');
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });
});
