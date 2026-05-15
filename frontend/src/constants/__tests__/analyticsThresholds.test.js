/**
 * @fileoverview Tests unitarios para el modulo de umbrales de analytics.
 *
 * Cubre las constantes PERFORMANCE_TIERS, TIER_CONFIG y TIER_BADGE,
 * asi como las funciones de clasificacion scoreToTier, scoreToRAG,
 * getRAGCSSColor y scoreToRAGWithNull.
 */

import { describe, it, expect } from 'vitest';

import {
  PERFORMANCE_TIERS,
  TIER_CONFIG,
  TIER_BADGE,
  scoreToTier,
  scoreToRAG,
  getRAGCSSColor,
  scoreToRAGWithNull,
} from '../analyticsThresholds';

// ──────────────────────────────────────────────────────────────────────
// Constantes
// ──────────────────────────────────────────────────────────────────────

describe('PERFORMANCE_TIERS', () => {
  it('debe contener exactamente 4 tiers', () => {
    expect(PERFORMANCE_TIERS).toHaveLength(4);
  });

  it('debe cubrir el rango completo 0-100 sin huecos', () => {
    const sorted = PERFORMANCE_TIERS.toSorted((a, b) => a.min - b.min);

    expect(sorted[0].min).toBe(0);
    expect(sorted[sorted.length - 1].max).toBe(100);

    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].min).toBe(sorted[i - 1].max + 1);
    }
  });

  it('debe incluir los tiers risk, average, good y excellent', () => {
    const tierNames = PERFORMANCE_TIERS.map((t) => t.tier);
    expect(tierNames).toContain('risk');
    expect(tierNames).toContain('average');
    expect(tierNames).toContain('good');
    expect(tierNames).toContain('excellent');
  });
});

describe('TIER_CONFIG', () => {
  it('debe tener las 4 claves de tier', () => {
    expect(Object.keys(TIER_CONFIG)).toEqual(
      expect.arrayContaining(['excellent', 'good', 'average', 'risk'])
    );
  });

  it('cada tier debe tener label y className', () => {
    for (const key of Object.keys(TIER_CONFIG)) {
      expect(TIER_CONFIG[key]).toHaveProperty('label');
      expect(TIER_CONFIG[key]).toHaveProperty('className');
      expect(typeof TIER_CONFIG[key].label).toBe('string');
      expect(typeof TIER_CONFIG[key].className).toBe('string');
    }
  });
});

describe('TIER_BADGE', () => {
  it('debe tener las 4 claves de tier', () => {
    expect(Object.keys(TIER_BADGE)).toEqual(
      expect.arrayContaining(['excellent', 'good', 'average', 'risk'])
    );
  });

  it('risk debe tener label "Bajo" y average "Medio"', () => {
    expect(TIER_BADGE.risk.label).toBe('Bajo');
    expect(TIER_BADGE.average.label).toBe('Medio');
  });
});

// ──────────────────────────────────────────────────────────────────────
// scoreToTier
// ──────────────────────────────────────────────────────────────────────

describe('scoreToTier', () => {
  // Valores nulos e invalidos
  it('debe devolver "risk" para null', () => {
    expect(scoreToTier(null)).toBe('risk');
  });

  it('debe devolver "risk" para undefined', () => {
    expect(scoreToTier(undefined)).toBe('risk');
  });

  it('debe devolver "risk" para valores negativos', () => {
    expect(scoreToTier(-1)).toBe('risk');
    expect(scoreToTier(-100)).toBe('risk');
  });

  // Boundaries exactos
  it('debe devolver "risk" para 0', () => {
    expect(scoreToTier(0)).toBe('risk');
  });

  it('debe devolver "risk" para 49', () => {
    expect(scoreToTier(49)).toBe('risk');
  });

  it('debe devolver "average" para 50', () => {
    expect(scoreToTier(50)).toBe('average');
  });

  it('debe devolver "average" para 69', () => {
    expect(scoreToTier(69)).toBe('average');
  });

  it('debe devolver "good" para 70', () => {
    expect(scoreToTier(70)).toBe('good');
  });

  it('debe devolver "good" para 89', () => {
    expect(scoreToTier(89)).toBe('good');
  });

  it('debe devolver "excellent" para 90', () => {
    expect(scoreToTier(90)).toBe('excellent');
  });

  it('debe devolver "excellent" para 100', () => {
    expect(scoreToTier(100)).toBe('excellent');
  });
});

// ──────────────────────────────────────────────────────────────────────
// scoreToRAG
// ──────────────────────────────────────────────────────────────────────

describe('scoreToRAG', () => {
  it('debe devolver "red" para null', () => {
    expect(scoreToRAG(null)).toBe('red');
  });

  it('debe devolver "red" para undefined', () => {
    expect(scoreToRAG(undefined)).toBe('red');
  });

  it('debe devolver "red" para scores < 50', () => {
    expect(scoreToRAG(0)).toBe('red');
    expect(scoreToRAG(49)).toBe('red');
  });

  it('debe devolver "amber" para scores entre 50 y 69', () => {
    expect(scoreToRAG(50)).toBe('amber');
    expect(scoreToRAG(69)).toBe('amber');
  });

  it('debe devolver "green" para scores >= 70', () => {
    expect(scoreToRAG(70)).toBe('green');
    expect(scoreToRAG(100)).toBe('green');
  });
});

// ──────────────────────────────────────────────────────────────────────
// getRAGCSSColor
// ──────────────────────────────────────────────────────────────────────

describe('getRAGCSSColor', () => {
  it('debe devolver color de error para scores < 50', () => {
    expect(getRAGCSSColor(0)).toBe('var(--color-error-base)');
    expect(getRAGCSSColor(49)).toBe('var(--color-error-base)');
  });

  it('debe devolver color de warning para scores entre 50 y 69', () => {
    expect(getRAGCSSColor(50)).toBe('var(--color-warning-base)');
    expect(getRAGCSSColor(69)).toBe('var(--color-warning-base)');
  });

  it('debe devolver color de success para scores >= 70', () => {
    expect(getRAGCSSColor(70)).toBe('var(--color-success-base)');
    expect(getRAGCSSColor(100)).toBe('var(--color-success-base)');
  });

  it('debe devolver color de success para el boundary exacto 90', () => {
    expect(getRAGCSSColor(90)).toBe('var(--color-success-base)');
  });
});

// ──────────────────────────────────────────────────────────────────────
// scoreToRAGWithNull
// ──────────────────────────────────────────────────────────────────────

describe('scoreToRAGWithNull', () => {
  it('debe devolver "gray" para null', () => {
    expect(scoreToRAGWithNull(null)).toBe('gray');
  });

  it('debe devolver "gray" para undefined', () => {
    expect(scoreToRAGWithNull(undefined)).toBe('gray');
  });

  it('debe devolver "gray" para NaN', () => {
    expect(scoreToRAGWithNull(NaN)).toBe('gray');
  });

  it('debe devolver "red" para scores < 50', () => {
    expect(scoreToRAGWithNull(0)).toBe('red');
    expect(scoreToRAGWithNull(49)).toBe('red');
  });

  it('debe devolver "amber" para scores entre 50 y 69', () => {
    expect(scoreToRAGWithNull(50)).toBe('amber');
    expect(scoreToRAGWithNull(69)).toBe('amber');
  });

  it('debe devolver "green" para scores >= 70', () => {
    expect(scoreToRAGWithNull(70)).toBe('green');
    expect(scoreToRAGWithNull(100)).toBe('green');
  });
});
