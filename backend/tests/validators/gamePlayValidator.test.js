/**
 * @fileoverview Tests unitarios dirigidos para gamePlayValidator.
 *
 * Cubre gameEventSchema (default timestamp, enums, límites), gameMetricsSchema
 * (defaults), addEventSchema (omit timestamp + required roundNumber),
 * createGamePlaySchema, updateGamePlaySchema (refine "al menos un campo"),
 * gamePlayQuerySchema (transforms minScore/maxScore) y los params.
 */

const {
  createGamePlaySchema,
  updateGamePlaySchema,
  addEventSchema,
  gamePlayQuerySchema,
  gamePlayParamsSchema,
  playerStatsQuerySchema,
  playerStatsParamsSchema,
  gameEventSchema,
  gameMetricsSchema
} = require('../../src/validators/gamePlayValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';
const OTHER_OBJECT_ID = '507f1f77bcf86cd799439012';

describe('gamePlayValidator (unit)', () => {
  describe('gameEventSchema', () => {
    it('aplica un timestamp Date por defecto', () => {
      const result = gameEventSchema.safeParse({ eventType: 'correct' });
      expect(result.success).toBe(true);
      expect(result.data.timestamp).toBeInstanceOf(Date);
    });

    it('acepta evento completo válido', () => {
      const result = gameEventSchema.safeParse({
        eventType: 'correct',
        cardUid: '32B8FA05',
        expectedValue: 'España',
        actualValue: 'España',
        pointsAwarded: 10,
        timeElapsed: 3500,
        roundNumber: 2
      });
      expect(result.success).toBe(true);
    });

    it('rechaza eventType fuera del enum', () => {
      expect(gameEventSchema.safeParse({ eventType: 'jump' }).success).toBe(false);
    });

    it('rechaza pointsAwarded no entero', () => {
      expect(gameEventSchema.safeParse({ eventType: 'correct', pointsAwarded: 1.5 }).success).toBe(
        false
      );
    });

    it('rechaza timeElapsed negativo', () => {
      expect(gameEventSchema.safeParse({ eventType: 'correct', timeElapsed: -1 }).success).toBe(
        false
      );
    });

    it('rechaza roundNumber < 1', () => {
      expect(gameEventSchema.safeParse({ eventType: 'correct', roundNumber: 0 }).success).toBe(
        false
      );
    });

    it('rechaza cardUid inválido', () => {
      expect(gameEventSchema.safeParse({ eventType: 'correct', cardUid: 'ZZ' }).success).toBe(
        false
      );
    });

    it('rechaza campos extra (strict)', () => {
      expect(gameEventSchema.safeParse({ eventType: 'correct', foo: 1 }).success).toBe(false);
    });
  });

  describe('gameMetricsSchema (defaults)', () => {
    it('aplica todos los defaults con objeto vacío', () => {
      const result = gameMetricsSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        totalAttempts: 0,
        correctAttempts: 0,
        errorAttempts: 0,
        timeoutAttempts: 0,
        averageResponseTime: 0,
        completionTime: 0
      });
    });

    it('rechaza valores negativos', () => {
      expect(gameMetricsSchema.safeParse({ totalAttempts: -1 }).success).toBe(false);
    });

    it('rechaza completionTime no entero', () => {
      expect(gameMetricsSchema.safeParse({ completionTime: 1.2 }).success).toBe(false);
    });
  });

  describe('addEventSchema (omit timestamp + required roundNumber)', () => {
    it('acepta evento con roundNumber obligatorio', () => {
      const result = addEventSchema.safeParse({ eventType: 'correct', roundNumber: 1 });
      expect(result.success).toBe(true);
    });

    it('rechaza si falta roundNumber (ahora obligatorio)', () => {
      expect(addEventSchema.safeParse({ eventType: 'correct' }).success).toBe(false);
    });

    it('rechaza timestamp explícito (omitido del schema, strict)', () => {
      expect(
        addEventSchema.safeParse({ eventType: 'correct', roundNumber: 1, timestamp: new Date() })
          .success
      ).toBe(false);
    });
  });

  describe('createGamePlaySchema', () => {
    it('acepta sessionId + playerId válidos', () => {
      expect(
        createGamePlaySchema.safeParse({ sessionId: VALID_OBJECT_ID, playerId: OTHER_OBJECT_ID })
          .success
      ).toBe(true);
    });

    it('rechaza si falta playerId', () => {
      expect(createGamePlaySchema.safeParse({ sessionId: VALID_OBJECT_ID }).success).toBe(false);
    });

    it('rechaza ids inválidos', () => {
      expect(createGamePlaySchema.safeParse({ sessionId: 'x', playerId: 'y' }).success).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(
        createGamePlaySchema.safeParse({
          sessionId: VALID_OBJECT_ID,
          playerId: OTHER_OBJECT_ID,
          score: 10
        }).success
      ).toBe(false);
    });
  });

  describe('updateGamePlaySchema (refine al menos un campo)', () => {
    it('acepta actualización de status', () => {
      expect(updateGamePlaySchema.safeParse({ status: 'completed' }).success).toBe(true);
    });

    it('acepta actualización de score y currentRound', () => {
      expect(updateGamePlaySchema.safeParse({ score: 50, currentRound: 3 }).success).toBe(true);
    });

    it('acepta completedAt Date', () => {
      expect(updateGamePlaySchema.safeParse({ completedAt: new Date() }).success).toBe(true);
    });

    it('rechaza objeto vacío (refine)', () => {
      const result = updateGamePlaySchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /al menos un campo/.test(i.message))).toBe(true);
    });

    it('rechaza score no entero', () => {
      expect(updateGamePlaySchema.safeParse({ score: 1.5 }).success).toBe(false);
    });

    it('rechaza currentRound < 1', () => {
      expect(updateGamePlaySchema.safeParse({ currentRound: 0 }).success).toBe(false);
    });

    it('rechaza status fuera del enum', () => {
      expect(updateGamePlaySchema.safeParse({ status: 'frozen' }).success).toBe(false);
    });
  });

  describe('gamePlayQuerySchema (transform minScore/maxScore)', () => {
    it('aplica defaults y deja minScore/maxScore undefined', () => {
      const result = gamePlayQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.minScore).toBeUndefined();
      expect(result.data.maxScore).toBeUndefined();
    });

    it('transforma minScore/maxScore string → int', () => {
      const result = gamePlayQuerySchema.safeParse({ minScore: '10', maxScore: '90' });
      expect(result.success).toBe(true);
      expect(result.data.minScore).toBe(10);
      expect(result.data.maxScore).toBe(90);
    });

    it('acepta filtros sessionId/playerId/status y sortBy=score', () => {
      const result = gamePlayQuerySchema.safeParse({
        sessionId: VALID_OBJECT_ID,
        playerId: OTHER_OBJECT_ID,
        status: 'completed',
        sortBy: 'score'
      });
      expect(result.success).toBe(true);
    });

    it('rechaza sortBy desconocido', () => {
      expect(gamePlayQuerySchema.safeParse({ sortBy: 'foo' }).success).toBe(false);
    });

    it('rechaza status fuera del enum', () => {
      expect(gamePlayQuerySchema.safeParse({ status: 'frozen' }).success).toBe(false);
    });
  });

  describe('params schemas', () => {
    it('gamePlayParamsSchema acepta ObjectId, rechaza basura', () => {
      expect(gamePlayParamsSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(gamePlayParamsSchema.safeParse({ id: 'bad' }).success).toBe(false);
    });

    it('playerStatsParamsSchema acepta playerId ObjectId', () => {
      expect(playerStatsParamsSchema.safeParse({ playerId: VALID_OBJECT_ID }).success).toBe(true);
      expect(playerStatsParamsSchema.safeParse({ playerId: 'bad' }).success).toBe(false);
    });

    it('playerStatsQuerySchema acepta sessionId opcional', () => {
      expect(playerStatsQuerySchema.safeParse({}).success).toBe(true);
      expect(playerStatsQuerySchema.safeParse({ sessionId: VALID_OBJECT_ID }).success).toBe(true);
      expect(playerStatsQuerySchema.safeParse({ sessionId: 'bad' }).success).toBe(false);
    });
  });
});
