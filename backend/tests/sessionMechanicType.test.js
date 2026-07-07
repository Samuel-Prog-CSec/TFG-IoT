/**
 * @fileoverview Integración del campo explícito `GameSession.mechanicType`
 * (ADR-193): persistencia (enum), round-trip a BD y consumo por el cálculo de
 * puntuación. Incluye la regresión del bug ALTO: una sesión de Asociación con
 * `boardLayout` (que comparte con Memoria) debe puntuar por rondas, no por
 * parejas, cuando `mechanicType === 'association'`.
 */
const mongoose = require('mongoose');
const GameSession = require('../src/models/GameSession');
const { computeMaxScore } = require('../src/services/gamePlayScoring');

describe('GameSession.mechanicType — persistencia + scoring (integración)', () => {
  // UIDs hex de 8 chars y únicos: el validador de boardLayout exige uids únicos
  // presentes en cardMappings (las "parejas" de Memoria se forman por valor, no
  // por uid). cardMappings.length debe igualar config.numberOfCards.
  const uid = i => `AA0000${String(i).padStart(2, '0')}`;
  const cards = n =>
    Array.from({ length: n }, (_, i) => ({
      uid: uid(i + 1),
      assignedValue: `V${i + 1}`,
      displayData: { display: `V${i + 1}` }
    }));
  const board = n =>
    Array.from({ length: n }, (_, i) => ({
      slotIndex: i,
      uid: uid(i + 1),
      assignedValue: `V${i + 1}`
    }));

  const refs = () => ({
    mechanicId: new mongoose.Types.ObjectId(),
    deckId: new mongoose.Types.ObjectId(),
    contextId: new mongoose.Types.ObjectId(),
    createdBy: new mongoose.Types.ObjectId()
  });

  beforeEach(async () => {
    await GameSession.deleteMany({});
  });

  it('mechanicType="association" puntúa por rondas aunque la huella (boardLayout) diga Memoria — regresión bug ALTO', async () => {
    const created = await GameSession.create({
      ...refs(),
      mechanicType: 'association',
      config: {
        numberOfCards: 12,
        numberOfRounds: 3,
        timeLimit: 30,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      },
      cardMappings: cards(12),
      boardLayout: board(12),
      status: 'created'
    });
    const reloaded = await GameSession.findById(created._id).lean();
    expect(reloaded.mechanicType).toBe('association');
    // rondas × puntos = 3 × 10 = 30. La huella (boardLayout 12 = 6 parejas)
    // daría 60 si se clasificara como Memoria: el campo explícito manda.
    expect(computeMaxScore(reloaded)).toBe(30);
  });

  it('mechanicType="memory" puntúa por parejas (boardLayout / 2)', async () => {
    const created = await GameSession.create({
      ...refs(),
      mechanicType: 'memory',
      config: {
        numberOfCards: 8,
        numberOfRounds: 1,
        timeLimit: 30,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      },
      cardMappings: cards(8),
      boardLayout: board(8),
      status: 'created'
    });
    const reloaded = await GameSession.findById(created._id).lean();
    expect(reloaded.mechanicType).toBe('memory');
    expect(computeMaxScore(reloaded)).toBe(40); // 4 parejas × 10
  });

  it('rechaza un mechanicType fuera del enum', async () => {
    await expect(
      GameSession.create({
        ...refs(),
        mechanicType: 'invalid',
        config: {
          numberOfCards: 2,
          numberOfRounds: 1,
          timeLimit: 30,
          pointsPerCorrect: 10,
          penaltyPerError: -2
        },
        cardMappings: cards(2),
        status: 'created'
      })
    ).rejects.toThrow();
  });
});
