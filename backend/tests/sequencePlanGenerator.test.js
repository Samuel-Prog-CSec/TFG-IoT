/**
 * @fileoverview Tests del generador de planes para Secuencia.
 */

const { generateSequencePlan, isPlanCompatible } = require('../src/services/sequencePlanGenerator');

const buildMappings = (count = 10) =>
  Array.from({ length: count }, (_, i) => ({
    uid: `AA00000${i.toString(16).padStart(2, '0').toUpperCase()}`,
    assignedValue: `Concept-${i + 1}`,
    displayData: { display: `Display-${i + 1}` }
  }));

describe('generateSequencePlan', () => {
  it('genera el número exacto de rondas pedidas', () => {
    const plan = generateSequencePlan(buildMappings(8), {
      numberOfRounds: 5,
      minLength: 3,
      maxLength: 5
    });
    expect(plan).toHaveLength(5);
    plan.forEach((round, index) => {
      expect(round.roundNumber).toBe(index + 1);
    });
  });

  it('respeta la longitud mínima y máxima por ronda', () => {
    const plan = generateSequencePlan(buildMappings(10), {
      numberOfRounds: 20,
      minLength: 3,
      maxLength: 7,
      seed: 1234
    });
    plan.forEach(round => {
      expect(round.length).toBeGreaterThanOrEqual(3);
      expect(round.length).toBeLessThanOrEqual(7);
      expect(round.sequence).toHaveLength(round.length);
    });
  });

  it('no repite UIDs dentro de una misma secuencia', () => {
    const plan = generateSequencePlan(buildMappings(10), {
      numberOfRounds: 10,
      minLength: 4,
      maxLength: 7,
      seed: 99
    });
    plan.forEach(round => {
      const uids = round.sequence.map(item => item.uid);
      expect(new Set(uids).size).toBe(uids.length);
    });
  });

  it('clampa longitud al tamaño del mazo si maxLength excede', () => {
    const plan = generateSequencePlan(buildMappings(3), {
      numberOfRounds: 5,
      minLength: 2,
      maxLength: 10
    });
    plan.forEach(round => {
      expect(round.length).toBeLessThanOrEqual(3);
      expect(round.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('es determinista cuando se pasa una seed', () => {
    const args = { numberOfRounds: 4, minLength: 3, maxLength: 5, seed: 42 };
    const planA = generateSequencePlan(buildMappings(8), args);
    const planB = generateSequencePlan(buildMappings(8), args);
    expect(planA).toEqual(planB);
  });

  it('devuelve plan vacío si no hay mappings', () => {
    expect(generateSequencePlan([], { numberOfRounds: 3, minLength: 3, maxLength: 5 })).toEqual([]);
    expect(generateSequencePlan(null, { numberOfRounds: 3, minLength: 3, maxLength: 5 })).toEqual(
      []
    );
  });

  it('devuelve plan vacío si rounds < 1', () => {
    expect(
      generateSequencePlan(buildMappings(5), { numberOfRounds: 0, minLength: 3, maxLength: 5 })
    ).toEqual([]);
  });

  it('clona displayData para no mutar el origen', () => {
    const mappings = buildMappings(3);
    const plan = generateSequencePlan(mappings, {
      numberOfRounds: 1,
      minLength: 3,
      maxLength: 3,
      seed: 1
    });
    plan[0].sequence[0].displayData.display = 'modified';
    expect(mappings[0].displayData.display).not.toBe('modified');
  });
});

describe('isPlanCompatible', () => {
  const mappings = buildMappings(5);
  const compatibleOptions = { numberOfRounds: 3, minLength: 3, maxLength: 5 };

  it('reconoce un plan válido', () => {
    const plan = generateSequencePlan(mappings, { ...compatibleOptions, seed: 7 });
    expect(isPlanCompatible(plan, mappings, compatibleOptions)).toBe(true);
  });

  it('rechaza si rounds difieren', () => {
    const plan = generateSequencePlan(mappings, { ...compatibleOptions, seed: 7 });
    expect(isPlanCompatible(plan, mappings, { ...compatibleOptions, numberOfRounds: 5 })).toBe(
      false
    );
  });

  it('rechaza si una secuencia contiene UID inexistente en el mazo', () => {
    const plan = generateSequencePlan(mappings, { ...compatibleOptions, seed: 7 });
    plan[0].sequence[0].uid = 'FFFFFFFF';
    expect(isPlanCompatible(plan, mappings, compatibleOptions)).toBe(false);
  });

  it('rechaza si longitud sale del rango', () => {
    const plan = generateSequencePlan(mappings, { ...compatibleOptions, seed: 7 });
    expect(
      isPlanCompatible(plan, mappings, { ...compatibleOptions, minLength: 6, maxLength: 7 })
    ).toBe(false);
  });

  it('rechaza si plan está vacío', () => {
    expect(isPlanCompatible([], mappings, compatibleOptions)).toBe(false);
    expect(isPlanCompatible(null, mappings, compatibleOptions)).toBe(false);
  });
});
