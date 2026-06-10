/**
 * @fileoverview Tests de integración para los nuevos endpoints de analytics (T-601).
 * Verifica los 6 endpoints: students, distribution, trends, summary, heatmap, rankings.
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

describe('Analytics Endpoints (T-601)', () => {
  let token;
  let teacher;
  const students = [];
  let context;
  let mechanic;
  let deck;
  let session;

  beforeAll(async () => {
    // Crear profesor
    teacher = await User.create({
      name: 'Prof Analytics',
      email: 'prof-analytics-t601@test.com',
      password: 'Test1234!',
      role: 'teacher',
      accountStatus: 'approved'
    });

    token = await loginUser({
      email: 'prof-analytics-t601@test.com',
      password: 'Test1234!'
    });

    // Crear contexto y mecánica
    context = await GameContext.create({
      contextId: 'analytics-test-ctx',
      name: 'Contexto Analytics Test',
      description: 'Test context for analytics',
      createdBy: teacher._id,
      assets: [
        { key: 'a1', value: 'val1', display: 'Display 1' },
        { key: 'a2', value: 'val2', display: 'Display 2' }
      ]
    });

    mechanic = await GameMechanic.create({
      name: 'analytics-test-mechanic',
      displayName: 'Analytics Test Mech',
      description: 'Test mechanic'
    });

    // Crear deck
    deck = await CardDeck.create({
      name: 'Analytics Test Deck',
      contextId: context._id,
      createdBy: teacher._id,
      cardMappings: [
        { uid: 'AAAA1111', assignedValue: 'val1', displayData: { label: 'Display 1' } },
        { uid: 'BBBB2222', assignedValue: 'val2', displayData: { label: 'Display 2' } }
      ]
    });

    // Crear estudiantes con diferentes niveles
    const studentData = [
      { name: 'Alumno Riesgo', avgScore: 30, correct: 3, errors: 7, classroom: 'A1' },
      { name: 'Alumno Promedio', avgScore: 55, correct: 6, errors: 4, classroom: 'A1' },
      { name: 'Alumno Bueno', avgScore: 75, correct: 8, errors: 2, classroom: 'A2' },
      { name: 'Alumno Excelente', avgScore: 95, correct: 9, errors: 1, classroom: 'A2' },
      { name: 'Alumno Nuevo', avgScore: 0, correct: 0, errors: 0, classroom: 'A1' }
    ];

    for (const s of studentData) {
      const student = await User.create({
        name: s.name,
        role: 'student',
        createdBy: teacher._id,
        status: 'active',
        profile: { classroom: s.classroom },
        consent: {
          granted: true,
          grantedBy: 'Tutor Test',
          grantedAt: new Date(),
          purposes: ['educational_tracking', 'performance_analytics'],
          policyVersion: '1.0'
        },
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

    // Crear sesión
    session = await GameSession.create({
      name: 'Sesión Analytics Test',
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

    // Crear partidas completadas para varios estudiantes
    const now = new Date();
    const plays = [];
    for (let i = 0; i < 3; i++) {
      const student = students[i]; // Riesgo, Promedio, Bueno
      for (let j = 0; j < 3; j++) {
        const completedAt = new Date(now);
        completedAt.setDate(now.getDate() - j);
        plays.push({
          sessionId: session._id,
          playerId: student._id,
          status: 'completed',
          score: student.studentMetrics.averageScore + j * 2,
          completedAt,
          metrics: {
            totalAttempts: 10,
            correctAttempts: student.studentMetrics.totalCorrectAnswers,
            errorAttempts: student.studentMetrics.totalErrors,
            timeoutAttempts: 0,
            averageResponseTime: 2500,
            completionTime: 120
          }
        });
      }
    }
    await GamePlay.insertMany(plays);
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
  });

  describe('GET /api/analytics/classroom/students', () => {
    it('debe retornar lista de estudiantes con métricas', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/students')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      // La respuesta ahora es { students: [...], total: N } (k-anonimidad fix)
      expect(res.body.data.students).toBeDefined();
      expect(res.body.data.students.length).toBe(5);

      const first = res.body.data.students[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('tier');
      expect(first).toHaveProperty('accuracyRate');
      expect(first).toHaveProperty('studentMetrics');
    });

    it('debe filtrar por tier=risk', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/students?tier=risk')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      // Alumno Riesgo (30) y Alumno Nuevo (0) están en riesgo — <5 activa k-anonimidad
      const payload = res.body.data;
      // Con tier=risk solo 2 alumnos → k-anonimidad se activa (< 5)
      if (payload.aggregatedOnly) {
        expect(payload.total).toBe(2);
      } else {
        expect(payload.students.length).toBe(2);
        payload.students.forEach(s => expect(s.tier).toBe('risk'));
      }
    });

    it('debe filtrar por classroom', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/students?classroom=A2')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      // classroom=A2 tiene 2 alumnos → k-anonimidad se activa
      const payload = res.body.data;
      if (payload.aggregatedOnly) {
        expect(payload.total).toBe(2);
      } else {
        expect(payload.students.length).toBe(2);
      }
    });

    it('debe ordenar por score desc', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/students?sort=score&order=desc')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      const scores = res.body.data.students.map(s => s.studentMetrics.averageScore);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    });

    it('debe requerir autenticación', async () => {
      const res = await request(app).get('/api/analytics/classroom/students');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/analytics/classroom/distribution', () => {
    it('debe retornar distribución en 4 rangos', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/distribution')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.distribution).toHaveLength(4);
      expect(res.body.data.totalStudents).toBe(5);

      const tiers = res.body.data.distribution.map(d => d.tier);
      expect(tiers).toEqual(['risk', 'average', 'good', 'excellent']);

      // Verificar que los porcentajes suman ~100
      const totalPct = res.body.data.distribution.reduce((sum, d) => sum + d.count, 0);
      expect(totalPct).toBe(5);
    });
  });

  describe('GET /api/analytics/classroom/trends', () => {
    it('debe retornar KPIs con cambio porcentual', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/trends?timeRange=7d')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.kpis).toBeDefined();
      expect(Array.isArray(res.body.data.kpis)).toBe(true);
      expect(res.body.data.timeRange).toBe('7d');

      const kpiNames = res.body.data.kpis.map(k => k.name);
      expect(kpiNames).toContain('averageScore');
      expect(kpiNames).toContain('totalGames');
      expect(kpiNames).toContain('averageAccuracy');
    });
  });

  describe('GET /api/analytics/classroom/comparison', () => {
    it('debe retornar la serie temporal de comparación', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/comparison?timeRange=7d')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('debe aceptar timeRange=90d (cohorte "Trimestre actual" del Dashboard)', async () => {
      // QA 2026-05-30: antes 90d se trataba como 7d (rangeDays inline) → 8 puntos.
      // El fix rellena el rango completo: 90d → 91 puntos (i = 90..0 inclusive).
      const res = await request(app)
        .get('/api/analytics/classroom/comparison?timeRange=90d')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(91);
    });

    it('debe aceptar el filtro de contexto (la tendencia responde al filtro)', async () => {
      const res = await request(app)
        .get(`/api/analytics/classroom/comparison?timeRange=30d&contextId=${context._id}`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/analytics/student/:id/summary', () => {
    it('debe retornar resumen completo del estudiante', async () => {
      const studentId = students[0]._id.toString();

      const res = await request(app)
        .get(`/api/analytics/student/${studentId}/summary`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.student).toHaveProperty('name');
      expect(data).toHaveProperty('lastGames');
      expect(data).toHaveProperty('performanceByContext');
      expect(data).toHaveProperty('performanceByMechanic');
      expect(data).toHaveProperty('classComparison');
      expect(data.classComparison).toHaveProperty('studentAvgScore');
      expect(data.classComparison).toHaveProperty('classAvgScore');
    });

    it('debe aceptar timeRange=90d en el resumen del alumno', async () => {
      // QA 2026-05-30: el selector del perfil ofrece 90d pero el schema solo
      // aceptaba 7d/30d → 400. `getDateRange` ya soportaba 90d.
      const studentId = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${studentId}/summary?timeRange=90d`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('debe rechazar acceso a estudiante de otro profesor', async () => {
      // Crear otro profesor con un estudiante
      const teacher2 = await User.create({
        name: 'Prof Otro',
        email: 'prof-otro-t601@test.com',
        password: 'Test1234!',
        role: 'teacher',
        accountStatus: 'approved'
      });
      const token2 = await loginUser({
        email: 'prof-otro-t601@test.com',
        password: 'Test1234!'
      });

      const studentId = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${studentId}/summary`)
        .set(makeAuthHeaders(token2));

      expect(res.statusCode).toBe(403);

      await User.findByIdAndDelete(teacher2._id);
    });

    it('debe retornar 404 para estudiante inexistente', async () => {
      const res = await request(app)
        .get('/api/analytics/student/507f1f77bcf86cd799439011/summary')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/analytics/classroom/heatmap', () => {
    it('debe retornar datos de heatmap', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/heatmap')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('heatmap');
      expect(Array.isArray(res.body.data.heatmap)).toBe(true);

      if (res.body.data.heatmap.length > 0) {
        const entry = res.body.data.heatmap[0];
        expect(entry).toHaveProperty('dayOfWeek');
        expect(entry).toHaveProperty('hour');
        expect(entry).toHaveProperty('count');
      }
    });

    it('debe aceptar timeRange=90d ("Trimestre actual")', async () => {
      // QA 2026-05-30: el schema solo aceptaba 7d/30d → 90d daba 400 y
      // "Actividad Semanal" quedaba vacía.
      const res = await request(app)
        .get('/api/analytics/classroom/heatmap?timeRange=90d')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('heatmap');
    });
  });

  describe('GET /api/analytics/classroom/rankings', () => {
    it('debe retornar top contextos y mecánicas', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/rankings')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('topContexts');
      expect(res.body.data).toHaveProperty('topMechanics');
      expect(Array.isArray(res.body.data.topContexts)).toBe(true);
      expect(Array.isArray(res.body.data.topMechanics)).toBe(true);
    });

    it('debe respetar el parámetro limit', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/rankings?limit=1')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.topContexts.length).toBeLessThanOrEqual(1);
      expect(res.body.data.topMechanics.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Validación Zod', () => {
    it('debe rechazar sort inválido en classroom/students', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/students?sort=invalid')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(400);
    });

    it('debe rechazar tier inválido', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/students?tier=invalid')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(400);
    });

    it('debe rechazar ID inválido en student summary', async () => {
      const res = await request(app)
        .get('/api/analytics/student/not-an-objectid/summary')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(400);
    });

    it('debe rechazar timeRange inválido en trends', async () => {
      // '90d' es válido (cohorte "Trimestre actual" del Dashboard); usamos un
      // valor genuinamente fuera del enum para verificar el rechazo Zod.
      const res = await request(app)
        .get('/api/analytics/classroom/trends?timeRange=invalid')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(400);
    });

    it('debe rechazar limit fuera de rango en rankings', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/rankings?limit=100')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(400);
    });

    it('debe rechazar parámetros extra no permitidos (strict)', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/students?unknownParam=value')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Estructura detallada de respuestas', () => {
    it('students: cada estudiante debe tener la estructura completa', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/students')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      const student = res.body.data.students[0];

      // Campos de primer nivel
      expect(student).toHaveProperty('id');
      expect(student).toHaveProperty('name');
      expect(student).toHaveProperty('avatar');
      expect(student).toHaveProperty('classroom');
      expect(student).toHaveProperty('status');
      expect(student).toHaveProperty('tier');
      expect(student).toHaveProperty('accuracyRate');

      // studentMetrics completo
      expect(student.studentMetrics).toHaveProperty('totalGamesPlayed');
      expect(student.studentMetrics).toHaveProperty('averageScore');
      expect(student.studentMetrics).toHaveProperty('bestScore');
      expect(student.studentMetrics).toHaveProperty('totalCorrectAnswers');
      expect(student.studentMetrics).toHaveProperty('totalErrors');
      expect(student.studentMetrics).toHaveProperty('averageResponseTime');

      // tier debe ser uno de los 4 válidos
      expect(['risk', 'average', 'good', 'excellent']).toContain(student.tier);

      // accuracyRate debe ser numérico y entre 0-100
      expect(typeof student.accuracyRate).toBe('number');
      expect(student.accuracyRate).toBeGreaterThanOrEqual(0);
      expect(student.accuracyRate).toBeLessThanOrEqual(100);
    });

    it('distribution: los porcentajes deben sumar 100', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/distribution')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      const totalPct = res.body.data.distribution.reduce((sum, d) => sum + d.percentage, 0);
      expect(totalPct).toBeCloseTo(100, 0);
    });

    it('distribution: cada rango debe tener range, tier, label, count, percentage', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/distribution')
        .set(makeAuthHeaders(token));

      for (const range of res.body.data.distribution) {
        expect(range).toHaveProperty('range');
        expect(range).toHaveProperty('tier');
        expect(range).toHaveProperty('label');
        expect(range).toHaveProperty('count');
        expect(range).toHaveProperty('percentage');
        expect(typeof range.count).toBe('number');
        expect(typeof range.percentage).toBe('number');
      }
    });

    it('trends: debe tener exactamente 6 KPIs', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/trends')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.kpis).toHaveLength(6);

      const expectedKPIs = [
        'studentsInRisk',
        'averageScore',
        'gamesToday',
        'totalGames',
        'averageAccuracy',
        'averageResponseTime'
      ];
      const actualKPIs = res.body.data.kpis.map(k => k.name);
      expect(actualKPIs).toEqual(expectedKPIs);
    });

    it('trends: cada KPI debe tener current, change, changePercent', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/trends')
        .set(makeAuthHeaders(token));

      for (const kpi of res.body.data.kpis) {
        expect(kpi).toHaveProperty('name');
        expect(kpi).toHaveProperty('label');
        expect(kpi).toHaveProperty('current');
        expect(kpi).toHaveProperty('change');
        expect(kpi).toHaveProperty('changePercent');
      }
    });

    it('student summary: lastGames debe estar limitado a 10', async () => {
      const studentId = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${studentId}/summary`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.lastGames.length).toBeLessThanOrEqual(10);

      if (res.body.data.lastGames.length > 0) {
        const game = res.body.data.lastGames[0];
        expect(game).toHaveProperty('score');
        expect(game).toHaveProperty('completedAt');
        expect(game).toHaveProperty('accuracy');
        expect(game).toHaveProperty('context');
        expect(game).toHaveProperty('mechanic');
      }
    });

    it('student games: pagina el historial completo con el mismo shape que lastGames', async () => {
      const studentId = students[0]._id.toString(); // 3 partidas completadas
      const res = await request(app)
        .get(`/api/analytics/student/${studentId}/games?page=1&limit=2`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data.games)).toBe(true);
      expect(res.body.data.games.length).toBe(2);
      expect(res.body.data.pagination).toMatchObject({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2
      });

      const game = res.body.data.games[0];
      expect(game).toHaveProperty('score');
      expect(game).toHaveProperty('completedAt');
      expect(game).toHaveProperty('accuracy');
      expect(game).toHaveProperty('context');
      expect(game).toHaveProperty('mechanic');
    });

    it('student games: la segunda página devuelve el resto (acceso al historial completo)', async () => {
      const studentId = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${studentId}/games?page=2&limit=2`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.games.length).toBe(1);
      expect(res.body.data.pagination.page).toBe(2);
    });

    it('student games: orden descendente por completedAt', async () => {
      const studentId = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${studentId}/games?limit=50`)
        .set(makeAuthHeaders(token));

      const times = res.body.data.games.map(g => new Date(g.completedAt).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('student games: alumno sin partidas → lista vacía y total 0', async () => {
      const studentId = students[4]._id.toString(); // Alumno Nuevo, 0 partidas
      const res = await request(app)
        .get(`/api/analytics/student/${studentId}/games`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.games).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
      expect(res.body.data.pagination.totalPages).toBe(1);
    });

    it('student games: limit fuera de rango (>50) es rechazado por validación', async () => {
      const studentId = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${studentId}/games?limit=999`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(400);
    });

    it('student summary: classComparison incluye la diferencia', async () => {
      const studentId = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${studentId}/summary`)
        .set(makeAuthHeaders(token));

      const comparison = res.body.data.classComparison;
      expect(comparison).toHaveProperty('difference');
      expect(typeof comparison.difference).toBe('number');
      // difference = studentAvgScore - classAvgScore
      expect(comparison.difference).toBeCloseTo(
        comparison.studentAvgScore - comparison.classAvgScore,
        0
      );
    });

    it('heatmap: entries deben tener dayOfWeek 0-6 y hour 0-23', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/heatmap')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      for (const entry of res.body.data.heatmap) {
        expect(entry.dayOfWeek).toBeGreaterThanOrEqual(0);
        expect(entry.dayOfWeek).toBeLessThanOrEqual(6);
        expect(entry.hour).toBeGreaterThanOrEqual(0);
        expect(entry.hour).toBeLessThanOrEqual(23);
        expect(entry.count).toBeGreaterThan(0);
      }
    });

    it('rankings: topContexts debe tener name, totalPlays, avgScore', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/rankings')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      if (res.body.data.topContexts.length > 0) {
        const ctx = res.body.data.topContexts[0];
        expect(ctx).toHaveProperty('name');
        expect(ctx).toHaveProperty('totalPlays');
        expect(ctx).toHaveProperty('avgScore');
        expect(ctx).toHaveProperty('uniquePlayers');
      }
    });
  });

  describe('Filtros y ordenamiento avanzado', () => {
    it('students: sort=accuracy order=desc debe ordenar por accuracyRate descendente', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/students?sort=accuracy&order=desc')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      const rates = res.body.data.students.map(s => s.accuracyRate);
      for (let i = 1; i < rates.length; i++) {
        expect(rates[i - 1]).toBeGreaterThanOrEqual(rates[i]);
      }
    });

    it('students: tier=excellent debe retornar solo estudiantes excelentes', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/students?tier=excellent')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      // Solo Alumno Excelente (95) — 1 alumno → k-anonimidad se activa
      const payload = res.body.data;
      if (payload.aggregatedOnly) {
        expect(payload.total).toBe(1);
      } else {
        expect(payload.students.length).toBe(1);
        expect(payload.students[0].studentMetrics.averageScore).toBeGreaterThanOrEqual(90);
      }
    });

    it('trends: timeRange=30d debe funcionar', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/trends?timeRange=30d')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.timeRange).toBe('30d');
    });

    it('student summary: timeRange=7d debe funcionar', async () => {
      const studentId = students[0]._id.toString();
      const res = await request(app)
        .get(`/api/analytics/student/${studentId}/summary?timeRange=7d`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.timeRange).toBe('7d');
    });

    it('heatmap: timeRange=7d debe funcionar', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/heatmap?timeRange=7d')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.data.timeRange).toBe('7d');
    });
  });

  // T-942 Fase E: filtros opcionales de contexto/mecanica en summary y
  // distribution. La vista por defecto agrega el aula completa; con filtro
  // activo los KPIs se recalculan desde las partidas que casan con esa sesion.
  // Estos tests verifican que el filtro se acepta, estrecha el dataset y
  // rechaza un ObjectId invalido.
  describe('Filtros por contexto/mecanica (summary + distribution)', () => {
    // ObjectId valido en formato pero que no corresponde a ninguna sesion del
    // profesor — sirve para comprobar que el filtro EXCLUYE lo que no casa.
    const NON_MATCHING_OID = '507f1f77bcf86cd799439099';

    it('distribution: el filtro por mechanicId estrecha el total de alumnos', async () => {
      // Sin filtro: la distribucion cuenta los 5 alumnos activos (lifetime).
      const unfiltered = await request(app)
        .get('/api/analytics/classroom/distribution')
        .set(makeAuthHeaders(token));
      expect(unfiltered.statusCode).toBe(200);
      expect(unfiltered.body.data.totalStudents).toBe(5);

      // Con la mecanica sembrada: solo los alumnos con partidas completadas en
      // esa sesion (Riesgo, Promedio, Bueno = 3). El dataset se estrecha.
      const filtered = await request(app)
        .get(`/api/analytics/classroom/distribution?mechanicId=${mechanic._id}`)
        .set(makeAuthHeaders(token));
      expect(filtered.statusCode).toBe(200);
      expect(filtered.body.data.distribution).toHaveLength(4);
      expect(filtered.body.data.totalStudents).toBe(3);
      expect(filtered.body.data.totalStudents).toBeLessThan(unfiltered.body.data.totalStudents);
    });

    it('distribution: acepta contextId con la forma esperada', async () => {
      const res = await request(app)
        .get(`/api/analytics/classroom/distribution?contextId=${context._id}`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.distribution).toHaveLength(4);
      const tiers = res.body.data.distribution.map(d => d.tier);
      expect(tiers).toEqual(['risk', 'average', 'good', 'excellent']);
      // El contexto sembrado tiene las 3 partidas → 3 alumnos.
      expect(res.body.data.totalStudents).toBe(3);
    });

    it('summary: el filtro por mechanicId que no casa devuelve datos distintos', async () => {
      // Sin filtro: hay partidas sembradas → totalGames > 0.
      const unfiltered = await request(app)
        .get('/api/analytics/classroom/summary')
        .set(makeAuthHeaders(token));
      expect(unfiltered.statusCode).toBe(200);
      expect(unfiltered.body.data.totalGames).toBeGreaterThan(0);

      // Con una mecanica que no corresponde a ninguna sesion: 0 partidas.
      const filtered = await request(app)
        .get(`/api/analytics/classroom/summary?mechanicId=${NON_MATCHING_OID}`)
        .set(makeAuthHeaders(token));
      expect(filtered.statusCode).toBe(200);
      expect(filtered.body.data).toHaveProperty('studentsInRisk');
      expect(filtered.body.data).toHaveProperty('averageScore');
      expect(filtered.body.data).toHaveProperty('totalGames');
      expect(filtered.body.data.totalGames).toBe(0);
      expect(filtered.body.data.totalGames).not.toBe(unfiltered.body.data.totalGames);
    });

    it('summary: acepta contextId con la forma esperada', async () => {
      const res = await request(app)
        .get(`/api/analytics/classroom/summary?contextId=${context._id}`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('studentsInRisk');
      expect(res.body.data).toHaveProperty('averageScore');
      expect(res.body.data).toHaveProperty('totalGames');
      expect(res.body.data).toHaveProperty('gamesToday');
    });

    it('summary: rechaza un mechanicId que no es ObjectId (400)', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/summary?mechanicId=not-an-objectid')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(400);
    });

    it('distribution: rechaza un contextId que no es ObjectId (400)', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/distribution?contextId=not-an-objectid')
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(400);
    });

    it('students: el filtro por mechanicId responde 200 (regresion 500) y filtra', async () => {
      // Regresion: el filtro por contexto/mecanica en el controlador usaba
      // `s._id` cuando el DTO de estudiante expone `s.id` → undefined.toString()
      // → 500. Solo se ejercitaba cuando el frontend enviaba un filtro valido
      // (antes nunca lo hacia por el bug de `value` en las opciones del Dashboard).
      const res = await request(app)
        .get(`/api/analytics/classroom/students?sort=score&order=desc&mechanicId=${mechanic._id}`)
        .set(makeAuthHeaders(token));

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      // 3 alumnos jugaron en la mecanica sembrada → por debajo del umbral
      // k-anonimidad → respuesta agregada. Lo relevante: NO es 500.
      const payload = res.body.data;
      if (payload.aggregatedOnly) {
        expect(payload.total).toBe(3);
      } else {
        expect(payload.students.length).toBe(3);
      }
    });
  });
});
