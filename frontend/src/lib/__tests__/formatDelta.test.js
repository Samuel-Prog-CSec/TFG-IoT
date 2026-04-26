import { describe, it, expect } from 'vitest';
import { formatDelta, isNeutralDelta } from '../formatDelta';

describe('formatDelta (PROP-88)', () => {
  describe('sin baseline → "—"', () => {
    it('previous = 0 devuelve "—"', () => {
      expect(formatDelta(15, 0)).toBe('—');
    });

    it('previous = null devuelve "—"', () => {
      expect(formatDelta(15, null)).toBe('—');
    });

    it('previous = undefined devuelve "—"', () => {
      expect(formatDelta(15, undefined)).toBe('—');
    });

    it('previous = NaN devuelve "—"', () => {
      expect(formatDelta(15, Number.NaN)).toBe('—');
    });

    it('previous = Infinity devuelve "—"', () => {
      expect(formatDelta(15, Number.POSITIVE_INFINITY)).toBe('—');
    });
  });

  describe('current inválido → "—"', () => {
    it('current = null devuelve "—"', () => {
      expect(formatDelta(null, 10)).toBe('—');
    });

    it('current = NaN devuelve "—"', () => {
      expect(formatDelta(Number.NaN, 10)).toBe('—');
    });
  });

  describe('cálculo del delta', () => {
    it('subida: prev=10, curr=15 → "+50%"', () => {
      expect(formatDelta(15, 10)).toBe('+50%');
    });

    it('bajada: prev=10, curr=8 → "-20%"', () => {
      expect(formatDelta(8, 10)).toBe('-20%');
    });

    it('igualdad: prev=10, curr=10 → "0%"', () => {
      expect(formatDelta(10, 10)).toBe('0%');
    });

    it('redondea a un decimal', () => {
      // (15 - 13) / 13 * 100 = 15.384...
      expect(formatDelta(15, 13)).toBe('+15.4%');
    });

    it('omite decimales si no aportan info', () => {
      // (12 - 10) / 10 * 100 = 20.0 → "+20%" (no "+20.0%")
      expect(formatDelta(12, 10)).toBe('+20%');
    });

    it('previous negativo: usa Math.abs para el porcentaje', () => {
      // (-5 - (-10)) / 10 * 100 = +50% (mejora desde -10 hasta -5)
      expect(formatDelta(-5, -10)).toBe('+50%');
    });
  });
});

describe('isNeutralDelta', () => {
  it('reconoce el carácter "—"', () => {
    expect(isNeutralDelta('—')).toBe(true);
  });

  it('reconoce el guión simple "-" como neutro', () => {
    expect(isNeutralDelta('-')).toBe(true);
  });

  it('"+5%" no es neutro', () => {
    expect(isNeutralDelta('+5%')).toBe(false);
  });

  it('vacío no es neutro', () => {
    expect(isNeutralDelta('')).toBe(false);
  });
});
