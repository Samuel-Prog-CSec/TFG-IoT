/**
 * @fileoverview Regresión DASH-2: `getClassroomTrends` no debe ofrecer un
 * baseline comparativo cuando el periodo anterior tuvo muy pocas partidas. Con
 * 1-2 partidas (o ninguna) el % "vs semana pasada" se dispara a valores
 * engañosos (+1900%, +153%...). Por debajo del mínimo, `previous` queda null y
 * el frontend pinta "—" (sin comparación). (Detectado en QA 2026-06-27.)
 */

const GamePlay = require('../../../src/models/GamePlay');
const User = require('../../../src/models/User');
const analyticsService = require('../../../src/services/analyticsService');
const {
  createTeacher,
  createContext,
  createMechanic,
  createDeckFor,
  createSessionFor,
  clearActorCollections
} = require('../../helpers/testFixtures');

const DAY = 24 * 60 * 60 * 1000;

describe('getClassroomTrends — baseline mínimo (DASH-2)', () => {
  let teacher;
  let session;
  let student;

  beforeEach(async () => {
    await Promise.all([clearActorCollections(), GamePlay.deleteMany({})]);
    teacher = await createTeacher();
    const context = await createContext();
    const mechanic = await createMechanic();
    const deck = await createDeckFor(teacher, context);
    session = await createSessionFor(teacher, deck, mechanic, context);
    student = await User.create({
      name: 'Alumno DASH2',
      role: 'student',
      status: 'active',
      createdBy: teacher._id,
      consent: { granted: true, grantedAt: new Date(), grantedBy: 'Tutor test' }
    });
  });

  const seedGames = async (count, completedAt) => {
    const docs = Array.from({ length: count }, () => ({
      sessionId: session._id,
      playerId: student._id,
      status: 'completed',
      score: 50,
      maxScore: 100,
      startedAt: completedAt,
      completedAt,
      metrics: { totalAttempts: 5, correctAttempts: 3, averageResponseTime: 1000 }
    }));
    await GamePlay.insertMany(docs);
  };

  const averageScoreKpi = async () => {
    const { kpis } = await analyticsService.getClassroomTrends(teacher._id.toString(), '7d');
    return kpis.find(k => k.name === 'averageScore');
  };

  it('previous = null cuando el periodo anterior tuvo <3 partidas (baseline no fiable)', async () => {
    const now = Date.now();
    await seedGames(5, new Date(now - 2 * DAY)); // periodo actual
    await seedGames(1, new Date(now - 10 * DAY)); // periodo anterior: 1 partida
    const kpi = await averageScoreKpi();
    expect(kpi.previous).toBeNull();
    expect(kpi.changePercent).toBeNull();
  });

  it('previous con valor cuando el periodo anterior tuvo baseline suficiente (≥3)', async () => {
    const now = Date.now();
    await seedGames(5, new Date(now - 2 * DAY));
    await seedGames(4, new Date(now - 10 * DAY)); // periodo anterior: 4 partidas
    const kpi = await averageScoreKpi();
    expect(kpi.previous).not.toBeNull();
    expect(typeof kpi.previous).toBe('number');
  });
});
