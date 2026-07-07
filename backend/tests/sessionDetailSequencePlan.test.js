/**
 * @fileoverview Regresión: el detalle de una sesión de Secuencia
 * (GET /api/sessions/:id) debe incluir `sequencePlan` y `sequenceConfig`.
 *
 * Bug detectado en QA (2026-05-25): la proyección `select` de `getSessionById`
 * incluía `boardLayout` y `associationChallengePlan` pero OMITÍA `sequencePlan`.
 * Consecuencia: el detalle devolvía `sequencePlan: []`, así que el "Score máximo
 * teórico" del cliente caía al fallback `rondas × puntos` (p. ej. 60/90) en vez
 * del máximo real `Σ longitud × puntos` (p. ej. 210/330, el que muestra el
 * GameOver vía createPlay), y la pestaña "Plan de secuencias" quedaba vacía.
 */
const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const GameSession = require('../src/models/GameSession');
const GameMechanic = require('../src/models/GameMechanic');
const GameContext = require('../src/models/GameContext');
const CardDeck = require('../src/models/CardDeck');
const { generateTokenPair } = require('../src/middlewares/auth');

describe('GET /api/sessions/:id — sequencePlan en el detalle de Secuencia', () => {
  let token;
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

  const cardMappings = [
    { uid: 'AA000001', assignedValue: 'A', displayData: { key: 'a', display: 'A', value: 'A' } },
    { uid: 'AA000002', assignedValue: 'B', displayData: { key: 'b', display: 'B', value: 'B' } },
    { uid: 'AA000003', assignedValue: 'C', displayData: { key: 'c', display: 'C', value: 'C' } }
  ];

  beforeAll(async () => {
    await Promise.all([
      User.deleteMany({}),
      GameSession.deleteMany({}),
      GameMechanic.deleteMany({}),
      GameContext.deleteMany({}),
      CardDeck.deleteMany({})
    ]);

    const teacher = await User.create({
      name: 'Sequence Detail Teacher',
      email: 'sequence-detail-teacher@test.com',
      password: 'password',
      role: 'teacher',
      status: 'active'
    });
    token = (await generateTokenPair(teacher, mockReq)).accessToken;

    const mechanic = await GameMechanic.create({
      name: 'sequence',
      displayName: 'Secuencia',
      isActive: true,
      rules: {}
    });

    const context = await GameContext.create({
      contextId: 'sequence-detail-context',
      name: 'Sequence Detail Context',
      description: 'Test',
      assets: [
        { key: 'a', display: 'A', value: 'A' },
        { key: 'b', display: 'B', value: 'B' },
        { key: 'c', display: 'C', value: 'C' }
      ],
      createdBy: teacher._id
    });

    const deck = await CardDeck.create({
      name: 'Sequence Detail Deck',
      description: 'Deck for sequence detail test',
      contextId: context._id,
      createdBy: teacher._id,
      status: 'active',
      cardMappings
    });

    // Sesión de Secuencia con un plan de 2 rondas (longitudes 2 + 3 = 5 cartas).
    // maxScore real = 5 × 15 = 75; el fallback rondas×puntos sería 2 × 15 = 30.
    const session = await GameSession.create({
      mechanicId: mechanic._id,
      deckId: deck._id,
      contextId: context._id,
      config: {
        numberOfCards: 3,
        numberOfRounds: 2,
        timeLimit: 30,
        pointsPerCorrect: 15,
        penaltyPerError: -3
      },
      cardMappings,
      sequenceConfig: { minSequenceLength: 2, maxSequenceLength: 3, displaySeconds: 3 },
      sequencePlan: [
        {
          roundNumber: 1,
          length: 2,
          sequence: [
            { uid: 'AA000001', assignedValue: 'A', displayData: { display: 'A' } },
            { uid: 'AA000002', assignedValue: 'B', displayData: { display: 'B' } }
          ]
        },
        {
          roundNumber: 2,
          length: 3,
          sequence: [
            { uid: 'AA000001', assignedValue: 'A', displayData: { display: 'A' } },
            { uid: 'AA000002', assignedValue: 'B', displayData: { display: 'B' } },
            { uid: 'AA000003', assignedValue: 'C', displayData: { display: 'C' } }
          ]
        }
      ],
      status: 'created',
      createdBy: teacher._id
    });

    sessionId = session._id.toString();
  });

  it('expone sequencePlan con length por ronda (no el array vacío)', async () => {
    const res = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`)
      .set(fingerprintHeaders);

    expect(res.statusCode).toBe(200);

    const plan = res.body.data.sequencePlan;
    expect(Array.isArray(plan)).toBe(true);
    expect(plan).toHaveLength(2);

    // Las longitudes deben llegar al cliente para calcular el máximo real.
    const totalSequenceCards = plan.reduce((acc, r) => acc + (Number(r.length) || 0), 0);
    expect(totalSequenceCards).toBe(5);

    // Con el plan presente, el máximo teórico es Σ longitud × puntos (75),
    // no el fallback rondas × puntos (30) que se mostraba con el plan ausente.
    const points = res.body.data.config.pointsPerCorrect;
    expect(totalSequenceCards * points).toBe(75);
    expect(res.body.data.config.numberOfRounds * points).toBe(30);
  });

  it('expone también sequenceConfig en el detalle', async () => {
    const res = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`)
      .set(fingerprintHeaders);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.sequenceConfig).toMatchObject({
      minSequenceLength: 2,
      maxSequenceLength: 3
    });
  });
});
