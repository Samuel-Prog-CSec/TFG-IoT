/**
 * @fileoverview Builder unificado del `final_summary` por mecánica (ADR-B).
 *
 * Hasta esta sesión, sólo Secuencia tenía un builder dedicado
 * (`sequenceFlow.buildSequenceFinalSummary`). Memoria y Asociación se
 * apoyaban en las métricas genéricas del modelo `GamePlay` (totalAttempts,
 * correctAttempts, …), perdiendo señal pedagógica como "mejor racha",
 * "tiempo medio por pareja" o "categoría dominante".
 *
 * Este módulo expone:
 *  - `buildFinalSummary(mechanicType, playState)` — factory público.
 *  - `buildMemoryFinalSummary(playState)`.
 *  - `buildAssociationFinalSummary(playState)`.
 *  - `buildSequenceFinalSummary(playState)` — re-export del módulo legacy
 *    para que los callers pasen por una única puerta.
 *
 * Cada builder devuelve un objeto plano que el GameEngine fusiona con
 * `playDoc.metrics.toObject()` antes de emitir `game_over`. Si la mecánica
 * no se reconoce, devuelve `{}` para que el caller siga emitiendo el
 * payload sin métricas específicas (degradación segura).
 *
 * @module services/gameEngine/finalSummary
 */

const sequenceFlow = require('./sequenceFlow');

/**
 * Determina el slug de mayor accuracy a partir del mapa byValueAccuracy
 * generado por la AssociationStrategy. Sólo considera entradas con
 * `total > 0` Y `correct > 0` — si el alumno no acertó ninguna tarjeta de
 * ese slug, no es su "categoría más fuerte". Empate: la primera clave en
 * orden alfabético gana.
 *
 * Fix QA 2026-05-12: antes la función devolvía la primera clave alfabética
 * cuando todas tenían ratio=0 (correct=0). El GameOver mostraba entonces
 * una "categoría más fuerte" arbitraria al alumno sin aciertos — confuso
 * pedagógicamente. Ahora sólo se considera dominante un slug si fue
 * realmente acertado al menos una vez.
 *
 * @param {Object<string, {correct:number,total:number}>} byValueAccuracy
 * @returns {string|null}
 */
function computeCategoryDominance(byValueAccuracy) {
  if (!byValueAccuracy || typeof byValueAccuracy !== 'object') {
    return null;
  }

  let bestSlug = null;
  let bestRatio = -1;

  const slugs = Object.keys(byValueAccuracy).sort();
  // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
  for (const slug of slugs) {
    const stats = byValueAccuracy[slug] || {};
    const total = Number(stats.total || 0);
    if (total <= 0) {
      continue;
    }
    const correct = Number(stats.correct || 0);
    if (correct <= 0) {
      // Sin aciertos en esta categoria: no puede ser "la mas fuerte".
      continue;
    }
    const ratio = correct / total;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestSlug = slug;
    }
  }

  return bestSlug;
}

/**
 * Construye las métricas finales específicas de Memoria.
 *
 * @param {Object} playState
 * @returns {Object}
 */
function buildMemoryFinalSummary(playState) {
  const state = playState?.strategyState || {};
  const totalMatches = Number(state.totalMatches || 0);
  const totalMatchTimeMs = Number(state.totalMatchTimeMs || 0);
  const peakStreak = Number(state.peakStreak || 0);
  const averageMatchTimeMs = totalMatches > 0 ? Math.round(totalMatchTimeMs / totalMatches) : 0;
  const attemptsToFirstMatch =
    state.firstMatchAtAttempt === undefined ? null : state.firstMatchAtAttempt;
  const groupSize = Number(state.matchingGroupSize || 2);

  return {
    groupsMatched: totalMatches,
    peakStreak,
    averageMatchTimeMs,
    attemptsToFirstMatch,
    groupSize
  };
}

/**
 * Construye las métricas finales específicas de Asociación.
 *
 * @param {Object} playState
 * @returns {Object}
 */
function buildAssociationFinalSummary(playState) {
  const state = playState?.strategyState || {};
  const byValueAccuracy =
    state.byValueAccuracy && typeof state.byValueAccuracy === 'object' ? state.byValueAccuracy : {};

  // Clonar para no exponer referencias internas mutables del strategyState.
  const clonedAccuracy = {};
  for (const [slug, stats] of Object.entries(byValueAccuracy)) {
    clonedAccuracy[slug] = {
      correct: Number(stats?.correct || 0),
      total: Number(stats?.total || 0)
    };
  }

  return {
    peakStreak: Number(state.peakStreak || 0),
    quickestCorrectMs: state.quickestCorrectMs ?? null,
    slowestCorrectMs: state.slowestCorrectMs ?? null,
    byValueAccuracy: clonedAccuracy,
    categoryDominance: computeCategoryDominance(clonedAccuracy)
  };
}

/**
 * Re-export del builder de Secuencia para que los callers tengan una sola
 * puerta. La lógica vive en `sequenceFlow.js` por simetría con su flujo
 * propio (memorizing/reproducing) que también vive ahí.
 *
 * @param {Object} playState
 * @returns {Object}
 */
function buildSequenceFinalSummary(playState) {
  return sequenceFlow.buildSequenceFinalSummary(playState);
}

/**
 * Devuelve las métricas del final_summary apropiadas para la mecánica
 * indicada. Si no se reconoce, devuelve `{}` para que el caller pueda
 * emitir el payload sin contaminar.
 *
 * @param {string} mechanicType - 'memory' | 'association' | 'sequence'.
 * @param {Object} playState
 * @returns {Object}
 */
function buildFinalSummary(mechanicType, playState) {
  switch (mechanicType) {
    case 'memory':
      return buildMemoryFinalSummary(playState);
    case 'association':
      return buildAssociationFinalSummary(playState);
    case 'sequence':
      return buildSequenceFinalSummary(playState);
    default:
      return {};
  }
}

module.exports = {
  buildFinalSummary,
  buildMemoryFinalSummary,
  buildAssociationFinalSummary,
  buildSequenceFinalSummary,
  computeCategoryDominance
};
