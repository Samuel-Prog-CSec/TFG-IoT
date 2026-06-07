const mongoose = require('mongoose');
const { pseudonymize, PSEUDO_ID_LENGTH } = require('../src/utils/pseudonymize');

describe('pseudonymize', () => {
  const sampleId = '507f1f77bcf86cd799439011';
  const anotherId = '507f1f77bcf86cd799439012';

  it('devuelve un string de longitud PSEUDO_ID_LENGTH', () => {
    const result = pseudonymize(sampleId);
    expect(result).toHaveLength(PSEUDO_ID_LENGTH);
  });

  it('devuelve solo caracteres hexadecimales', () => {
    const result = pseudonymize(sampleId);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('es determinista: mismo input produce mismo output', () => {
    const result1 = pseudonymize(sampleId);
    const result2 = pseudonymize(sampleId);
    expect(result1).toBe(result2);
  });

  it('produce resultados distintos para inputs distintos', () => {
    const result1 = pseudonymize(sampleId);
    const result2 = pseudonymize(anotherId);
    expect(result1).not.toBe(result2);
  });

  it('maneja ObjectId de Mongoose correctamente', () => {
    const objectId = new mongoose.Types.ObjectId(sampleId);
    const fromString = pseudonymize(sampleId);
    const fromObjectId = pseudonymize(objectId);
    expect(fromObjectId).toBe(fromString);
  });

  it('devuelve null para input null', () => {
    expect(pseudonymize(null)).toBeNull();
  });

  it('devuelve null para input undefined', () => {
    expect(pseudonymize(undefined)).toBeNull();
  });

  it('devuelve null para string vacío', () => {
    expect(pseudonymize('')).toBeNull();
  });

  it('PSEUDO_ID_LENGTH es 16', () => {
    expect(PSEUDO_ID_LENGTH).toBe(16);
  });

  it('aplica HMAC con clave: el secreto cambia el resultado (no es SHA-256 plano)', () => {
    const original = process.env.PSEUDONYMIZE_SECRET;
    try {
      process.env.PSEUDONYMIZE_SECRET = 'clave-de-prueba-A';
      const keyed = pseudonymize(sampleId);
      const plain = require('node:crypto')
        .createHash('sha256')
        .update(sampleId)
        .digest('hex')
        .slice(0, PSEUDO_ID_LENGTH);
      expect(keyed).not.toBe(plain);
    } finally {
      process.env.PSEUDONYMIZE_SECRET = original;
    }
  });

  it('claves distintas producen pseudoIds distintos para el mismo id', () => {
    const original = process.env.PSEUDONYMIZE_SECRET;
    try {
      process.env.PSEUDONYMIZE_SECRET = 'clave-A';
      const a = pseudonymize(sampleId);
      process.env.PSEUDONYMIZE_SECRET = 'clave-B';
      const b = pseudonymize(sampleId);
      expect(a).not.toBe(b);
    } finally {
      process.env.PSEUDONYMIZE_SECRET = original;
    }
  });
});
