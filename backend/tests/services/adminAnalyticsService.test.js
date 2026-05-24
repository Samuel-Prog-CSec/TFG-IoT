/**
 * @fileoverview Tests del servicio adminAnalyticsService (T-942 Fase B).
 *
 * Verifica el shape del agregado del centro y que las agregaciones top-N
 * respeten el orden esperado. Usa MongoDB real (setup compartido) — los
 * documentos creados se limpian en `beforeEach`.
 */

const mongoose = require('mongoose');

require('../../src/server'); // asegura que los modelos estén registrados

const adminAnalyticsService = require('../../src/services/adminAnalyticsService');
const User = require('../../src/models/User');
const GameMechanic = require('../../src/models/GameMechanic');
const GameContext = require('../../src/models/GameContext');
const GameSession = require('../../src/models/GameSession');
const GamePlay = require('../../src/models/GamePlay');
const SmartAlert = require('../../src/models/SmartAlert');
const CardDeck = require('../../src/models/CardDeck');

const { pseudonymize } = require('../../src/utils/pseudonymize');

/**
 * Helper para crear un teacher.
 * @param {object} overrides
 */
const createTeacher = (overrides = {}) =>
  User.create({
    name: 'Teacher Test',
    email: `teacher-${new mongoose.Types.ObjectId().toString()}@test.com`,
    password: 'Password123',
    role: 'teacher',
    accountStatus: 'approved',
    status: 'active',
    ...overrides
  });

/**
 * Helper para crear un alumno asociado a un docente.
 */
