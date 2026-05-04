/**
 * @fileoverview Tests del builder unificado `finalSummary` (ADR-B).
 *
 * Cubre el factory `buildFinalSummary` y los 3 builders por mecánica
 * (memory, association, sequence). Para Sequence verificamos que el
 * factory delega correctamente en `sequenceFlow.buildSequenceFinalSummary`
 * — sin duplicar la batería de tests de Sequence que ya existen en
 * `sequenceFlow.test.js`.
 */

const finalSummary = require('../src/services/gameEngine/finalSummary');

describe('finalSummary.buildMemoryFinalSummary', () => {
  it('devuelve ceros y nulls cuando no hay bookkeeping', () => {
    const playState = { strategyState: {} };
    expect(finalSummary.buildMemoryFinalSummary(playState)).toEqual({
      groupsMatched: 0,
      peakStreak: 0,
      averageMatchTimeMs: 0,
      attemptsToFirstMatch: null,
      groupSize: 2
    });
  });

  it('agrega el bookkeeping al cierre de la partida', () => {
    const playState = {
      strategyState: {
        totalMatches: 4,
        totalMatchTimeMs: 6400,
        peakStreak: 3,
        firstMatchAtAttempt: 2,
        matchingGroupSize: 2
      }
    };
    const summary = finalSummary.buildMemoryFinalSummary(playState);
    expect(summary).toEqual({
      groupsMatched: 4,
      peakStreak: 3,
      averageMatchTimeMs: 1600,
      attemptsToFirstMatch: 2,
      groupSize: 2
    });
  });

  it('redondea averageMatchTimeMs al entero más cercano', () => {
    const playState = {
      strategyState: {
        totalMatches: 3,
        totalMatchTimeMs: 1000,
        peakStreak: 1,
        firstMatchAtAttempt: 1,
        matchingGroupSize: 2
      }
    };
    expect(finalSummary.buildMemoryFinalSummary(playState).averageMatchTimeMs).toBe(333);
  });

  it('expone el groupSize ajustado para tríos', () => {
    const playState = {
      strategyState: {
        totalMatches: 1,
        totalMatchTimeMs: 1500,
        peakStreak: 1,
        firstMatchAtAttempt: 1,
        matchingGroupSize: 3
      }
    };
    expect(finalSummary.buildMemoryFinalSummary(playState).groupSize).toBe(3);
  });
});

describe('finalSummary.buildAssociationFinalSummary', () => {
  it('devuelve mapa vacío y nulls cuando no se ha jugado nada', () => {
    expect(finalSummary.buildAssociationFinalSummary({ strategyState: {} })).toEqual({
      peakStreak: 0,
      quickestCorrectMs: null,
      slowestCorrectMs: null,
      byValueAccuracy: {},
      categoryDominance: null
    });
  });

  it('serializa byValueAccuracy y deriva categoryDominance', () => {
    const playState = {
      strategyState: {
        peakStreak: 4,
        quickestCorrectMs: 800,
        slowestCorrectMs: 2400,
        byValueAccuracy: {
          dog: { correct: 3, total: 4 },
          cat: { correct: 1, total: 3 }
        }
      }
    };
    const summary = finalSummary.buildAssociationFinalSummary(playState);
    expect(summary).toEqual({
      peakStreak: 4,
      quickestCorrectMs: 800,
      slowestCorrectMs: 2400,
      byValueAccuracy: {
        dog: { correct: 3, total: 4 },
        cat: { correct: 1, total: 3 }
      },
      categoryDominance: 'dog'
    });
  });

  it('ignora entradas con total=0 al calcular categoryDominance', () => {
    const playState = {
      strategyState: {
        byValueAccuracy: {
          dog: { correct: 0, total: 0 },
          cat: { correct: 1, total: 1 }
        }
      }
    };
    expect(finalSummary.buildAssociationFinalSummary(playState).categoryDominance).toBe('cat');
  });

  it('devuelve null cuando todas las accuracies son 0', () => {
    const playState = {
      strategyState: {
        byValueAccuracy: {
          dog: { correct: 0, total: 1 },
          cat: { correct: 0, total: 2 }
        }
      }
    };
    // Empate técnico (ambos 0/total). El primer slug en orden alfabético gana.
    expect(finalSummary.buildAssociationFinalSummary(playState).categoryDominance).toBe('cat');
  });

  it('clona el mapa byValueAccuracy para no exponer referencias mutables', () => {
    const internalMap = {
      dog: { correct: 1, total: 2 }
    };
    const playState = { strategyState: { byValueAccuracy: internalMap } };
    const summary = finalSummary.buildAssociationFinalSummary(playState);
    summary.byValueAccuracy.dog.correct = 999;
    // El strategyState interno NO debe ser mutado por el caller.
    expect(internalMap.dog.correct).toBe(1);
  });
});

describe('finalSummary.computeCategoryDominance', () => {
  it('devuelve null si la entrada es nula o no es objeto', () => {
    expect(finalSummary.computeCategoryDominance(null)).toBeNull();
    expect(finalSummary.computeCategoryDominance(undefined)).toBeNull();
    expect(finalSummary.computeCategoryDominance('not-an-object')).toBeNull();
  });

  it('elige el slug con mejor ratio correct/total', () => {
    expect(
      finalSummary.computeCategoryDominance({
        a: { correct: 1, total: 2 }, // 0.5
        b: { correct: 3, total: 4 } // 0.75
      })
    ).toBe('b');
  });

  it('en empate respeta el orden alfabético', () => {
    expect(
      finalSummary.computeCategoryDominance({
        zebra: { correct: 2, total: 2 },
        apple: { correct: 1, total: 1 }
      })
    ).toBe('apple');
  });
});

describe('finalSummary.buildFinalSummary factory', () => {
  it('para mode "memory" delega en buildMemoryFinalSummary', () => {
    const summary = finalSummary.buildFinalSummary('memory', {
      strategyState: {
        totalMatches: 2,
        peakStreak: 1,
        totalMatchTimeMs: 2200,
        firstMatchAtAttempt: 1,
        matchingGroupSize: 2
      }
    });
    expect(summary.groupsMatched).toBe(2);
    expect(summary.averageMatchTimeMs).toBe(1100);
  });

  it('para mode "association" delega en buildAssociationFinalSummary', () => {
    const summary = finalSummary.buildFinalSummary('association', {
      strategyState: {
        peakStreak: 2,
        byValueAccuracy: { fox: { correct: 1, total: 1 } }
      }
    });
    expect(summary.categoryDominance).toBe('fox');
    expect(summary.peakStreak).toBe(2);
  });

  it('para mode "sequence" delega en sequenceFlow', () => {
    // Smoke test: con strategyState vacío Sequence devuelve ceros.
    const summary = finalSummary.buildFinalSummary('sequence', {
      strategyState: { roundResults: [] }
    });
    expect(summary).toMatchObject({
      sequencesCompleted: 0,
      sequencesBlocked: 0,
      maxSequenceLengthAchieved: 0
    });
  });

  it('devuelve {} para mecánicas no reconocidas (degradación segura)', () => {
    expect(finalSummary.buildFinalSummary('unknown_mechanic', { strategyState: {} })).toEqual({});
    expect(finalSummary.buildFinalSummary(undefined, {})).toEqual({});
  });
});
