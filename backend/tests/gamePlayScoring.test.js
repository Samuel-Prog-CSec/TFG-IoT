/**
 * @fileoverview Tests unitarios del cálculo puro del techo de puntuación
 * (`computeMaxScore`). Cubre el camino explícito por `mechanicType` y el
 * fallback por "huella de datos" (sesiones legacy sin migrar), incluyendo la
 * regresión del bug ALTO de Asociación (boardLayout no debe clasificarla como
 * Memoria).
 */
const {
  computeMaxScore,
  toMechanicType,
  MECHANIC_TYPES
} = require('../src/services/gamePlayScoring');

describe('toMechanicType — normaliza el nombre de mecánica al enum (o null)', () => {
  it('devuelve el tipo base en minúsculas', () => {
    expect(toMechanicType('association')).toBe('association');
    expect(toMechanicType('Memory')).toBe('memory');
    expect(toMechanicType(' SEQUENCE ')).toBe('sequence');
  });
  it('devuelve null para mecánicas custom/desconocidas (no rompe el enum)', () => {
    expect(toMechanicType('test-mechanic')).toBeNull();
    expect(toMechanicType('')).toBeNull();
    expect(toMechanicType(null)).toBeNull();
    expect(toMechanicType(undefined)).toBeNull();
  });
});

describe('computeMaxScore — techo de puntuación por mecánica', () => {
  const cfg = (numberOfRounds, pointsPerCorrect) => ({
    config: { numberOfRounds, pointsPerCorrect }
  });
  const board = n => Array.from({ length: n }, (_, i) => ({ slot: i }));

  describe('por mechanicType explícito', () => {
    it('Asociación = rondas × puntos (aunque haya boardLayout: regresión bug ALTO)', () => {
      const session = { mechanicType: 'association', ...cfg(6, 10), boardLayout: board(12) };
      expect(computeMaxScore(session)).toBe(60); // 6×10, NO 30 (12/2×10)
    });

    it('Memoria = parejas × puntos', () => {
      const session = { mechanicType: 'memory', ...cfg(1, 10), boardLayout: board(12) };
      expect(computeMaxScore(session)).toBe(60); // 6 parejas × 10
    });

    it('Memoria con matchingGroupSize=3 (tríos) = ⌊N/3⌋ × puntos (regresión B-H2/ADR-222)', () => {
      const session = {
        mechanicType: 'memory',
        ...cfg(1, 10),
        boardLayout: board(6),
        mechanicId: { rules: { behavior: { matchingGroupSize: 3 } } }
      };
      // 6 cartas / 3 = 2 grupos × 10 = 20. El bug hardcodeaba ÷2 → 30, techo
      // inalcanzable (una partida perfecta de tríos solo llegaba a 20/30 = 67%).
      expect(computeMaxScore(session)).toBe(20);
    });

    it('Secuencia = Σ longitud × puntos', () => {
      const session = {
        mechanicType: 'sequence',
        ...cfg(2, 15),
        sequencePlan: [{ length: 3 }, { length: 4 }]
      };
      expect(computeMaxScore(session)).toBe(105); // (3+4)×15
    });
  });

  describe('fallback por huella cuando falta mechanicType (legacy)', () => {
    it('infiere Asociación por associationChallengePlan aun con boardLayout', () => {
      const session = {
        ...cfg(6, 10),
        associationChallengePlan: [{ round: 1 }],
        boardLayout: board(12)
      };
      expect(computeMaxScore(session)).toBe(60);
    });

    it('infiere Memoria solo por boardLayout', () => {
      const session = { ...cfg(1, 10), boardLayout: board(8) };
      expect(computeMaxScore(session)).toBe(40); // 4 parejas × 10
    });

    it('infiere Secuencia por sequencePlan', () => {
      const session = { ...cfg(1, 10), sequencePlan: [{ length: 5 }] };
      expect(computeMaxScore(session)).toBe(50);
    });

    it('fallback genérico rondas × puntos sin ninguna huella', () => {
      expect(computeMaxScore({ ...cfg(3, 10) })).toBe(30);
    });
  });

  describe('robustez', () => {
    it('nunca devuelve menos de 1', () => {
      expect(computeMaxScore({ mechanicType: 'association', config: {} })).toBeGreaterThanOrEqual(
        1
      );
    });

    it('mechanicType inválido cae al fallback genérico', () => {
      expect(computeMaxScore({ mechanicType: 'zzz', ...cfg(4, 10) })).toBe(40);
    });

    it('expone el enum de tipos', () => {
      expect(MECHANIC_TYPES).toEqual({
        ASSOCIATION: 'association',
        SEQUENCE: 'sequence',
        MEMORY: 'memory'
      });
    });
  });
});
