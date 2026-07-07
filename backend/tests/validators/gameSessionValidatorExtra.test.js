/**
 * @fileoverview Tests unitarios dirigidos para gameSessionValidator — ramas no
 * cubiertas por gameSessionValidatorSequence.test.js.
 *
 * Foco: sessionConfigSchema (límites de cada campo), boardLayout (refines de
 * slots/UIDs duplicados), associationChallengePlan (refine de rondas duplicadas),
 * createGameSessionSchema (refine "datos para crear"), updateGameSessionSchema
 * (superRefine sequencePlan vs numberOfRounds) y query/params.
 */

const {
  createGameSessionSchema,
  updateGameSessionSchema,
  gameSessionQuerySchema,
  gameSessionParamsSchema,
  sessionActionSchema,
  sessionConfigSchema,
  sessionConfigInputSchema
} = require('../../src/validators/gameSessionValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';
const UID_A = 'AA000001';
const UID_B = 'AA000002';

describe('gameSessionValidator (ramas extra)', () => {
  describe('sessionConfigSchema (límites + defaults)', () => {
    it('aplica defaults para los campos opcionales', () => {
      const result = sessionConfigSchema.safeParse({ numberOfCards: 4 });
      expect(result.success).toBe(true);
      expect(result.data.numberOfRounds).toBe(5);
      expect(result.data.timeLimit).toBe(15);
      expect(result.data.pointsPerCorrect).toBe(10);
      expect(result.data.penaltyPerError).toBe(-2);
    });

    it('rechaza numberOfCards < 2', () => {
      expect(sessionConfigSchema.safeParse({ numberOfCards: 1 }).success).toBe(false);
    });

    it('rechaza numberOfCards > 20', () => {
      expect(sessionConfigSchema.safeParse({ numberOfCards: 21 }).success).toBe(false);
    });

    it('rechaza numberOfRounds > 20', () => {
      expect(sessionConfigSchema.safeParse({ numberOfCards: 4, numberOfRounds: 21 }).success).toBe(
        false
      );
    });

    it('rechaza timeLimit < 3', () => {
      expect(sessionConfigSchema.safeParse({ numberOfCards: 4, timeLimit: 2 }).success).toBe(false);
    });

    it('rechaza timeLimit > 300', () => {
      expect(sessionConfigSchema.safeParse({ numberOfCards: 4, timeLimit: 301 }).success).toBe(
        false
      );
    });

    it('rechaza pointsPerCorrect fuera de 5..15', () => {
      expect(sessionConfigSchema.safeParse({ numberOfCards: 4, pointsPerCorrect: 4 }).success).toBe(
        false
      );
      expect(
        sessionConfigSchema.safeParse({ numberOfCards: 4, pointsPerCorrect: 16 }).success
      ).toBe(false);
    });

    it('rechaza penaltyPerError fuera de -5..0', () => {
      expect(sessionConfigSchema.safeParse({ numberOfCards: 4, penaltyPerError: -6 }).success).toBe(
        false
      );
      expect(sessionConfigSchema.safeParse({ numberOfCards: 4, penaltyPerError: 1 }).success).toBe(
        false
      );
    });

    it('rechaza numberOfCards no entero', () => {
      expect(sessionConfigSchema.safeParse({ numberOfCards: 3.5 }).success).toBe(false);
    });

    it('sessionConfigInputSchema (partial) acepta objeto vacío', () => {
      expect(sessionConfigInputSchema.safeParse({}).success).toBe(true);
    });
  });

  describe('createGameSessionSchema', () => {
    const buildBase = () => ({ mechanicId: VALID_OBJECT_ID, deckId: VALID_OBJECT_ID });

    it('acepta mínimo (mechanicId + deckId)', () => {
      expect(createGameSessionSchema.safeParse(buildBase()).success).toBe(true);
    });

    it('rechaza si falta deckId', () => {
      expect(createGameSessionSchema.safeParse({ mechanicId: VALID_OBJECT_ID }).success).toBe(
        false
      );
    });

    it('acepta difficulty válida y config parcial', () => {
      const result = createGameSessionSchema.safeParse({
        ...buildBase(),
        difficulty: 'medium',
        config: { numberOfCards: 4 }
      });
      expect(result.success).toBe(true);
    });

    it('rechaza difficulty fuera del enum', () => {
      expect(
        createGameSessionSchema.safeParse({ ...buildBase(), difficulty: 'extreme' }).success
      ).toBe(false);
    });

    it('acepta boardLayout válido', () => {
      const result = createGameSessionSchema.safeParse({
        ...buildBase(),
        boardLayout: [
          { slotIndex: 0, uid: UID_A, assignedValue: 'A' },
          { slotIndex: 1, uid: UID_B, assignedValue: 'B' }
        ]
      });
      expect(result.success).toBe(true);
    });

    it('rechaza boardLayout con slotIndex duplicado (refine)', () => {
      const result = createGameSessionSchema.safeParse({
        ...buildBase(),
        boardLayout: [
          { slotIndex: 0, uid: UID_A, assignedValue: 'A' },
          { slotIndex: 0, uid: UID_B, assignedValue: 'B' }
        ]
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /slots duplicados/.test(i.message))).toBe(true);
    });

    it('rechaza boardLayout con UID duplicado (refine)', () => {
      const result = createGameSessionSchema.safeParse({
        ...buildBase(),
        boardLayout: [
          { slotIndex: 0, uid: UID_A, assignedValue: 'A' },
          { slotIndex: 1, uid: UID_A, assignedValue: 'B' }
        ]
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /UIDs duplicados en boardLayout/.test(i.message))).toBe(
        true
      );
    });

    it('rechaza boardLayout con slotIndex negativo', () => {
      const result = createGameSessionSchema.safeParse({
        ...buildBase(),
        boardLayout: [{ slotIndex: -1, uid: UID_A, assignedValue: 'A' }]
      });
      expect(result.success).toBe(false);
    });

    it('acepta associationChallengePlan válido', () => {
      const result = createGameSessionSchema.safeParse({
        ...buildBase(),
        associationChallengePlan: [
          { roundNumber: 1, uid: UID_A, assignedValue: 'A', promptText: '¿Cuál?' },
          { roundNumber: 2, uid: UID_B, assignedValue: 'B' }
        ]
      });
      expect(result.success).toBe(true);
    });

    it('rechaza associationChallengePlan con rondas duplicadas (refine)', () => {
      const result = createGameSessionSchema.safeParse({
        ...buildBase(),
        associationChallengePlan: [
          { roundNumber: 1, uid: UID_A, assignedValue: 'A' },
          { roundNumber: 1, uid: UID_B, assignedValue: 'B' }
        ]
      });
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(i =>
          /rondas duplicadas en associationChallengePlan/.test(i.message)
        )
      ).toBe(true);
    });

    it('rechaza associationChallengePlan con roundNumber < 1', () => {
      const result = createGameSessionSchema.safeParse({
        ...buildBase(),
        associationChallengePlan: [{ roundNumber: 0, uid: UID_A, assignedValue: 'A' }]
      });
      expect(result.success).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(createGameSessionSchema.safeParse({ ...buildBase(), foo: 1 }).success).toBe(false);
    });
  });

  describe('updateGameSessionSchema (superRefine sequencePlan vs numberOfRounds)', () => {
    const buildRound = roundNumber => ({
      roundNumber,
      length: 1,
      sequence: [{ uid: UID_A, assignedValue: 'A' }]
    });

    it('acepta actualización solo de name', () => {
      expect(updateGameSessionSchema.safeParse({ name: 'Sesión X' }).success).toBe(true);
    });

    it('rechaza objeto vacío (refine al menos un campo)', () => {
      const result = updateGameSessionSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /al menos un campo/.test(i.message))).toBe(true);
    });

    it('acepta sequencePlan cuyo nº de rondas coincide con config.numberOfRounds', () => {
      const result = updateGameSessionSchema.safeParse({
        sequencePlan: [buildRound(1), buildRound(2)],
        config: { numberOfRounds: 2 }
      });
      expect(result.success).toBe(true);
    });

    it('rechaza sequencePlan con nº de rondas distinto de config.numberOfRounds (superRefine)', () => {
      const result = updateGameSessionSchema.safeParse({
        sequencePlan: [buildRound(1), buildRound(2)],
        config: { numberOfRounds: 5 }
      });
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(i =>
          /mismo número de rondas que config\.numberOfRounds/.test(i.message)
        )
      ).toBe(true);
    });

    it('no aplica el superRefine si no se envía config.numberOfRounds', () => {
      const result = updateGameSessionSchema.safeParse({
        sequencePlan: [buildRound(1), buildRound(2)]
      });
      expect(result.success).toBe(true);
    });
  });

  describe('gameSessionQuerySchema', () => {
    it('aplica default sortBy=createdAt y acepta filtros', () => {
      const result = gameSessionQuerySchema.safeParse({
        status: 'active',
        difficulty: 'medium',
        mechanicId: VALID_OBJECT_ID,
        contextId: VALID_OBJECT_ID,
        createdBy: VALID_OBJECT_ID
      });
      expect(result.success).toBe(true);
      expect(result.data.sortBy).toBe('createdAt');
    });

    it('acepta sortBy=startedAt', () => {
      expect(gameSessionQuerySchema.safeParse({ sortBy: 'startedAt' }).success).toBe(true);
    });

    it('rechaza status fuera del enum', () => {
      expect(gameSessionQuerySchema.safeParse({ status: 'paused' }).success).toBe(false);
    });

    it('rechaza sortBy desconocido', () => {
      expect(gameSessionQuerySchema.safeParse({ sortBy: 'foo' }).success).toBe(false);
    });
  });

  describe('params schemas', () => {
    it('gameSessionParamsSchema acepta ObjectId, rechaza basura', () => {
      expect(gameSessionParamsSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(gameSessionParamsSchema.safeParse({ id: 'bad' }).success).toBe(false);
    });

    it('sessionActionSchema acepta ObjectId', () => {
      expect(sessionActionSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(sessionActionSchema.safeParse({ id: 'bad' }).success).toBe(false);
    });
  });
});
