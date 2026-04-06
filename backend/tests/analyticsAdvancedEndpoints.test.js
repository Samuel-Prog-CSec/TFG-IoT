/**
 * @fileoverview Tests de integracion para los endpoints avanzados de analytics.
 * Verifica los endpoints de trayectoria (E01-E04), analisis de sesiones (E05-E08),
 * engagement (E09-E11), alertas (E15-E16) y reportes (E17-E19).
 */

const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const GameContext = require('../src/models/GameContext');
const GameMechanic = require('../src/models/GameMechanic');
const GameSession = require('../src/models/GameSession');
const GamePlay = require('../src/models/GamePlay');
const CardDeck = require('../src/models/CardDeck');

const fingerprintHeaders = {
  'User-Agent': 'jest-test',
  'Accept-Language': 'en',
  'Accept-Encoding': 'gzip'
};

const makeAuthHeaders = token => ({
  Authorization: `Bearer ${token}`,
  ...fingerprintHeaders
});

const loginUser = async ({ email, password }) => {
  const res = await request(app)
    .post('/api/auth/login')
    .set(fingerprintHeaders)
    .send({ email, password });
  expect(res.statusCode).toBe(200);
  return res.body.data.accessToken;
};

describe('Analytics Advanced Endpoints', () => {
  let token;
  let otherToken;
  let teacher;
  let otherTeacher;
  const students = [];
  let context;
  let mechanic;
  let deck;
  let session;
  let completedPlayId; // ID de una partida completada para tests de rounds

  beforeAll(async () => {
    // Crear profesor principal
    teacher = await User.create({
      name: 'Prof Analytics Adv',
      email: 'prof-analytics-adv@test.com',
      password: 'Test1234!',
      role: 'teacher',
      accountStatus: 'approved'
    });

    token = await loginUser({
      email: 'prof-analytics-adv@test.com',
      password: 'Test1234!'
    });

    // Crear segundo profesor para tests de ownership (403)
    otherTeacher = await User.create({
      name: 'Prof Otro Adv',
      email: 'prof-otro-adv@test.com',
      password: 'Test1234!',
      role: 'teacher',
      accountStatus: 'approved'
    });

    otherToken = await loginUser({
      email: 'prof-otro-adv@test.com',
      password: 'Test1234!'
    });

    // Crear contexto y mecanica
    context = await GameContext.create({
      contextId: 'analytics-adv-ctx',
      name: 'Contexto Analytics Avanzado',
      description: 'Test context for advanced analytics',
      createdBy: teacher._id,
      assets: [
        { key: 'a1', value: 'val1', display: 'Display 1' },
        { key: 'a2', value: 'val2', display: 'Display 2' }
      ]
    });

    mechanic = await GameMechanic.create({
      name: 'analytics-adv-mechanic',
      displayName: 'Analytics Adv Mech',
      description: 'Test mechanic for advanced analytics'
    });

    // Crear deck
    deck = await CardDeck.create({
      name: 'Analytics Adv Deck',
      contextId: context._id,
      createdBy: teacher._id,
      cardMappings: [
        { uid: 'AAAA1111', assignedValue: 'val1', displayData: { label: 'Display 1' } },
        { uid: 'BBBB2222', assignedValue: 'val2', displayData: { label: 'Display 2' } }
      ]
    });

    // Crear 5 estudiantes con diferentes perfiles
    const studentData = [
      { name: 'Alumno Declive', avgScore: 75, correct: 8, errors: 2 },
      { name: 'Alumno Estable', avgScore: 55, correct: 6, errors: 4 },
      { name: 'Alumno Reciente', avgScore: 70, correct: 7, errors: 3 },
      { name: 'Alumno Sin Datos', avgScore: 0, correct: 0, errors: 0 },
      { name: 'Alumno Top', avgScore: 90, correct: 9, errors: 1 }
    ];

    for (const s of studentData) {
      const student = await User.create({
        name: s.name,
        role: 'student',
        createdBy: teacher._id,
        status: 'active',
        profile: { classroom: 'B1' },
        studentMetrics: {
          totalGamesPlayed: s.correct + s.errors > 0 ? 10 : 0,
          totalScore: s.avgScore * 10,
          averageScore: s.avgScore,
          bestScore: s.avgScore + 5,
          totalCorrectAnswers: s.correct,
          totalErrors: s.errors,
          averageResponseTime: 2500,
          lastPlayedAt: s.avgScore > 0 ? new Date() : null
        }
      });
      students.push(student);
    }

    // Crear sesion
    session = await GameSession.create({
      name: 'Sesion Analytics Adv Test',
      contextId: context._id,
      mechanicId: mechanic._id,
      deckId: deck._id,
      createdBy: teacher._id,
      status: 'active',
      config: {
        numberOfCards: 2,
        timeLimit: 300,
        rounds: 5
      },
      cardMappings: [
        { uid: 'AAAA1111', assignedValue: 'val1', displayData: { label: 'Display 1' } },
        { uid: 'BBBB2222', assignedValue: 'val2', displayData: { label: 'Display 2' } }
      ]
    });

    // Crear GamePlays con datos temporales distribuidos
    const now = new Date();
    const plays = [];

    // Student 0 (Declive): 15 plays con scores descendentes en 14 dias
    for (let j = 0; j < 15; j++) {
      const completedAt = new Date(now);
      completedAt.setDate(now.getDate() - j);
      plays.push({
        sessionId: session._id,
        playerId: students[0]._id,
        status: 'completed',
        score: 80 - j * 3,
        startedAt: new Date(completedAt.getTime() - 120000),
        completedAt,
        metrics: {
          totalAttempts: 10,
          correctAttempts: Math.max(3, 8 - j),
          errorAttempts: Math.min(7, 2 + j),
          timeoutAttempts: 0,
          averageResponseTime: 2500 + j * 200,
          completionTime: 120000
        },
        events: [
          { roundNumber: 1, cardUid: 'AAAA1111', eventType: 'correct', timeElapsed: 2000 },
          {
            roundNumber: 2,
            cardUid: 'BBBB2222',
            eventType: j > 7 ? 'error' : 'correct',
            timeElapsed: 3000 + j * 100
          },
          {
            roundNumber: 3,
            cardUid: 'AAAA1111',
            eventType: j > 5 ? 'error' : 'correct',
            timeElapsed: 3500 + j * 150
          },
          {
            roundNumber: 4,
            cardUid: 'BBBB2222',
            eventType: j > 10 ? 'error' : 'correct',
            timeElapsed: 4000 + j * 200
          },
          {
            roundNumber: 5,
            cardUid: 'AAAA1111',
            eventType: j > 12 ? 'error' : 'correct',
            timeElapsed: 5000 + j * 200
          }
        ]
      });
    }

    // Student 1 (Estable): 8 plays con score estable ~55
    for (let j = 0; j < 8; j++) {
      const completedAt = new Date(now);
      completedAt.setDate(now.getDate() - j * 2);
      plays.push({
        sessionId: session._id,
        playerId: students[1]._id,
        status: 'completed',
        score: 53 + (j % 3) * 2,
        startedAt: new Date(completedAt.getTime() - 90000),
        completedAt,
        metrics: {
          totalAttempts: 10,
          correctAttempts: 6,
          errorAttempts: 4,
          timeoutAttempts: 0,
          averageResponseTime: 3000,
          completionTime: 90000
        },
        events: [
          { roundNumber: 1, cardUid: 'AAAA1111', eventType: 'correct', timeElapsed: 2500 },
          { roundNumber: 2, cardUid: 'BBBB2222', eventType: 'correct', timeElapsed: 3000 },
          { roundNumber: 3, cardUid: 'AAAA1111', eventType: 'error', timeElapsed: 3500 },
          { roundNumber: 4, cardUid: 'BBBB2222', eventType: 'correct', timeElapsed: 2800 },
          { roundNumber: 5, cardUid: 'AAAA1111', eventType: 'error', timeElapsed: 4000 }
        ]
      });
    }

    // Student 2 (Reciente): 3 plays recientes
    for (let j = 0; j < 3; j++) {
      const completedAt = new Date(now);
      completedAt.setDate(now.getDate() - j);
      plays.push({
        sessionId: session._id,
        playerId: students[2]._id,
        status: 'completed',
        score: 68 + j * 3,
        startedAt: new Date(completedAt.getTime() - 60000),
        completedAt,
        metrics: {
          totalAttempts: 10,
          correctAttempts: 7,
          errorAttempts: 3,
          timeoutAttempts: 0,
          averageResponseTime: 2200,
          completionTime: 60000
        },
        events: [
          { roundNumber: 1, cardUid: 'AAAA1111', eventType: 'correct', timeElapsed: 1800 },
          { roundNumber: 2, cardUid: 'BBBB2222', eventType: 'correct', timeElapsed: 2000 },
          { roundNumber: 3, cardUid: 'AAAA1111', eventType: 'error', timeElapsed: 2500 },
          { roundNumber: 4, cardUid: 'BBBB2222', eventType: 'correct', timeElapsed: 2200 },
          { roundNumber: 5, cardUid: 'AAAA1111', eventType: 'correct', timeElapsed: 2000 }
        ]
      });
    }

    // Student 3 (Sin Datos): NO plays

    // Student 4 (Top): 5 plays con scores altos
    for (let j = 0; j < 5; j++) {
      const completedAt = new Date(now);
      completedAt.setDate(now.getDate() - j * 2);
      plays.push({
        sessionId: session._id,
        playerId: students[4]._id,
        status: 'completed',
        score: 88 + j,
        startedAt: new Date(completedAt.getTime() - 80000),
        completedAt,
        metrics: {
          totalAttempts: 10,
          correctAttempts: 9,
          errorAttempts: 1,
          timeoutAttempts: 0,
          averageResponseTime: 1800,
          completionTime: 80000
        },
        events: [
          { roundNumber: 1, cardUid: 'AAAA1111', eventType: 'correct', timeElapsed: 1500 },
          { roundNumber: 2, cardUid: 'BBBB2222', eventType: 'correct', timeElapsed: 1700 },
          { roundNumber: 3, cardUid: 'AAAA1111', eventType: 'correct', timeElapsed: 1800 },
          { roundNumber: 4, cardUid: 'BBBB2222', eventType: 'correct', timeElapsed: 2000 },
          { roundNumber: 5, cardUid: 'AAAA1111', eventType: 'correct', timeElapsed: 1900 }
        ]
      });
    }

    // Student 4 (Top): 2 plays abandonadas
    plays.push({
      sessionId: session._id,
      playerId: students[4]._id,
      status: 'abandoned',
      score: 0,
      startedAt: new Date(now.getTime() - 86400000),
      metrics: {
        totalAttempts: 3,
        correctAttempts: 1,
        errorAttempts: 2,
        timeoutAttempts: 0,
        averageResponseTime: 5000,
        completionTime: 0
      },
      events: [
        { roundNumber: 1, cardUid: 'AAAA1111', eventType: 'correct', timeElapsed: 3000 },
        { roundNumber: 2, cardUid: 'BBBB2222', eventType: 'error', timeElapsed: 5000 },
        { roundNumber: 3, cardUid: 'AAAA1111', eventType: 'error', timeElapsed: 6000 }
      ]
    });
    plays.push({
      sessionId: session._id,
      playerId: students[4]._id,
      status: 'abandoned',
      score: 0,
      startedAt: new Date(now.getTime() - 172800000),
      metrics: {
        totalAttempts: 2,
        correctAttempts: 0,
        errorAttempts: 2,
        timeoutAttempts: 0,
        averageResponseTime: 6000,
        completionTime: 0
      },
      events: [
        { roundNumber: 1, cardUid: 'AAAA1111', eventType: 'error', timeElapsed: 5000 },
        { roundNumber: 2, cardUid: 'BBBB2222', eventType: 'error', timeElapsed: 7000 }
      ]
    });

    const inserted = await GamePlay.insertMany(plays);
    // Guardar ID de una partida completada (primera del student 0) para tests de rounds
    completedPlayId = inserted[0]._id.toString();
  });

  afterAll(async () => {
    if (session?._id) {
      await GamePlay.deleteMany({ sessionId: session._id });
    }
    if (session?._id) {
      await GameSession.findByIdAndDelete(session._id);
    }
    if (deck?._id) {
      await CardDeck.findByIdAndDelete(deck._id);
    }
    if (mechanic?._id) {
      await GameMechanic.findByIdAndDelete(mechanic._id);
    }
    if (context?._id) {
      await GameContext.findByIdAndDelete(context._id);
    }
    for (const s of students) {
      await User.findByIdAndDelete(s._id);
    }
    if (teacher?._id) {
      await User.findByIdAndDelete(teacher._id);
    }
    if (otherTeacher?._id) {
      await User.findByIdAndDelete(otherTeacher._id);
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // Trayectoria de aprendizaje (E01-E04)
  // ════════════════════════════════════════════════════════════════════

  describe('GET /api/analytics/student/:id/trajectory', () => {
    it('debe retornar trayectoria con dataPoints y trend', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/trajectory`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('dataPoints');
      expect(res.body.data).toHaveProperty('trend');
      expect(Array.isArray(res.body.data.dataPoints)).toBe(true);
      expect(res.body.data.trend).toHaveProperty('direction');
      expect(res.body.data.trend).toHaveProperty('slope');
      expect(res.body.data.trend).toHaveProperty('confidence');
    });

    it('debe retornar dataPoints vacio para estudiante sin partidas', async () => {
      const id = students[3]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/trajectory`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dataPoints).toHaveLength(0);
    });

    it('debe rechazar timeRange invalido', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/trajectory?timeRange=99d`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(400);
    });

    it('debe requerir autenticacion', async () => {
      const id = students[0]._id.toString();
      const res = await request(app).get(`/api/analytics/student/${id}/trajectory`);

      expect(res.statusCode).toBe(401);
    });

    it('debe rechazar acceso de otro profesor', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/trajectory`)
        .set(makeAuthHeaders(otherToken));

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/analytics/student/:id/velocity', () => {
    it('debe retornar velocidad de mejora con windows', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/velocity`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('windows');
      expect(res.body.data).toHaveProperty('overallVelocity');
      expect(res.body.data).toHaveProperty('accelerating');
      expect(Array.isArray(res.body.data.windows)).toBe(true);
    });

    it('debe requerir autenticacion', async () => {
      const id = students[0]._id.toString();
      const res = await request(app).get(`/api/analytics/student/${id}/velocity`);

      expect(res.statusCode).toBe(401);
    });

    it('debe rechazar acceso de otro profesor', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/velocity`)
        .set(makeAuthHeaders(otherToken));

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/analytics/student/:id/plateaus', () => {
    it('debe retornar plateaus y currentlyInPlateau', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/plateaus`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('plateaus');
      expect(res.body.data).toHaveProperty('currentlyInPlateau');
      expect(Array.isArray(res.body.data.plateaus)).toBe(true);
      expect(typeof res.body.data.currentlyInPlateau).toBe('boolean');
    });

    it('debe requerir autenticacion', async () => {
      const id = students[0]._id.toString();
      const res = await request(app).get(`/api/analytics/student/${id}/plateaus`);

      expect(res.statusCode).toBe(401);
    });

    it('debe rechazar acceso de otro profesor', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/plateaus`)
        .set(makeAuthHeaders(otherToken));

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/analytics/student/:id/evolution', () => {
    it('debe retornar evolucion por contexto por defecto', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/evolution`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('series');
      expect(res.body.data).toHaveProperty('groupBy');
      expect(res.body.data).toHaveProperty('timeRange');
      expect(Array.isArray(res.body.data.series)).toBe(true);
      expect(res.body.data.groupBy).toBe('context');
    });

    it('debe aceptar groupBy=mechanic', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/evolution?groupBy=mechanic`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.groupBy).toBe('mechanic');
    });

    it('debe requerir autenticacion', async () => {
      const id = students[0]._id.toString();
      const res = await request(app).get(`/api/analytics/student/${id}/evolution`);

      expect(res.statusCode).toBe(401);
    });

    it('debe rechazar acceso de otro profesor', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/evolution`)
        .set(makeAuthHeaders(otherToken));

      expect(res.statusCode).toBe(403);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Analisis de sesiones (E05-E08)
  // ════════════════════════════════════════════════════════════════════

  describe('GET /api/analytics/gameplay/:id/rounds', () => {
    it('debe retornar desglose de rondas con fatigueIndicator', async () => {
      const res = await request(app)
        .get(`/api/analytics/gameplay/${completedPlayId}/rounds`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('gameplayId');
      expect(res.body.data).toHaveProperty('totalRounds');
      expect(res.body.data).toHaveProperty('rounds');
      expect(res.body.data).toHaveProperty('fatigueIndicator');
      expect(Array.isArray(res.body.data.rounds)).toBe(true);
      expect(typeof res.body.data.totalRounds).toBe('number');
      expect(res.body.data.fatigueIndicator).toHaveProperty('detected');
    });

    it('debe retornar 404 para gameplay inexistente', async () => {
      const res = await request(app)
        .get('/api/analytics/gameplay/507f1f77bcf86cd799439011/rounds')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(404);
    });

    it('debe rechazar ID de formato invalido', async () => {
      const res = await request(app)
        .get('/api/analytics/gameplay/not-valid-id/rounds')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(400);
    });

    it('debe requerir autenticacion', async () => {
      const res = await request(app).get(`/api/analytics/gameplay/${completedPlayId}/rounds`);

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/analytics/classroom/card-analysis', () => {
    it('debe retornar analisis de tarjetas', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/card-analysis')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('cards');
      expect(res.body.data).toHaveProperty('timeRange');
      expect(Array.isArray(res.body.data.cards)).toBe(true);
    });

    it('debe requerir autenticacion', async () => {
      const res = await request(app).get('/api/analytics/classroom/card-analysis');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/analytics/student/:id/struggles', () => {
    it('debe retornar momentos de dificultad', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/struggles`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('moments');
      expect(res.body.data).toHaveProperty('totalStruggles');
      expect(res.body.data).toHaveProperty('avgStruggleLength');
      expect(Array.isArray(res.body.data.moments)).toBe(true);
      expect(typeof res.body.data.totalStruggles).toBe('number');
    });

    it('debe requerir autenticacion', async () => {
      const id = students[0]._id.toString();
      const res = await request(app).get(`/api/analytics/student/${id}/struggles`);

      expect(res.statusCode).toBe(401);
    });

    it('debe rechazar acceso de otro profesor', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/struggles`)
        .set(makeAuthHeaders(otherToken));

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/analytics/classroom/fatigue', () => {
    it('debe retornar indicadores de fatiga de la clase', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/fatigue')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data).toHaveProperty('byStudent');
      expect(res.body.data.summary).toHaveProperty('averageSlowdownPercent');
      expect(res.body.data.summary).toHaveProperty('studentsShowingFatigue');
      expect(res.body.data.summary).toHaveProperty('totalStudentsAnalyzed');
      expect(Array.isArray(res.body.data.byStudent)).toBe(true);
    });

    it('debe requerir autenticacion', async () => {
      const res = await request(app).get('/api/analytics/classroom/fatigue');

      expect(res.statusCode).toBe(401);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Engagement (E09-E11)
  // ════════════════════════════════════════════════════════════════════

  describe('GET /api/analytics/student/:id/engagement', () => {
    it('debe retornar engagement con score y componentes', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/engagement`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('engagementScore');
      expect(res.body.data).toHaveProperty('components');
      expect(res.body.data).toHaveProperty('abandonmentAnalysis');
      expect(typeof res.body.data.engagementScore).toBe('number');
      expect(res.body.data.components).toHaveProperty('playFrequency');
      expect(res.body.data.components).toHaveProperty('regularity');
      expect(res.body.data.components).toHaveProperty('completionRate');
    });

    it('debe retornar engagement basico para estudiante sin partidas', async () => {
      const id = students[3]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/engagement`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('engagementScore');
      expect(typeof res.body.data.engagementScore).toBe('number');
    });

    it('debe requerir autenticacion', async () => {
      const id = students[0]._id.toString();
      const res = await request(app).get(`/api/analytics/student/${id}/engagement`);

      expect(res.statusCode).toBe(401);
    });

    it('debe rechazar acceso de otro profesor', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/engagement`)
        .set(makeAuthHeaders(otherToken));

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/analytics/classroom/engagement', () => {
    it('debe retornar engagement agregado de la clase', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/engagement')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('classEngagementScore');
      expect(res.body.data).toHaveProperty('classCompletionRate');
      expect(res.body.data).toHaveProperty('students');
      expect(res.body.data).toHaveProperty('abandonmentRate');
      expect(Array.isArray(res.body.data.students)).toBe(true);
      expect(typeof res.body.data.classEngagementScore).toBe('number');
    });

    it('debe requerir autenticacion', async () => {
      const res = await request(app).get('/api/analytics/classroom/engagement');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/analytics/student/:id/play-patterns', () => {
    it('debe retornar patrones de juego', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/play-patterns`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalGames');
      expect(res.body.data).toHaveProperty('completedGames');
      expect(res.body.data).toHaveProperty('abandonedGames');
      expect(res.body.data).toHaveProperty('sessionsTimeline');
      expect(typeof res.body.data.totalGames).toBe('number');
      expect(Array.isArray(res.body.data.sessionsTimeline)).toBe(true);
    });

    it('debe requerir autenticacion', async () => {
      const id = students[0]._id.toString();
      const res = await request(app).get(`/api/analytics/student/${id}/play-patterns`);

      expect(res.statusCode).toBe(401);
    });

    it('debe rechazar acceso de otro profesor', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/play-patterns`)
        .set(makeAuthHeaders(otherToken));

      expect(res.statusCode).toBe(403);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Alertas inteligentes (E15-E16)
  // ════════════════════════════════════════════════════════════════════

  describe('GET /api/analytics/alerts', () => {
    it('debe retornar alertas como array con summary', async () => {
      const res = await request(app).get('/api/analytics/alerts').set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('alerts');
      expect(res.body.data).toHaveProperty('summary');
      expect(Array.isArray(res.body.data.alerts)).toBe(true);
      expect(res.body.data.summary).toHaveProperty('critical');
      expect(res.body.data.summary).toHaveProperty('warning');
      expect(res.body.data.summary).toHaveProperty('info');
      expect(res.body.data.summary).toHaveProperty('total');
    });

    it('debe filtrar por severity', async () => {
      const res = await request(app)
        .get('/api/analytics/alerts?severity=warning')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      // Todas las alertas retornadas deben ser de severidad warning
      for (const alert of res.body.data.alerts) {
        expect(alert.severity).toBe('warning');
      }
    });

    it('debe respetar el parametro limit', async () => {
      const res = await request(app)
        .get('/api/analytics/alerts?limit=2')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.alerts.length).toBeLessThanOrEqual(2);
    });

    it('debe requerir autenticacion', async () => {
      const res = await request(app).get('/api/analytics/alerts');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/analytics/alerts/summary', () => {
    it('debe retornar resumen con estructura correcta', async () => {
      const res = await request(app)
        .get('/api/analytics/alerts/summary')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('bySeverity');
      expect(res.body.data).toHaveProperty('byType');
      expect(res.body.data.bySeverity).toHaveProperty('critical');
      expect(res.body.data.bySeverity).toHaveProperty('warning');
      expect(res.body.data.bySeverity).toHaveProperty('info');
      expect(typeof res.body.data.total).toBe('number');
    });

    it('debe requerir autenticacion', async () => {
      const res = await request(app).get('/api/analytics/alerts/summary');

      expect(res.statusCode).toBe(401);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Reportes y exportacion (E17-E19)
  // ════════════════════════════════════════════════════════════════════

  describe('GET /api/analytics/reports/student/:id', () => {
    it('debe retornar reporte del estudiante en formato summary', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/reports/student/${id}`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('generatedAt');
      expect(res.body.data).toHaveProperty('student');
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data).toHaveProperty('trends');
      expect(res.body.data).toHaveProperty('engagement');
      expect(res.body.data.student).toHaveProperty('name');
      expect(res.body.data.student).toHaveProperty('id');
      expect(res.body.data.summary).toHaveProperty('tier');
      expect(res.body.data.summary).toHaveProperty('avgScore');
    });

    it('debe retornar reporte detallado con format=detailed', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/reports/student/${id}?format=detailed`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('details');
      expect(res.body.data.details).toHaveProperty('performanceByContext');
      expect(res.body.data.details).toHaveProperty('performanceByMechanic');
      expect(res.body.data.details).toHaveProperty('struggles');
    });

    it('debe requerir autenticacion', async () => {
      const id = students[0]._id.toString();
      const res = await request(app).get(`/api/analytics/reports/student/${id}`);

      expect(res.statusCode).toBe(401);
    });

    it('debe rechazar acceso de otro profesor', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/reports/student/${id}`)
        .set(makeAuthHeaders(otherToken));

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/analytics/reports/classroom', () => {
    it('debe retornar reporte de la clase', async () => {
      const res = await request(app)
        .get('/api/analytics/reports/classroom')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('generatedAt');
      expect(res.body.data).toHaveProperty('overview');
      expect(res.body.data).toHaveProperty('distribution');
      expect(res.body.data).toHaveProperty('trends');
      expect(res.body.data).toHaveProperty('topAlerts');
      expect(res.body.data).toHaveProperty('studentSummaries');
      expect(res.body.data.overview).toHaveProperty('totalStudents');
      expect(res.body.data.overview).toHaveProperty('avgScore');
      expect(Array.isArray(res.body.data.studentSummaries)).toBe(true);
    });

    it('debe requerir autenticacion', async () => {
      const res = await request(app).get('/api/analytics/reports/classroom');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/analytics/reports/classroom/export', () => {
    it('debe retornar datos tabulares con headers y rows', async () => {
      const res = await request(app)
        .get('/api/analytics/reports/classroom/export')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('headers');
      expect(res.body.data).toHaveProperty('rows');
      expect(res.body.data).toHaveProperty('generatedAt');
      expect(Array.isArray(res.body.data.headers)).toBe(true);
      expect(Array.isArray(res.body.data.rows)).toBe(true);
      expect(res.body.data.headers.length).toBeGreaterThan(0);
      // Cada fila debe tener la misma cantidad de columnas que headers
      if (res.body.data.rows.length > 0) {
        expect(res.body.data.rows[0].length).toBe(res.body.data.headers.length);
      }
    });

    it('debe requerir autenticacion', async () => {
      const res = await request(app).get('/api/analytics/reports/classroom/export');

      expect(res.statusCode).toBe(401);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Validacion de estructura detallada de respuestas
  // ════════════════════════════════════════════════════════════════════

  describe('Estructura detallada de respuestas', () => {
    it('trajectory: dataPoints deben tener period, avgScore, accuracy, gamesPlayed', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/trajectory`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.dataPoints.length).toBeGreaterThan(0);
      const point = res.body.data.dataPoints[0];
      expect(point).toHaveProperty('period');
      expect(point).toHaveProperty('avgScore');
      expect(point).toHaveProperty('accuracy');
      expect(point).toHaveProperty('gamesPlayed');
      expect(typeof point.avgScore).toBe('number');
      expect(typeof point.gamesPlayed).toBe('number');
    });

    it('trajectory: trend debe incluir rag e interpretation', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/trajectory`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      const trend = res.body.data.trend;
      expect(trend).toHaveProperty('rag');
      expect(trend).toHaveProperty('interpretation');
      expect(['improving', 'stable', 'declining']).toContain(trend.direction);
    });

    it('velocity: windows deben tener periodStart, periodEnd, avgScore, velocityChange', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/velocity`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      if (res.body.data.windows.length > 0) {
        const window = res.body.data.windows[0];
        expect(window).toHaveProperty('periodStart');
        expect(window).toHaveProperty('periodEnd');
        expect(window).toHaveProperty('avgScore');
        expect(window).toHaveProperty('velocityChange');
        expect(typeof window.avgScore).toBe('number');
      }
    });

    it('rounds: cada ronda debe tener roundNumber, result, responseTime', async () => {
      const res = await request(app)
        .get(`/api/analytics/gameplay/${completedPlayId}/rounds`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.rounds.length).toBeGreaterThan(0);
      const round = res.body.data.rounds[0];
      expect(round).toHaveProperty('roundNumber');
      expect(round).toHaveProperty('result');
      expect(round).toHaveProperty('responseTime');
      expect(round).toHaveProperty('events');
      expect(typeof round.roundNumber).toBe('number');
    });

    it('rounds: fatigueIndicator debe tener detected, avgTimeFirstHalf, avgTimeSecondHalf', async () => {
      const res = await request(app)
        .get(`/api/analytics/gameplay/${completedPlayId}/rounds`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      const fi = res.body.data.fatigueIndicator;
      expect(fi).toHaveProperty('detected');
      expect(fi).toHaveProperty('avgTimeFirstHalf');
      expect(fi).toHaveProperty('avgTimeSecondHalf');
      expect(fi).toHaveProperty('slowdownPercent');
      expect(typeof fi.detected).toBe('boolean');
    });

    it('engagement: components deben incluir playFrequency, regularity, completionRate', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/engagement`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      const comp = res.body.data.components;
      expect(comp).toHaveProperty('playFrequency');
      expect(comp).toHaveProperty('regularity');
      expect(comp).toHaveProperty('completionRate');
      expect(comp).toHaveProperty('avgTimeBetweenSessions');
      expect(comp).toHaveProperty('voluntaryReplays');

      // Cada componente debe tener value y score
      expect(comp.playFrequency).toHaveProperty('value');
      expect(comp.playFrequency).toHaveProperty('score');
      expect(typeof comp.playFrequency.score).toBe('number');
    });

    it('engagement: abandonmentAnalysis debe tener abandonedGames y abandonmentRate', async () => {
      const id = students[4]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/engagement`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      const ab = res.body.data.abandonmentAnalysis;
      expect(ab).toHaveProperty('abandonedGames');
      expect(ab).toHaveProperty('abandonmentRate');
      expect(typeof ab.abandonedGames).toBe('number');
      expect(typeof ab.abandonmentRate).toBe('number');
    });

    it('play-patterns: debe incluir daysSinceLastPlay y favoriteHour', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${id}/play-patterns`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('daysSinceLastPlay');
      expect(res.body.data).toHaveProperty('favoriteHour');
      expect(res.body.data).toHaveProperty('favoriteDayOfWeek');
    });

    it('alerts: cada alerta debe tener id, type, severity, message', async () => {
      const res = await request(app).get('/api/analytics/alerts').set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      if (res.body.data.alerts.length > 0) {
        const alert = res.body.data.alerts[0];
        expect(alert).toHaveProperty('id');
        expect(alert).toHaveProperty('type');
        expect(alert).toHaveProperty('severity');
        expect(alert).toHaveProperty('message');
        expect(alert).toHaveProperty('recommendation');
        expect(alert).toHaveProperty('detectedAt');
        expect(['critical', 'warning', 'info']).toContain(alert.severity);
      }
    });

    it('classroom engagement: cada estudiante debe tener engagementScore y completionRate', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/engagement')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      if (res.body.data.students.length > 0) {
        const s = res.body.data.students[0];
        expect(s).toHaveProperty('studentId');
        expect(s).toHaveProperty('name');
        expect(s).toHaveProperty('engagementScore');
        expect(s).toHaveProperty('completionRate');
        expect(s).toHaveProperty('gamesPlayed');
        expect(typeof s.engagementScore).toBe('number');
      }
    });

    it('export: headers deben estar en espanol', async () => {
      const res = await request(app)
        .get('/api/analytics/reports/classroom/export')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.headers).toContain('Nombre');
      expect(res.body.data.headers).toContain('Aula');
      expect(res.body.data.headers).toContain('Nivel');
    });

    it('student report: summary debe incluir tier, avgScore con rag', async () => {
      const id = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/reports/student/${id}`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      const summary = res.body.data.summary;
      expect(summary).toHaveProperty('tier');
      expect(summary).toHaveProperty('avgScore');
      expect(summary).toHaveProperty('accuracy');
      expect(summary).toHaveProperty('engagementScore');
      expect(summary).toHaveProperty('totalGames');
      expect(summary.avgScore).toHaveProperty('value');
      expect(summary.avgScore).toHaveProperty('rag');
      expect(summary.avgScore.rag).toHaveProperty('status');
    });

    it('classroom report: overview debe tener totalStudents y avgScore', async () => {
      const res = await request(app)
        .get('/api/analytics/reports/classroom')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      const overview = res.body.data.overview;
      expect(overview).toHaveProperty('totalStudents');
      expect(overview).toHaveProperty('totalGames');
      expect(overview).toHaveProperty('avgScore');
      expect(overview).toHaveProperty('classEngagementScore');
      expect(typeof overview.totalStudents).toBe('number');
      expect(typeof overview.avgScore).toBe('number');
    });
  });
});
