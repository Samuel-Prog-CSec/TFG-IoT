/**
 * @fileoverview Regresión: los detectores que cruzan con `game_mechanics` deben
 * filtrar/agrupar por `mechanic.name` (campo real del schema GameMechanic), NO por
 * `mechanic.slug` (que NO existe). Con el bug previo el `$match`/`$group` no casaba
 * y estos 3 detectores no producían hallazgos jamás (fallo silencioso).
 *
 * A diferencia de `alertDetectionService.test.js` (que mockea `run()` de los
 * detectores), estos tests ejercitan la AGREGACIÓN real contra la Mongo de test,
 * por lo que sí dependen de que el `$lookup` + match por nombre funcione.
 */

const GamePlay = require('../../../src/models/GamePlay');
const User = require('../../../src/models/User');
const GameMechanic = require('../../../src/models/GameMechanic');
const GameSession = require('../../../src/models/GameSession');
const GameContext = require('../../../src/models/GameContext');
const CardDeck = require('../../../src/models/CardDeck');
const sequenceStagnation = require('../../../src/services/analytics/detectors/sequenceStagnation');
const sequenceOrderErrors = require('../../../src/services/analytics/detectors/sequenceOrderErrors');
const mechanicSpecificStruggle = require('../../../src/services/analytics/detectors/mechanicSpecificStruggle');
const {
  createTeacher,
  createMechanic,
  createContext,
  createDeckFor,
  createSessionFor
} = require('../../helpers/testFixtures');

const DAY = 24 * 60 * 60 * 1000;

// Crea N partidas completadas (escalonadas en días) para un alumno/sesión.
const seedPlays = async ({
  session,
  playerId,
  count,
  score = 50,
  maxScore = 100,
  metrics = {}
}) => {
  const base = Date.now() - 5 * DAY;
  const docs = Array.from({ length: count }, (_, i) => ({
    sessionId: session._id,
    playerId,
    status: 'completed',
    score,
    // maxScore=100 por defecto: los scores del test son 0-100, así el % normalizado
    // (score/maxScore×100, ADR-201) coincide con el número sembrado.
    maxScore,
    startedAt: new Date(base + i * DAY),
    completedAt: new Date(base + i * DAY + 60000),
    metrics: { totalAttempts: 5, ...metrics }
  }));
  await GamePlay.insertMany(docs);
};

describe('Detectores que cruzan game_mechanics — filtran por mechanic.name (regresión slug→name)', () => {
  let teacher;
  let student;
  let context;
  let deck;

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      GamePlay.deleteMany({}),
      GameMechanic.deleteMany({}),
      GameSession.deleteMany({}),
      GameContext.deleteMany({}),
      CardDeck.deleteMany({})
    ]);
    teacher = await createTeacher();
    student = await User.create({
      name: 'Alumno Seq',
      role: 'student',
      status: 'active',
      createdBy: teacher._id,
      consent: { granted: true, grantedAt: new Date(), grantedBy: 'Tutor test' }
    });
    context = await createContext();
    deck = await createDeckFor(teacher, context);
  });

  it('sequence_stagnation produce hallazgo con mecánica "sequence" (con el bug slug nunca lo hacía)', async () => {
    const mechanic = await createMechanic({ name: 'sequence', displayName: 'Secuencia' });
    const session = await createSessionFor(teacher, deck, mechanic, context, {
      mechanicType: 'sequence'
    });
    // 5 partidas (= minStagnantGames) con la MISMA longitud máxima → estancamiento.
    await seedPlays({
      session,
      playerId: student._id,
      count: 5,
      metrics: { maxSequenceLengthAchieved: 4 }
    });

    const findings = await sequenceStagnation.run({ students: [student] });
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('sequence_stagnation');
    expect(findings[0].data.stagnationLength).toBe(4);
  });

  it('sequence_stagnation NO dispara si la mecánica no es Secuencia (el match por name discrimina)', async () => {
    const mechanic = await createMechanic({ name: 'association', displayName: 'Asociación' });
    const session = await createSessionFor(teacher, deck, mechanic, context, {
      mechanicType: 'association'
    });
    await seedPlays({
      session,
      playerId: student._id,
      count: 5,
      metrics: { maxSequenceLengthAchieved: 4 }
    });

    const findings = await sequenceStagnation.run({ students: [student] });
    expect(findings).toHaveLength(0);
  });

  it('sequence_order_errors produce hallazgo con ratio de fallos de orden alto en "sequence"', async () => {
    const mechanic = await createMechanic({ name: 'sequence', displayName: 'Secuencia' });
    const session = await createSessionFor(teacher, deck, mechanic, context, {
      mechanicType: 'sequence'
    });
    // 3 partidas con 3 reproducciones parciales sobre 5 intentos → ratio 0.6 > 0.4.
    await seedPlays({
      session,
      playerId: student._id,
      count: 3,
      metrics: { partialReproductions: 3, totalAttempts: 5 }
    });

    const findings = await sequenceOrderErrors.run({ students: [student] });
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('sequence_order_errors');
  });

  it('mechanic_specific_struggle cruza mecánicas por name (domina Memoria, falla Secuencia)', async () => {
    const memory = await createMechanic({ name: 'memory', displayName: 'Memoria' });
    const sequence = await createMechanic({ name: 'sequence', displayName: 'Secuencia' });
    const memSession = await createSessionFor(teacher, deck, memory, context, {
      mechanicType: 'memory'
    });
    const seqSession = await createSessionFor(teacher, deck, sequence, context, {
      mechanicType: 'sequence'
    });
    // Memoria fuerte (avg 80), Secuencia débil (avg 40): gap 40 ≥ 30 y débil < 50.
    await seedPlays({ session: memSession, playerId: student._id, count: 3, score: 80 });
    await seedPlays({ session: seqSession, playerId: student._id, count: 3, score: 40 });

    const findings = await mechanicSpecificStruggle.run({ students: [student] });
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('mechanic_specific_struggle');
    expect(findings[0].data.strongMechanic).toBe('memory');
    expect(findings[0].data.weakMechanic).toBe('sequence');
  });
});
