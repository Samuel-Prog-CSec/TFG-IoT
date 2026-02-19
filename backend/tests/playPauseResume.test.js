const request = require('supertest');
const User = require('../src/models/User');
const GameSession = require('../src/models/GameSession');
const GamePlay = require('../src/models/GamePlay');
const GameMechanic = require('../src/models/GameMechanic');
const GameContext = require('../src/models/GameContext');
const Card = require('../src/models/Card');
const CardDeck = require('../src/models/CardDeck');
const { generateTokenPair } = require('../src/middlewares/auth');
const { app, gameEngine } = require('../src/server');

describe('GamePlay pause/resume', () => {
  let teacherUser;
  let teacherToken;
  let studentUser;
  let studentToken;
  let mechanicId;
  let contextId;
  let deckId;
  let sessionId;
  let playId;

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

    teacherUser = await User.create({
      name: 'Pause Teacher',
      email: 'pause-teacher@test.com',
      password: 'password',
      role: 'teacher',
      status: 'active'
    });
    teacherToken = (await generateTokenPair(teacherUser, mockReq)).accessToken;

    studentUser = await User.create({
      name: 'Pause Student',
      role: 'student',
      createdBy: teacherUser._id,
      status: 'active'
    });
    studentToken = (await generateTokenPair(studentUser, mockReq)).accessToken;

    const mechanic = await GameMechanic.create({
      name: 'pause-mechanic',
      displayName: 'Pause Mechanic',
      isActive: true,
      rules: {}
    });
    mechanicId = mechanic._id;

    const card1 = await Card.create({ uid: 'BB000001', type: 'NTAG', status: 'active' });
    const card2 = await Card.create({ uid: 'BB000002', type: 'NTAG', status: 'active' });

    const context = await GameContext.create({
      contextId: 'pause-context',
      name: 'Pause Context',
      description: 'Test',
      assets: [
        { key: 'asset1', display: 'A1', value: 'A' },
        { key: 'asset2', display: 'A2', value: 'B' }
      ],
      createdBy: teacherUser._id
    });
    contextId = context._id;

    const deck = await CardDeck.create({
      name: 'Pause Deck',
      description: 'Deck for pause/resume tests',
      contextId,
      createdBy: teacherUser._id,
      status: 'active',
      cardMappings: [
        {
          cardId: card1._id,
          uid: 'BB000001',
          assignedValue: 'A',
          displayData: { key: 'asset1', display: 'A1', value: 'A' }
        },
        {
          cardId: card2._id,
          uid: 'BB000002',
          assignedValue: 'B',
          displayData: { key: 'asset2', display: 'A2', value: 'B' }
        }
      ]
    });
    deckId = deck._id;

    // Crear sesión vía API (respeta validaciones: deckId requerido, timeLimit min 3)
    const sessionRes = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({
        mechanicId,
        deckId,
        config: {
          pointsPerCorrect: 10,
          numberOfRounds: 1,
          timeLimit: 3,
          penaltyPerError: -2
        }
      });

    expect(sessionRes.statusCode).toBe(201);
    sessionId = sessionRes.body.data.id;

    // Activar sesión
    const startRes = await request(app)
      .post(`/api/sessions/${sessionId}/start`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders);

    expect(startRes.statusCode).toBe(200);

    // Crear partida
    const playRes = await request(app)
      .post('/api/plays')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({ sessionId, playerId: studentUser._id.toString() });

    expect(playRes.statusCode).toBe(201);
    playId = playRes.body.data.id;

    // Iniciar partida en el motor (sin sockets)
    const playDoc = await GamePlay.findById(playId).populate('sessionId');
    await gameEngine.startPlay(playDoc, playDoc.sessionId);
  });

  afterAll(async () => {
    // Limpieza best-effort
    try {
      if (playId) {
        await gameEngine.endPlay(playId);
      }
    } catch (_) {
      // ignore
    }
  });

  it('rejects pause/resume for non-teacher', async () => {
    const pauseRes = await request(app)
      .post(`/api/plays/${playId}/pause`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set(fingerprintHeaders);

    expect(pauseRes.statusCode).toBe(403);

    const resumeRes = await request(app)
      .post(`/api/plays/${playId}/resume`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set(fingerprintHeaders);

    expect(resumeRes.statusCode).toBe(403);
  });

  it('freezes and resumes the current round timer', async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Pausar
    const pauseRes = await request(app)
      .post(`/api/plays/${playId}/pause`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders);

    expect(pauseRes.statusCode).toBe(200);
    expect(pauseRes.body.data.status).toBe('paused');
    expect(typeof pauseRes.body.data.remainingTime).toBe('number');
    expect(pauseRes.body.data.remainingTime).toBeGreaterThan(0);

    const pausedSession = await GameSession.findById(sessionId);
    expect(pausedSession.status).toBe('active');

    const remainingTimeMs = pauseRes.body.data.remainingTime;

    // Aunque avance el tiempo más allá del límite original, no debe disparar timeout mientras está pausada
    await wait(3500);

    const afterPause = await GamePlay.findById(playId);
    const timeoutEventsWhilePaused = (afterPause.events || []).filter(
      e => e.eventType === 'timeout'
    );
    expect(timeoutEventsWhilePaused.length).toBe(0);

    const stateWhilePaused = gameEngine.getPlayState(playId);
    expect(stateWhilePaused.currentRound).toBe(1);

    // Reanudar
    const resumeRes = await request(app)
      .post(`/api/plays/${playId}/resume`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders);

    expect(resumeRes.statusCode).toBe(200);
    expect(resumeRes.body.data.status).toBe('in-progress');

    const resumedSession = await GameSession.findById(sessionId);
    expect(resumedSession.status).toBe('active');

    // Avanzar justo hasta el tiempo restante para provocar timeout de la ronda 1
    await wait(Math.max(0, remainingTimeMs) + 200);

    // Esperar a que se persista el evento de timeout
    const afterResume = await GamePlay.findById(playId);
    const timeoutEvents = (afterResume.events || []).filter(e => e.eventType === 'timeout');
    expect(timeoutEvents.length).toBe(1);
    expect(timeoutEvents[0].roundNumber).toBe(1);

    const stateAfterTimeout = gameEngine.getPlayState(playId);
    expect(stateAfterTimeout.currentRound).toBe(2);
  });
});
