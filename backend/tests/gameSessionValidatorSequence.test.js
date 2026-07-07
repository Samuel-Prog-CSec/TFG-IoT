/**
 * @fileoverview Tests Zod para los nuevos schemas de mecánica Secuencia.
 */

const {
  createGameSessionSchema,
  updateGameSessionSchema,
  sequencePlanSchema,
  sequenceConfigSchema
} = require('../src/validators/gameSessionValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';
const VALID_UID_A = 'AA000001';
const VALID_UID_B = 'AA000002';
const VALID_UID_C = 'AA000003';

const buildSequenceRound = (roundNumber, uids = [VALID_UID_A, VALID_UID_B, VALID_UID_C]) => ({
  roundNumber,
  length: uids.length,
  sequence: uids.map(uid => ({
    uid,
    assignedValue: `Value-${uid}`,
    displayData: { display: uid }
  }))
});

describe('sequencePlanSchema', () => {
  it('acepta plan vacío (opcional)', () => {
    expect(sequencePlanSchema.safeParse(undefined).success).toBe(true);
    expect(sequencePlanSchema.safeParse([]).success).toBe(true);
  });

  it('acepta plan válido', () => {
    const plan = [buildSequenceRound(1), buildSequenceRound(2)];
    const result = sequencePlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
  });

  it('rechaza rondas duplicadas', () => {
    const plan = [buildSequenceRound(1), buildSequenceRound(1)];
    expect(sequencePlanSchema.safeParse(plan).success).toBe(false);
  });

  it('rechaza UIDs duplicados dentro de una secuencia', () => {
    const round = buildSequenceRound(1, [VALID_UID_A, VALID_UID_A]);
    expect(sequencePlanSchema.safeParse([round]).success).toBe(false);
  });

  it('rechaza length que no coincide con sequence.length', () => {
    const round = buildSequenceRound(1);
    round.length = 2; // sequence tiene 3 items
    expect(sequencePlanSchema.safeParse([round]).success).toBe(false);
  });

  it('rechaza secuencia vacía', () => {
    const round = { roundNumber: 1, length: 0, sequence: [] };
    expect(sequencePlanSchema.safeParse([round]).success).toBe(false);
  });

  it('rechaza UID inválido', () => {
    const round = buildSequenceRound(1);
    round.sequence[0].uid = 'INVALID';
    expect(sequencePlanSchema.safeParse([round]).success).toBe(false);
  });
});

describe('sequenceConfigSchema', () => {
  it('acepta config vacía', () => {
    expect(sequenceConfigSchema.safeParse({}).success).toBe(true);
  });

  it('acepta valores válidos', () => {
    const result = sequenceConfigSchema.safeParse({
      minSequenceLength: 3,
      maxSequenceLength: 5,
      displaySeconds: 4
    });
    expect(result.success).toBe(true);
  });

  it('rechaza min > max', () => {
    const result = sequenceConfigSchema.safeParse({
      minSequenceLength: 7,
      maxSequenceLength: 3
    });
    expect(result.success).toBe(false);
  });

  it('rechaza displaySeconds < 2', () => {
    expect(sequenceConfigSchema.safeParse({ displaySeconds: 1 }).success).toBe(false);
  });

  it('rechaza displaySeconds > 8', () => {
    expect(sequenceConfigSchema.safeParse({ displaySeconds: 12 }).success).toBe(false);
  });

  it('rechaza minSequenceLength = 0', () => {
    expect(
      sequenceConfigSchema.safeParse({ minSequenceLength: 0, maxSequenceLength: 3 }).success
    ).toBe(false);
  });

  it('acepta solo min sin max (sin refine)', () => {
    expect(sequenceConfigSchema.safeParse({ minSequenceLength: 3 }).success).toBe(true);
  });
});

describe('createGameSessionSchema con Secuencia', () => {
  it('acepta sesión Secuencia con sequencePlan y sequenceConfig', () => {
    const data = {
      mechanicId: VALID_OBJECT_ID,
      deckId: VALID_OBJECT_ID,
      sequencePlan: [buildSequenceRound(1)],
      sequenceConfig: { minSequenceLength: 3, maxSequenceLength: 3, displaySeconds: 3 }
    };
    expect(createGameSessionSchema.safeParse(data).success).toBe(true);
  });

  it('acepta sesión sin sequencePlan ni sequenceConfig (compatibilidad con Asociación/Memoria)', () => {
    const data = { mechanicId: VALID_OBJECT_ID, deckId: VALID_OBJECT_ID };
    expect(createGameSessionSchema.safeParse(data).success).toBe(true);
  });
});

describe('updateGameSessionSchema con Secuencia', () => {
  it('permite actualizar sequencePlan y sequenceConfig', () => {
    const result = updateGameSessionSchema.safeParse({
      sequencePlan: [buildSequenceRound(1)],
      sequenceConfig: { minSequenceLength: 3, maxSequenceLength: 5 }
    });
    expect(result.success).toBe(true);
  });
});
