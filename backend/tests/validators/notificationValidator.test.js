/**
 * @fileoverview Tests unitarios dirigidos para notificationValidator (T-955).
 *
 * Cubre la transform+pipe de `limit` (string→int 1..100, default 20), el cursor
 * `before` (ISO datetime), el schema vacío y los params de ObjectId.
 */

const {
  notificationListQuerySchema,
  emptyNotificationQuerySchema,
  notificationParamsSchema
} = require('../../src/validators/notificationValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

describe('notificationValidator (unit)', () => {
  describe('notificationListQuerySchema', () => {
    it('aplica default limit=20 con query vacía', () => {
      const result = notificationListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.limit).toBe(20);
    });

    it('transforma limit="50" → 50', () => {
      const result = notificationListQuerySchema.safeParse({ limit: '50' });
      expect(result.success).toBe(true);
      expect(result.data.limit).toBe(50);
    });

    it('rechaza limit > 100', () => {
      expect(notificationListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    });

    it('rechaza limit = 0', () => {
      expect(notificationListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    });

    it('acepta before ISO datetime', () => {
      expect(
        notificationListQuerySchema.safeParse({ before: '2026-01-01T00:00:00.000Z' }).success
      ).toBe(true);
    });

    it('rechaza before no-ISO con mensaje específico', () => {
      const result = notificationListQuerySchema.safeParse({ before: 'ayer' });
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /fecha ISO 8601/.test(i.message))).toBe(true);
    });

    it('rechaza campos extra (strict)', () => {
      expect(notificationListQuerySchema.safeParse({ foo: 1 }).success).toBe(false);
    });
  });

  describe('emptyNotificationQuerySchema', () => {
    it('acepta vacío y rechaza parámetros (strict)', () => {
      expect(emptyNotificationQuerySchema.safeParse({}).success).toBe(true);
      expect(emptyNotificationQuerySchema.safeParse({ x: 1 }).success).toBe(false);
    });
  });

  describe('notificationParamsSchema', () => {
    it('acepta ObjectId, rechaza basura', () => {
      expect(notificationParamsSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(notificationParamsSchema.safeParse({ id: 'bad' }).success).toBe(false);
    });
  });
});
