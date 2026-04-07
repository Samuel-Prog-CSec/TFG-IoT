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

  it('PSEUDO_ID_LENGTH es 8', () => {
    expect(PSEUDO_ID_LENGTH).toBe(8);
  });
});
