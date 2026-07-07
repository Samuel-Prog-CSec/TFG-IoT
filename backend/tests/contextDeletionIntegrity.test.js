/**
 * @fileoverview Tests del borrado de contexto con archivado en cascada (ADR-231).
 *
 * Política: el historial educativo se conserva degradado (sesiones jugadas →
 * completed, mazos → archived, partidas intactas); los borradores sin historia
 * se eliminan; el único bloqueante es una partida in-progress/paused.
 */
const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const GameContext = require('../src/models/GameContext');
const CardDeck = require('../src/models/CardDeck');
const GameSession = require('../src/models/GameSession');
const GamePlay = require('../src/models/GamePlay');
const GameMechanic = require('../src/models/GameMechanic');
const {
  createTeacher,
  createTokenFor,
  createMechanic,
  createContext,
  createDeckFor,
  createSessionFor,
  fingerprintHeaders
} = require('./helpers/testFixtures');

const authHeaders = token => ({
  Authorization: `Bearer ${token}`,
  'User-Agent': fingerprintHeaders['user-agent'],
  'Accept-Language': fingerprintHeaders['accept-language'],
  'Accept-Encoding': fingerprintHeaders['accept-encoding']
});

describe('Context deletion — archivado en cascada (ADR-231)', () => {
  let teacher;
  let superAdminToken;
  let student;

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      CardDeck.deleteMany({}),
      GameContext.deleteMany({}),
      GameSession.deleteMany({}),
      GamePlay.deleteMany({}),
      GameMechanic.deleteMany({})
    ]);

    teacher = await createTeacher({ suffix: 'ctx-cascade' });

    const superAdmin = await createTeacher({
      suffix: 'ctx-cascade-admin',
      role: 'super_admin'
    });
    superAdminToken = await createTokenFor(superAdmin);

    student = await User.create({
      name: 'Student Cascade',
      role: 'student',
      createdBy: teacher._id,
      status: 'active',
      consent: {
        granted: true,
        grantedBy: 'Tutor Test',
        grantedAt: new Date(),
        purposes: ['educational_tracking', 'performance_analytics'],
        policyVersion: '1.0'
      }
    });
  });

  /**
   * Monta el grafo completo: contexto → mazo activo → sesión jugada (active,
   * 1 partida completada) + sesión borrador (created, sin partidas).
   */
  async function buildContextGraph() {
    const context = await createContext({ suffix: `cascade-${Date.now()}` });
    const mechanic = await createMechanic();
    const deck = await createDeckFor(teacher, context);
    const playedSession = await createSessionFor(teacher, deck, mechanic, context, {
      status: 'active'
    });
    const draftSession = await createSessionFor(teacher, deck, mechanic, context, {
      status: 'created'
    });
    const play = await GamePlay.create({
      sessionId: playedSession._id,
      playerId: student._id,
      status: 'completed',
      score: 40,
      completedAt: new Date()
    });
    return { context, mechanic, deck, playedSession, draftSession, play };
  }

  it('archiva mazos, completa sesiones jugadas, borra borradores y conserva partidas', async () => {
    const { context, deck, playedSession, draftSession, play } = await buildContextGraph();

    const res = await request(app)
      .delete(`/api/contexts/${context._id}`)
      .set(authHeaders(superAdminToken));

    expect(res.statusCode).toBe(200);
    // Resumen de la cascada en la respuesta (para el toast del admin)
    expect(res.body.data.decksToArchive).toBe(1);
    expect(res.body.data.sessionsToComplete).toBe(1);
    expect(res.body.data.draftSessionsToDelete).toBe(1);
    expect(res.body.data.playsPreserved).toBe(1);

    expect(await GameContext.findById(context._id)).toBeNull();

    const archivedDeck = await CardDeck.findById(deck._id);
    expect(archivedDeck.status).toBe('archived');

    const completedSession = await GameSession.findById(playedSession._id);
    expect(completedSession.status).toBe('completed');
    expect(completedSession.endedAt).toBeTruthy();

    expect(await GameSession.findById(draftSession._id)).toBeNull();

    // El historial educativo queda intacto
    const preservedPlay = await GamePlay.findById(play._id);
    expect(preservedPlay).toBeTruthy();
    expect(preservedPlay.score).toBe(40);
  });

  it('bloquea el borrado con 409 si hay una partida en curso', async () => {
    const { context, playedSession } = await buildContextGraph();
    await GamePlay.create({
      sessionId: playedSession._id,
      playerId: student._id,
      status: 'in-progress',
      score: 0
    });

    const res = await request(app)
      .delete(`/api/contexts/${context._id}`)
      .set(authHeaders(superAdminToken));

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/partida.*en curso/i);

    // Nada de la cascada debe haberse ejecutado
    expect(await GameContext.findById(context._id)).toBeTruthy();
    const session = await GameSession.findById(playedSession._id);
    expect(session.status).toBe('active');
  });

  it('expone el inventario de impacto en GET /deletion-impact sin ejecutar nada', async () => {
    const { context, deck, playedSession, draftSession } = await buildContextGraph();

    const res = await request(app)
      .get(`/api/contexts/${context._id}/deletion-impact`)
      .set(authHeaders(superAdminToken));

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({
      activePlays: 0,
      playsPreserved: 1,
      decksToArchive: 1,
      draftSessionsToDelete: 1,
      sessionsToComplete: 1
    });
    expect(res.body.data.teachersAffected).toHaveLength(1);
    expect(res.body.data.teachersAffected[0].name).toBe(teacher.name);
    // No expone el plan interno de IDs
    expect(res.body.data._plan).toBeUndefined();

    // El pre-chequeo es de solo lectura
    expect(await GameContext.findById(context._id)).toBeTruthy();
    expect((await CardDeck.findById(deck._id)).status).toBe('active');
    expect((await GameSession.findById(playedSession._id)).status).toBe('active');
    expect(await GameSession.findById(draftSession._id)).toBeTruthy();
  });

  it('impide des-archivar un mazo cuyo contexto ya no existe', async () => {
    const { context, deck } = await buildContextGraph();
    const teacherToken = await createTokenFor(teacher);

    const deleteRes = await request(app)
      .delete(`/api/contexts/${context._id}`)
      .set(authHeaders(superAdminToken));
    expect(deleteRes.statusCode).toBe(200);

    const res = await request(app)
      .put(`/api/decks/${deck._id}`)
      .set(authHeaders(teacherToken))
      .send({ status: 'active' });

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/contexto ya no existe/i);
    expect((await CardDeck.findById(deck._id)).status).toBe('archived');
  });

  it('marca resourcesAvailable=false en el listado de sesiones tras la cascada', async () => {
    const { context, playedSession } = await buildContextGraph();
    const teacherToken = await createTokenFor(teacher);

    // Antes del borrado los recursos están disponibles
    const beforeRes = await request(app).get('/api/sessions').set(authHeaders(teacherToken));
    expect(beforeRes.statusCode).toBe(200);
    const beforeSession = beforeRes.body.data.find(s => s.id === String(playedSession._id));
    expect(beforeSession.resourcesAvailable).toBe(true);

    await request(app).delete(`/api/contexts/${context._id}`).set(authHeaders(superAdminToken));

    const afterRes = await request(app).get('/api/sessions').set(authHeaders(teacherToken));
    expect(afterRes.statusCode).toBe(200);
    const afterSession = afterRes.body.data.find(s => s.id === String(playedSession._id));
    expect(afterSession).toBeTruthy();
    expect(afterSession.status).toBe('completed');
    expect(afterSession.resourcesAvailable).toBe(false);

    // Y también en el detalle
    const detailRes = await request(app)
      .get(`/api/sessions/${playedSession._id}`)
      .set(authHeaders(teacherToken));
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.body.data.resourcesAvailable).toBe(false);
  });

  it('denies context deletion to teacher (only super_admin allowed)', async () => {
    const teacherToken = await createTokenFor(teacher);
    const context = await createContext({ suffix: 'teacher-deny' });

    const res = await request(app)
      .delete(`/api/contexts/${context._id}`)
      .set(authHeaders(teacherToken));

    expect(res.statusCode).toBe(403);
    expect(await GameContext.findById(context._id)).toBeTruthy();
  });
});
