/**
 * @fileoverview Construcción del resumen final de una partida.
 *
 * Extraído de `pages/GameSession.jsx` en Sprint 0 pre-v1.0.0 (C2 parcial)
 * para aislar la lógica pura del JSX. Cubre las 3 mecánicas (association,
 * memory, sequence) y maneja las inconsistencias conocidas:
 *
 *  - `correctAnswers` del reducer local puede llegar desincronizado si el
 *    evento `game_over` se procesa antes que el último `response_*`. Se
 *    prioriza `metrics.correctAttempts` del backend cuando está disponible.
 *  - El backend persiste el tiempo total como `completionTime`. Se aceptan
 *    `totalTimePlayed`/`playDuration` como alias por compatibilidad. Sin
 *    esto, Secuencia caía a "Tiempo total: —" cuando el `new_round` nunca
 *    se emite.
 *  - `maxScore` viene del backend con la fórmula por mecánica (ADR-114) y
 *    se conserva si es un número finito positivo.
 *
 * @module lib/finalSummary
 */

/**
 * @param {Object} rawMetrics
 * @param {number} score
 * @param {number} correctAnswers
 * @param {'association'|'memory'|'sequence'|string} mechanicMode
 * @param {number|null} gameStartTime - epoch ms del inicio local (Date.now())
 * @param {number|null} [maxScore=null] - máximo teórico calculado por backend
 * @returns {Object} summary
 */
// eslint-disable-next-line sonarjs/cyclomatic-complexity -- normalización de resumen final con campos opcionales por mecánica (memory/sequence/association)
export function normalizeFinalSummary(
  rawMetrics,
  score,
  correctAnswers,
  mechanicMode,
  gameStartTime,
  maxScore = null
) {
  const metrics = rawMetrics && typeof rawMetrics === 'object' ? rawMetrics : {};
  const totalAttempts = Number(metrics.totalAttempts || 0);
  const averageResponseTimeMs = Number(metrics.averageResponseTime || 0);

  // Tiempo total: aceptar alias por compatibilidad histórica.
  const rawTotalTime = Number(
    metrics.completionTime || metrics.totalTimePlayed || metrics.playDuration || 0
  );
  // Si no hay tiempo del servidor, calcular a partir del inicio local (en ms).
  const elapsedMs = gameStartTime ? Date.now() - gameStartTime : 0;
  const totalTimePlayed = rawTotalTime > 0 ? rawTotalTime : elapsedMs;

  // Errores y aciertos: priorizar métricas del backend si vienen, fallback a contador local.
  const errorAttempts = metrics.errorAttempts !== undefined ? Number(metrics.errorAttempts) : null;
  const correctAttempts =
    metrics.correctAttempts !== undefined ? Number(metrics.correctAttempts) : null;
  const errors = Number.isFinite(errorAttempts)
    ? Math.max(0, errorAttempts)
    : Math.max(0, totalAttempts - correctAnswers);
  const finalCorrect = Number.isFinite(correctAttempts) ? correctAttempts : correctAnswers;

  // maxScore: ADR-114, el backend lo calcula al crear la partida.
  const numericMaxScore = Number(maxScore);
  const safeMaxScore =
    Number.isFinite(numericMaxScore) && numericMaxScore > 0 ? numericMaxScore : null;

  const summary = {
    score,
    maxScore: safeMaxScore,
    correctAnswers: finalCorrect,
    errors,
    attempts: totalAttempts,
    averageResponseTimeMs: Number.isFinite(averageResponseTimeMs) ? averageResponseTimeMs : 0,
    totalTimePlayed: Number.isFinite(totalTimePlayed) ? totalTimePlayed : 0,
    mode: mechanicMode || 'association'
  };

  if (mechanicMode === 'sequence') {
    summary.sequencesCompleted = Number(metrics.sequencesCompleted || 0);
    summary.sequencesBlocked = Number(metrics.sequencesBlocked || 0);
    summary.sequencesTimedOut = Number(metrics.sequencesTimedOut || 0);
    summary.maxSequenceLengthAchieved = Number(metrics.maxSequenceLengthAchieved || 0);
    summary.partialReproductions = Number(metrics.partialReproductions || 0);
    summary.partialRounds = Number(metrics.partialRounds || 0);
    summary.averageReproductionTimeMs = Number(metrics.averageReproductionTimeMs || 0);
    summary.blockedCardsTotal = Number(metrics.blockedCardsTotal || 0);
    summary.hintsUsed = Number(metrics.hintsUsed || 0);
  } else if (mechanicMode === 'memory' && metrics.memory && typeof metrics.memory === 'object') {
    summary.memory = {
      groupsMatched: Number(metrics.memory.groupsMatched || 0),
      peakStreak: Number(metrics.memory.peakStreak || 0),
      averageMatchTimeMs: Number(metrics.memory.averageMatchTimeMs || 0),
      attemptsToFirstMatch: metrics.memory.attemptsToFirstMatch ?? null,
      groupSize: Number(metrics.memory.groupSize || 2)
    };
  } else if (
    mechanicMode === 'association' &&
    metrics.association &&
    typeof metrics.association === 'object'
  ) {
    summary.association = {
      peakStreak: Number(metrics.association.peakStreak || 0),
      quickestCorrectMs: metrics.association.quickestCorrectMs ?? null,
      slowestCorrectMs: metrics.association.slowestCorrectMs ?? null,
      byValueAccuracy:
        metrics.association.byValueAccuracy &&
        typeof metrics.association.byValueAccuracy === 'object'
          ? metrics.association.byValueAccuracy
          : {},
      categoryDominance: metrics.association.categoryDominance ?? null
    };
  }

  return summary;
}
