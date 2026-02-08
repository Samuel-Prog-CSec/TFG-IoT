const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const GameSession = require('../src/models/GameSession');
const GamePlay = require('../src/models/GamePlay');
const GameMechanic = require('../src/models/GameMechanic');
const GameContext = require('../src/models/GameContext');
const Card = require('../src/models/Card');
const CardDeck = require('../src/models/CardDeck');
const { generateTokenPair } = require('../src/middlewares/auth');

describe('Game Full Flow', () => {
  let teacherUser, teacherToken;
  let studentUser, studentId;
  let mechanicId, contextId, cardId1, cardId2, deckId;
  let sessionId, playId;

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
    await GamePlay.deleteMany({});
    await GameMechanic.deleteMany({});
    await GameContext.deleteMany({});
    await Card.deleteMany({});
    await CardDeck.deleteMany({});

    // 1. Setup Data
    teacherUser = await User.create({
      name: 'Game Teacher',
      email: 'gameteacher@test.com',
      password: 'password',
      role: 'teacher',
      status: 'active'
    });
    teacherToken = (await generateTokenPair(teacherUser, mockReq)).accessToken;

    const student = await User.create({
      name: 'Game Student',
      role: 'student',
      createdBy: teacherUser._id,
      status: 'active'
    });
    studentId = student._id;

    // Mechanic
    const mechanic = await GameMechanic.create({
      name: 'test-mechanic',
      displayName: 'Test Mechanic',
      isActive: true,
      rules: {}
    });
    mechanicId = mechanic._id;

    // Cards
    const card1 = await Card.create({ uid: 'AA000001', type: 'NTAG', status: 'active' });
    const card2 = await Card.create({ uid: 'AA000002', type: 'NTAG', status: 'active' });
    cardId1 = card1._id;
    cardId2 = card2._id;

    // Context
    const context = await GameContext.create({
      contextId: 'test-context',
      name: 'Test Context',
      description: 'Test',
      assets: [
        { key: 'asset1', display: 'A1', value: 'A' },
        { key: 'asset2', display: 'A2', value: 'B' }
      ],
      createdBy: teacherUser._id
    });
    contextId = context._id;

    // Deck (reutilizable)
    const deck = await CardDeck.create({
      name: 'Test Deck',
      description: 'Deck for session creation test',
      contextId,
      createdBy: teacherUser._id,
      status: 'active',
      cardMappings: [
        {
          cardId: cardId1,
          uid: 'AA000001',
          assignedValue: 'A',
          displayData: { key: 'asset1', display: 'A1', value: 'A' }
        },
        {
          cardId: cardId2,
          uid: 'AA000002',
          assignedValue: 'B',
          displayData: { key: 'asset2', display: 'A2', value: 'B' }
        }
      ]
    });
    deckId = deck._id;
  });

  it('1. Create Session Configuration from Deck', async () => {
    const sessionData = {
      mechanicId,
      deckId,
      config: {
        pointsPerCorrect: 10,
        numberOfRounds: 5,
        timeLimit: 15,
        penaltyPerError: -2
      }
    };

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send(sessionData);

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeTruthy();
    expect(res.body.data.deckId).toBe(deckId.toString());
    expect(res.body.data.contextId).toBe(contextId.toString());
    expect(res.body.data.cardMappings).toHaveLength(2);

    sessionId = res.body.data.id;
    expect(sessionId).toBeDefined();
  });

  it('2. Start Session', async () => {
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/start`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toBe('active');
  });

  it('3. Create Play (Join Game) as Student', async () => {
    // Teacher creates play for student
    const res = await request(app)
      .post('/api/plays')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({
        sessionId,
        playerId: studentId
      });

    expect(res.statusCode).toEqual(201);
    playId = res.body.data.id;
    expect(playId).toBeDefined();
  });

  it('4. Simulate Game Events (Play)', async () => {
    // Simular 5 eventos correctos para construir score=50
    for (let round = 1; round <= 5; round++) {
      const res = await request(app)
        .post(`/api/plays/${playId}/events`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send({
          eventType: 'correct',
          cardUid: round % 2 === 0 ? 'AA000002' : 'AA000001',
          expectedValue: round % 2 === 0 ? 'B' : 'A',
          actualValue: round % 2 === 0 ? 'B' : 'A',
          pointsAwarded: 10,
          timeElapsed: 1000,
          roundNumber: round
        });

      expect(res.statusCode).toEqual(200);
    }
  });

  // I need to check routes/plays.js to know if addEvent is protected.
  // I'll assume it is protected or I need to bypass.

  it('5. Complete Play and Check Metrics', async () => {
    const res = await request(app)
      .post(`/api/plays/${playId}/complete`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.score).toBe(50);

    // Check Student Metrics in User model
    const student = await User.findById(studentId);
    expect(student.studentMetrics.totalGamesPlayed).toBe(1);
    expect(student.studentMetrics.totalScore).toBe(50);
  });
});
