/**
 * @fileoverview Tests del normalizador de resumen final.
 * Extraído en Sprint 0 pre-v1.0.0 (C2 parcial). Cubre las 3 mecánicas
 * y las inconsistencias conocidas (errorAttempts/correctAttempts vs reducer
 * local, completionTime/totalTimePlayed/playDuration, maxScore inválido).
 */

import { describe, it, expect } from 'vitest';
import { normalizeFinalSummary } from '../finalSummary';

describe('normalizeFinalSummary', () => {
  it('usa metrics.errorAttempts cuando está presente (no calcula con correctAnswers)', () => {
    const summary = normalizeFinalSummary(
      { totalAttempts: 8, errorAttempts: 2, correctAttempts: 6, completionTime: 60_000 },
      45,
      6,
      'association',
      null,
      100
    );
    expect(summary.errors).toBe(2);
    expect(summary.correctAnswers).toBe(6);
    expect(summary.attempts).toBe(8);
    expect(summary.maxScore).toBe(100);
  });

  it('fallback a totalAttempts-correctAnswers cuando metrics.errorAttempts no viene', () => {
    const summary = normalizeFinalSummary(
      { totalAttempts: 5 },
      30,
      3,
      'association',
      null
    );
    expect(summary.errors).toBe(2);
    expect(summary.correctAnswers).toBe(3);
  });

  it('acepta playDuration y totalTimePlayed como alias de completionTime', () => {
    const fromCompletion = normalizeFinalSummary(
      { completionTime: 120_000 },
      0,
      0,
      'memory',
      null
    );
    const fromTotalTimePlayed = normalizeFinalSummary(
      { totalTimePlayed: 120_000 },
      0,
      0,
      'memory',
      null
    );
    const fromPlayDuration = normalizeFinalSummary(
      { playDuration: 120_000 },
      0,
      0,
      'memory',
      null
    );
    expect(fromCompletion.totalTimePlayed).toBe(120_000);
    expect(fromTotalTimePlayed.totalTimePlayed).toBe(120_000);
    expect(fromPlayDuration.totalTimePlayed).toBe(120_000);
  });

  it('si no hay tiempo del backend, calcula desde gameStartTime', () => {
    const start = Date.now() - 5_000;
    const summary = normalizeFinalSummary({}, 0, 0, 'sequence', start);
    expect(summary.totalTimePlayed).toBeGreaterThanOrEqual(4_500);
    expect(summary.totalTimePlayed).toBeLessThan(6_000);
  });

  it('descarta maxScore inválido (no número, <=0)', () => {
    const bad = [null, undefined, NaN, 0, -50, 'no'];
    for (const value of bad) {
      const summary = normalizeFinalSummary({}, 0, 0, 'association', null, value);
      expect(summary.maxScore).toBeNull();
    }
  });

  it('mecánica sequence incluye contadores específicos', () => {
    const summary = normalizeFinalSummary(
      {
        totalAttempts: 6,
        sequencesCompleted: 4,
        sequencesBlocked: 1,
        sequencesTimedOut: 1,
        maxSequenceLengthAchieved: 5,
        partialReproductions: 2,
        partialRounds: 1,
        averageReproductionTimeMs: 2500,
        blockedCardsTotal: 3,
        hintsUsed: 1
      },
      80,
      4,
      'sequence',
      null
    );
    expect(summary.sequencesCompleted).toBe(4);
    expect(summary.maxSequenceLengthAchieved).toBe(5);
    expect(summary.hintsUsed).toBe(1);
  });

  it('mecánica memory anida sub-objeto memory cuando viene del backend', () => {
    const summary = normalizeFinalSummary(
      {
        totalAttempts: 12,
        memory: {
          groupsMatched: 6,
          peakStreak: 3,
          averageMatchTimeMs: 1800,
          attemptsToFirstMatch: 4,
          groupSize: 2
        }
      },
      90,
      6,
      'memory',
      null
    );
    expect(summary.memory.groupsMatched).toBe(6);
    expect(summary.memory.peakStreak).toBe(3);
    expect(summary.memory.attemptsToFirstMatch).toBe(4);
  });

  it('mecánica association anida sub-objeto association con byValueAccuracy', () => {
    const summary = normalizeFinalSummary(
      {
        totalAttempts: 10,
        association: {
          peakStreak: 5,
          quickestCorrectMs: 1200,
          slowestCorrectMs: 4500,
          byValueAccuracy: { perro: 100, gato: 75 },
          categoryDominance: 'perro'
        }
      },
      75,
      8,
      'association',
      null
    );
    expect(summary.association.peakStreak).toBe(5);
    expect(summary.association.categoryDominance).toBe('perro');
    expect(summary.association.byValueAccuracy.perro).toBe(100);
  });

  it('rawMetrics null/undefined/no-objeto no rompe (fallback seguro)', () => {
    expect(normalizeFinalSummary(null, 0, 0, 'association', null)).toMatchObject({
      score: 0,
      errors: 0,
      attempts: 0,
      mode: 'association'
    });
    expect(normalizeFinalSummary(undefined, 0, 0, 'memory', null)).toMatchObject({
      mode: 'memory'
    });
    expect(normalizeFinalSummary('cadena-no-objeto', 0, 0, 'sequence', null)).toMatchObject({
      mode: 'sequence'
    });
  });
});