const createStudent = teacherId =>
  User.create({
    name: `Student ${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    role: 'student',
    createdBy: teacherId,
    profile: { age: 5 },
    consent: {
      granted: true,
      grantedBy: 'Tutor',
      grantedAt: new Date(),
      purposes: ['educational_tracking', 'performance_analytics']
    }
  });

/**
 * Helper para construir una sesión + N gameplays completados.
 *
 * @param {object} args
 * @param {string} args.teacherId
 * @param {string} args.mechanicId
 * @param {string} args.contextId
 * @param {string} args.deckId
 * @param {Array<{ studentId: string, score: number, completedAt?: Date }>} args.plays
 * @returns {Promise<{ session: object, plays: Array }>}
 */
const seedPlays = async ({ teacherId, mechanicId, contextId, deckId, plays }) => {
  const session = await GameSession.create({
    name: `S-${new mongoose.Types.ObjectId().toString().slice(-5)}`,
    mechanicId,
    contextId,
    deckId,
    createdBy: teacherId,
    difficulty: 'medium',
    status: 'active',
    config: {
      numberOfCards: 2,
      numberOfRounds: 2,
      timeLimit: 15,
      pointsPerCorrect: 10,
      penaltyPerError: -2
    },
    cardMappings: [
      { uid: 'AA111101', assignedValue: 'España' },
      { uid: 'AA111102', assignedValue: 'Francia' }
    ]
  });

  const persisted = [];
  for (const p of plays) {
    const completedAt = p.completedAt || new Date();
    const gp = await GamePlay.create({
      sessionId: session._id,
      playerId: p.studentId,
      status: 'completed',
      score: p.score,
      maxScore: 100,
      startedAt: new Date(completedAt.getTime() - 60_000),
      completedAt,
      metrics: {
        totalAttempts: 10,
        correctAttempts: Math.round(p.score / 10),
        errorAttempts: 0,
        timeoutAttempts: 0,
        completionTime: 60_000,
        averageResponseTime: 3000
      }
    });
    persisted.push(gp);
  }

  return { session, plays: persisted };
};

const cleanupAll = () =>
  Promise.all([
    User.deleteMany({}),
    GameMechanic.deleteMany({}),
    GameContext.deleteMany({}),
    GameSession.deleteMany({}),
    GamePlay.deleteMany({}),
    SmartAlert.deleteMany({}),
    CardDeck.deleteMany({})
  ]);

describe('adminAnalyticsService.getCenterOverview', () => {
  let teacherA;
  let teacherB;
  let mechanic;
  let context;
  let deck;

  beforeEach(async () => {
    await cleanupAll();

    [teacherA, teacherB] = await Promise.all([
      createTeacher({ name: 'María García', email: 'maria-admin@test.com' }),
      createTeacher({ name: 'Carlos Ruiz', email: 'carlos-admin@test.com' })
    ]);

    mechanic = await GameMechanic.create({
      name: 'association-admin',
      displayName: 'Asociación',
      description: 'Mecánica para tests admin',
      icon: '🔗',
      rules: {
        defaults: { numberOfCards: 5, numberOfRounds: 5, timeLimit: 15 },
        limits: { minCards: 2, maxCards: 20, minRounds: 1, maxRounds: 20 },
        behavior: { challengeMode: 'single_prompt_single_scan' }
      },
      isActive: true
    });

    context = await GameContext.create({
      contextId: `ctx-admin-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
      name: 'Geografía',
      assets: [
        { key: 'spain', value: 'España', display: '🇪🇸' },
        { key: 'france', value: 'Francia', display: '🇫🇷' }
      ]
    });

    deck = await CardDeck.create({
      name: 'Mazo Test Admin',
      description: 'Mazo seed para overview',
      contextId: context._id,
      createdBy: teacherA._id,
      cardMappings: [
        { uid: 'AA111101', assignedValue: 'España' },
        { uid: 'AA111102', assignedValue: 'Francia' }
      ]
    });
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('devuelve un agregado con la forma esperada y el timeRange aplicado', async () => {
    const studentA = await createStudent(teacherA._id);
    await seedPlays({
      teacherId: teacherA._id,
      mechanicId: mechanic._id,
      contextId: context._id,
      deckId: deck._id,
      plays: [{ studentId: studentA._id, score: 80 }]
    });

    const overview = await adminAnalyticsService.getCenterOverview({ timeRange: '30d' });

    expect(overview).toMatchObject({
      timeRange: '30d',
      users: expect.objectContaining({
        totalStudents: expect.any(Number),
        totalTeachers: expect.any(Number),
        activeTeachers: expect.any(Number),
        pendingTeachers: expect.any(Number)
      }),
      activity: expect.objectContaining({
        totalPlaysInRange: expect.any(Number),
        avgScoreInRange: expect.any(Number),
        playsToday: expect.any(Number),
        playsByMechanic: expect.any(Array)
      }),
      content: expect.objectContaining({
        totalDecks: expect.any(Number),
        totalSessions: expect.any(Number),
        activeSessions: expect.any(Number),
        totalContexts: expect.any(Number),
        totalMechanics: expect.any(Number)
      }),
      alerts: expect.objectContaining({
        totalCriticalActive: expect.any(Number),
        totalWarningActive: expect.any(Number),
        totalInfoActive: expect.any(Number),
        byTeacher: expect.any(Array)
      }),
      topTeachers: expect.any(Array),
      topMechanics: expect.any(Array),
      topContexts: expect.any(Array)
    });
    expect(overview.generatedAt).toBeDefined();
    expect(overview.users.totalTeachers).toBeGreaterThanOrEqual(2);
    expect(overview.users.totalStudents).toBeGreaterThanOrEqual(1);
    expect(overview.activity.totalPlaysInRange).toBe(1);
    expect(overview.activity.avgScoreInRange).toBeCloseTo(80, 0);
  });

  it('ordena topTeachers por totalPlays desc y excede activeStudents únicos', async () => {
    const [s1A, s2A, s1B] = await Promise.all([
      createStudent(teacherA._id),
      createStudent(teacherA._id),
      createStudent(teacherB._id)
    ]);

    // teacherA: 4 partidas con 2 alumnos.
    await seedPlays({
      teacherId: teacherA._id,
      mechanicId: mechanic._id,
      contextId: context._id,
      deckId: deck._id,
      plays: [
        { studentId: s1A._id, score: 70 },
        { studentId: s1A._id, score: 80 },
        { studentId: s2A._id, score: 90 },
        { studentId: s2A._id, score: 60 }
      ]
    });

    // teacherB: 1 partida.
    await seedPlays({
      teacherId: teacherB._id,
      mechanicId: mechanic._id,
      contextId: context._id,
      deckId: deck._id,
      plays: [{ studentId: s1B._id, score: 95 }]
    });

    const overview = await adminAnalyticsService.getCenterOverview({ timeRange: '30d' });

    expect(overview.topTeachers).toHaveLength(2);
    expect(overview.topTeachers[0].teacherId).toBe(teacherA._id.toString());
    expect(overview.topTeachers[0].totalPlays).toBe(4);
    expect(overview.topTeachers[0].activeStudents).toBe(2);
    expect(overview.topTeachers[1].teacherId).toBe(teacherB._id.toString());
    expect(overview.topTeachers[1].totalPlays).toBe(1);
  });

  it('agrega alertas críticas/warning del centro por profesor y filtra resolved', async () => {
    const studentA = await createStudent(teacherA._id);
    const studentB = await createStudent(teacherB._id);

    const baseAlert = (teacherId, studentId, severity, extras = {}) => ({
      teacherId,
      studentId,
      type: 'sudden_score_drop',
      severity,
      status: 'active',
      detectedAt: new Date(),
      lastSeenAt: new Date(),
      description: 'Bajón repentino en puntuación',
      studentPseudoId: pseudonymize(String(studentId)),
      ...extras
    });

    // teacherA: 2 críticas (1 active + 1 resolved) y 1 warning active.
    await SmartAlert.create(baseAlert(teacherA._id, studentA._id, 'critical'));
    await SmartAlert.create({
      ...baseAlert(teacherA._id, studentA._id, 'critical', {
        type: 'engagement_drop',
        status: 'resolved',
        resolvedAt: new Date()
      })
    });
    await SmartAlert.create({
      ...baseAlert(teacherA._id, studentA._id, 'warning', { type: 'declining_performance' })
    });

    // teacherB: 1 warning active.
    await SmartAlert.create(baseAlert(teacherB._id, studentB._id, 'warning'));

    const overview = await adminAnalyticsService.getCenterOverview({ timeRange: '30d' });

    expect(overview.alerts.totalCriticalActive).toBe(1);
    expect(overview.alerts.totalWarningActive).toBe(2);
    expect(overview.alerts.byTeacher.length).toBeGreaterThanOrEqual(2);
    const teacherAEntry = overview.alerts.byTeacher.find(
      t => t.teacherId === teacherA._id.toString()
    );
    expect(teacherAEntry).toMatchObject({
      criticalCount: 1,
      warningCount: 1
    });
  });

  it('cuenta como profesores activos a los que tienen partidas completadas en el periodo', async () => {
    // teacherA tiene una partida hoy; teacherB no tiene partidas en el rango.
    const studentA = await createStudent(teacherA._id);
    await seedPlays({
      teacherId: teacherA._id,
      mechanicId: mechanic._id,
      contextId: context._id,
      deckId: deck._id,
      plays: [{ studentId: studentA._id, score: 80, completedAt: new Date() }]
    });

    const overview = await adminAnalyticsService.getCenterOverview({ timeRange: '7d' });
    expect(overview.users.activeTeachers).toBe(1);
    expect(overview.users.totalTeachers).toBe(2);
  });

  it('cuenta profesores pendientes (pending_approval) separados del total de aprobados', async () => {
    await createTeacher({
      name: 'Pendiente',
      email: 'pendiente-admin@test.com',
      accountStatus: 'pending_approval'
    });

    const overview = await adminAnalyticsService.getCenterOverview({ timeRange: '30d' });
    expect(overview.users.pendingTeachers).toBe(1);
    expect(overview.users.totalTeachers).toBe(2); // aprobados (no incluye pending)
  });
});
