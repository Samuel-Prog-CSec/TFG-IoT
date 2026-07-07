import { describe, it, expect } from 'vitest';
import { getId, sameId, findById } from '../entityId';

describe('entityId', () => {
  describe('getId', () => {
    it('prioriza id sobre _id', () => {
      expect(getId({ id: 'a', _id: 'b' })).toBe('a');
    });
    it('cae a _id cuando no hay id', () => {
      expect(getId({ _id: 'b' })).toBe('b');
    });
    it('null/undefined/sin id -> null', () => {
      expect(getId(null)).toBeNull();
      expect(getId(undefined)).toBeNull();
      expect(getId({})).toBeNull();
    });
    it('normaliza a string un id no-string (ObjectId-like con toString)', () => {
      expect(getId({ _id: { toString: () => 'x' } })).toBe('x');
    });
  });

  describe('sameId', () => {
    it('true si resuelven al mismo id aunque difieran id/_id', () => {
      expect(sameId({ id: 'a' }, { _id: 'a' })).toBe(true);
    });
    it('false si distinto id', () => {
      expect(sameId({ id: 'a' }, { id: 'b' })).toBe(false);
    });
    it('false si alguno es null o sin id (no colisiona undefined===undefined)', () => {
      expect(sameId(null, { id: 'a' })).toBe(false);
      expect(sameId({}, {})).toBe(false);
    });
    it('acepta un id string como segundo argumento', () => {
      expect(sameId({ id: 'a' }, 'a')).toBe(true);
      expect(sameId({ id: 'a' }, 'b')).toBe(false);
    });
  });

  describe('findById', () => {
    const list = [
      { id: 'a', n: 1 },
      { _id: 'b', n: 2 }
    ];
    it('encuentra por id string', () => {
      expect(findById(list, 'b')?.n).toBe(2);
    });
    it('encuentra por entidad', () => {
      expect(findById(list, { id: 'a' })?.n).toBe(1);
    });
    it('undefined si no está o lista no-array', () => {
      expect(findById(list, 'z')).toBeUndefined();
      expect(findById(null, 'a')).toBeUndefined();
    });
  });
});
