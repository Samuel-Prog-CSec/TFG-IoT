/**
 * @fileoverview Tests unitarios dirigidos para gameMechanicValidator.
 *
 * Cubre la transform de `isActive` (true/false/otros → boolean|undefined) en la
 * query, el slug `mechanicNameSchema` (regex/longitud) y el union ObjectId|slug
 * en los params.
 */

const {
  gameMechanicQuerySchema,
  gameMechanicParamsSchema,
  mechanicNameSchema
} = require('../../src/validators/gameMechanicValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

describe('gameMechanicValidator (unit)', () => {
  describe('mechanicNameSchema', () => {
    it('normaliza a minúsculas y hace trim', () => {
      const result = mechanicNameSchema.safeParse('  Association  ');
      expect(result.success).toBe(true);
      expect(result.data).toBe('association');
    });

    it('rechaza menos de 2 caracteres', () => {
      expect(mechanicNameSchema.safeParse('a').success).toBe(false);
    });

    it('rechaza más de 50 caracteres', () => {
      expect(mechanicNameSchema.safeParse('a'.repeat(51)).success).toBe(false);
    });

    it('rechaza espacios y símbolos', () => {
      expect(mechanicNameSchema.safeParse('mi mecanica').success).toBe(false);
      expect(mechanicNameSchema.safeParse('mecánica').success).toBe(false);
    });
  });

  describe('gameMechanicQuerySchema (transform isActive)', () => {
    it('aplica default sortBy=createdAt y deja isActive undefined', () => {
      const result = gameMechanicQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.isActive).toBeUndefined();
    });

    it('transforma isActive="true" → true', () => {
      const result = gameMechanicQuerySchema.safeParse({ isActive: 'true' });
      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(true);
    });

    it('transforma isActive="false" → false', () => {
      const result = gameMechanicQuerySchema.safeParse({ isActive: 'false' });
      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(false);
    });

    it('transforma cualquier otro string → undefined', () => {
      const result = gameMechanicQuerySchema.safeParse({ isActive: 'sí' });
      expect(result.success).toBe(true);
      expect(result.data.isActive).toBeUndefined();
    });

    it('acepta sortBy=displayName', () => {
      expect(gameMechanicQuerySchema.safeParse({ sortBy: 'displayName' }).success).toBe(true);
    });

    it('rechaza sortBy desconocido', () => {
      expect(gameMechanicQuerySchema.safeParse({ sortBy: 'foo' }).success).toBe(false);
    });
  });

  describe('gameMechanicParamsSchema (union)', () => {
    it('acepta ObjectId', () => {
      expect(gameMechanicParamsSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
    });

    it('acepta slug', () => {
      expect(gameMechanicParamsSchema.safeParse({ id: 'memory' }).success).toBe(true);
    });

    it('rechaza valor con espacios', () => {
      expect(gameMechanicParamsSchema.safeParse({ id: 'Invalid Name' }).success).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(gameMechanicParamsSchema.safeParse({ id: 'memory', extra: 1 }).success).toBe(false);
    });
  });
});
