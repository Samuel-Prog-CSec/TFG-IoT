/**
 * @fileoverview Helpers de flujo para la mecánica Secuencia.
 *
 * Aísla la lógica específica de Secuencia (fases memorizing/reproducing,
 * eventos socket `sequence_*` y agregación de métricas) para que el
 * GameEngine principal no crezca innecesariamente.
 *
 * @module services/gameEngine/sequenceFlow
 */

const logger = require('../../utils/logger').child({ component: 'sequenceFlow' });
const { SEQUENCE_PHASE } = require('../../constants/enums');

// Tiempo entre que se cierra una ronda (`sequence_round_result`) y el
// arranque de la siguiente. Da margen al cliente para mostrar las cartas
// reveladas en su estado final (verde/rojo/ámbar) y reproducir las dos
// animaciones signature de "crupier": pausa de revelado (~800ms) +
// recogida (~640ms con stagger 70ms × 5 cartas + 320ms ease) + un
// instante de respiro antes del reparto. Con 600ms (valor anterior) el
// cliente apenas tenía tiempo a iniciar la recogida antes de empezar la
// siguiente memorización: las animaciones se solapaban y el alumno
// percibía un cambio brusco (BUG QA 03/05/2026).
const FEEDBACK_PAUSE_MS = 1700;

/**
 * Devuelve la duración (ms) de la fase de memorización para la ronda actual.
 *
 * @param {Object} playState
 * @returns {number}
 */
function getMemorizingDurationMs(playState) {
  const seconds = Number(playState?.strategyState?.displaySeconds) || 3;
  return Math.max(2000, seconds * 1000);
}

/**
 * Emite `sequence_phase_memorizing` y programa la transición automática a
 * la fase reproducing. Si la partida se pausa antes del fin del temporizador,
 * se cancela y se reanuda con tiempo restante via `resumeMemorizingPhase`.
 *
 * @param {Object} engine - Instancia GameEngine.
 * @param {string} playId
 */
function startSequenceMemorizingPhase(engine, playId) {
  const playState = engine.activePlays.get(playId);
  if (!playState || playState.mechanicName !== 'sequence') {
    return;
  }

  const challenge = playState.currentChallenge?.displayData;
  if (!challenge || challenge.mode !== 'sequence_round') {
    return;
  }

  const durationMs = getMemorizingDurationMs(playState);
  const sessionDoc = playState.sessionDoc;

  playState.strategyState.phase = SEQUENCE_PHASE[0]; // 'memorizing'
  playState.awaitingResponse = false;
  playState.sequencePhaseStartedAt = Date.now();
  playState.sequencePhaseRemainingMs = durationMs;

  engine.io.to(`play_${playId}`).emit('sequence_phase_memorizing', {
    playId,
    roundNumber: challenge.roundNumber,
    totalRounds: sessionDoc?.config?.numberOfRounds || playState.strategyState.plan.length,
    sequence: challenge.sequence,
    length: challenge.length,
    displaySeconds: challenge.displaySeconds,
    score: playState.playDoc.score
  });

  logger.debug('Fase memorizing iniciada', {
    playId,
    roundNumber: challenge.roundNumber,
    durationMs
  });

  scheduleMemorizingTransition(engine, playId, durationMs);
}

/**
 * Programa el `setTimeout` que transiciona memorizing → reproducing.
 */
function scheduleMemorizingTransition(engine, playId, delayMs) {
  const playState = engine.activePlays.get(playId);
  if (!playState) {
    return;
  }

  if (playState.sequenceMemorizingTimer) {
    clearTimeout(playState.sequenceMemorizingTimer);
  }

  playState.sequenceMemorizingTimer = setTimeout(() => {
    enterSequenceReproducingPhase(engine, playId);
  }, delayMs);
}

/**
 * Cancela el timer de memorizing al pausar y guarda el tiempo restante
 * para reanudarlo correctamente.
 */
function pauseMemorizingPhase(playState) {
  if (!playState?.sequenceMemorizingTimer) {
    return;
  }
  clearTimeout(playState.sequenceMemorizingTimer);
  playState.sequenceMemorizingTimer = null;

  if (playState.sequencePhaseStartedAt) {
    const elapsed = Date.now() - playState.sequencePhaseStartedAt;
    playState.sequencePhaseRemainingMs = Math.max(
      0,
      (playState.sequencePhaseRemainingMs || getMemorizingDurationMs(playState)) - elapsed
    );
  }
}

/**
 * Reanuda el timer de memorizing tras una pausa con el tiempo restante.
 */
function resumeMemorizingPhase(engine, playId) {
  const playState = engine.activePlays.get(playId);
  if (!playState || playState.mechanicName !== 'sequence') {
    return;
  }
  if (playState.strategyState?.phase !== SEQUENCE_PHASE[0]) {
    return;
  }

  const remaining = Number(playState.sequencePhaseRemainingMs);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    enterSequenceReproducingPhase(engine, playId);
    return;
  }

  playState.sequencePhaseStartedAt = Date.now();
  scheduleMemorizingTransition(engine, playId, remaining);
}

/**
 * Transiciona de memorizing a reproducing: emite el evento, arma el timer
 * de la ronda y abre la espera de scans.
 */
function enterSequenceReproducingPhase(engine, playId) {
  const playState = engine.activePlays.get(playId);
  if (!playState || playState.mechanicName !== 'sequence') {
    return;
  }
  if (playState.paused || playState.playDoc?.status === 'paused') {
    return;
  }

  if (playState.sequenceMemorizingTimer) {
    clearTimeout(playState.sequenceMemorizingTimer);
    playState.sequenceMemorizingTimer = null;
  }

  playState.mechanicStrategy.enterReproducingPhase(playState.strategyState);
  playState.awaitingResponse = true;
  playState.roundStartTime = Date.now();
  playState.remainingTimeMs = null;
  playState.roundElapsedBeforePauseMs = 0;

  const sessionDoc = playState.sessionDoc;
  const expected = playState.strategyState.expectedSequence || [];
  const timeLimitMs = sessionDoc?.config?.timeLimit
    ? Number(sessionDoc.config.timeLimit) * 1000
    : 0;

  engine.io.to(`play_${playId}`).emit('sequence_phase_reproducing', {
    playId,
    roundNumber: playState.playDoc.currentRound,
    length: expected.length,
    timeLimitMs
  });

  logger.debug('Fase reproducing iniciada', {
    playId,
    roundNumber: playState.playDoc.currentRound,
    timeLimitMs
  });

  if (playState.roundTimer) {
    clearTimeout(playState.roundTimer);
  }
  playState.roundTimer = setTimeout(() => {
    handleSequenceRoundTimeout(engine, playId);
  }, timeLimitMs + 150); // Reusa el ROUND_GRACE_PERIOD_MS
}

/**
 * Procesa un escaneo durante la fase reproducing.
 *
 * @param {Object} engine
 * @param {string} playId
 * @param {Object} playState
 * @param {Object} scannedCardMapping
 */
async function processSequenceScan(engine, playId, playState, scannedCardMapping) {
  const result = playState.mechanicStrategy.processScan({
    scannedCard: scannedCardMapping,
    sessionDoc: playState.sessionDoc,
    strategyState: playState.strategyState
  });

  if (!result || result.type === 'ignored') {
    engine.io.to(`play_${playId}`).emit('scan_ignored', {
      uid: scannedCardMapping.uid,
      reason: result?.reason || 'sequence_ignored'
    });
    return;
  }

  // Persistir el evento (correct/error) y actualizar score atómicamente.
  const points = Number(result.points || 0);
  const eventType = result.type === 'correct' ? 'correct' : 'error';
  playState.playDoc.score = Math.max(0, Number(playState.playDoc.score || 0) + points);
  await playState.playDoc.addEventAtomic({
    eventType,
    cardUid: scannedCardMapping.uid,
    expectedValue: result.expectedUid || null,
    actualValue: scannedCardMapping.assignedValue,
    pointsAwarded: points,
    timeElapsed: playState.roundStartTime ? Date.now() - playState.roundStartTime : 0,
    roundNumber: playState.playDoc.currentRound
  });

  engine.io.to(`play_${playId}`).emit('sequence_card_result', {
    playId,
    type: result.type,
    uid: scannedCardMapping.uid,
    expectedUid: result.expectedUid || null,
    hint: result.hint || undefined,
    attemptsForCurrent: result.attemptsForCurrent,
    cursor: result.cursor,
    length: result.length,
    score: playState.playDoc.score,
    points
  });

  if (result.type === 'correct') {
    engine.metrics.totalRoundResponses += 1;
  }

  if (result.roundCompleted) {
    await finalizeSequenceRound(engine, playId, { timedOut: false });
  } else {
    // Mantener `awaitingResponse=true` para seguir aceptando scans.
    playState.awaitingResponse = true;
  }
}

/**
 * Cierra la ronda actual al expirar el `roundTimer` de la fase reproducing.
 */
async function handleSequenceRoundTimeout(engine, playId) {
  const playState = engine.activePlays.get(playId);
  if (!playState || playState.mechanicName !== 'sequence') {
    return;
  }
  if (playState.paused) {
    return;
  }

  await finalizeSequenceRound(engine, playId, { timedOut: true });
}

/**
 * Cierra la ronda (por completitud o timeout), emite `sequence_round_result`
 * y avanza a la siguiente ronda (o termina la partida).
 */
async function finalizeSequenceRound(engine, playId, { timedOut }) {
  const playState = engine.activePlays.get(playId);
  if (!playState) {
    return;
  }

  if (playState.roundTimer) {
    clearTimeout(playState.roundTimer);
    playState.roundTimer = null;
  }
  playState.awaitingResponse = false;

  const strategy = playState.mechanicStrategy;
  let timedOutUids = [];
  if (timedOut) {
    const forced = strategy.forceTimeoutCurrentRound(playState.strategyState);
    timedOutUids = forced.timedOutUids;
  }

  const summary = strategy.recordRoundCompletion(playState.strategyState, { timedOutUids });

  engine.io.to(`play_${playId}`).emit('sequence_round_result', {
    playId,
    roundNumber: summary.roundNumber,
    length: summary.length,
    results: summary.results,
    durationMs: summary.durationMs,
    completed: summary.completed,
    timedOut: Boolean(timedOut),
    score: playState.playDoc.score
  });

  await playState.playDoc.addEventAtomic({
    eventType: 'round_end',
    pointsAwarded: 0,
    timeElapsed: summary.durationMs,
    roundNumber: summary.roundNumber
  });

  // Pausa breve para que el cliente muestre el resultado antes de la siguiente ronda.
  if (playState.nextRoundTimer) {
    clearTimeout(playState.nextRoundTimer);
  }
  playState.nextRoundTimer = setTimeout(() => {
    advanceSequence(engine, playId);
  }, FEEDBACK_PAUSE_MS);
}

/**
 * Avanza el `currentRound` y dispara la siguiente ronda o finaliza la partida.
 */
async function advanceSequence(engine, playId) {
  const playState = engine.activePlays.get(playId);
  if (!playState) {
    return;
  }
  if (playState.paused) {
    return;
  }

  playState.nextRoundTimer = null;
  const totalRounds =
    playState.sessionDoc?.config?.numberOfRounds || playState.strategyState.plan.length;

  if (playState.playDoc.currentRound >= totalRounds) {
    await engine.endPlay(playId);
    return;
  }

  playState.playDoc.currentRound = Number(playState.playDoc.currentRound || 1) + 1;
  await playState.playDoc.save();

  await engine.sendNextRound(playId);
}

/**
 * Construye las métricas finales específicas de Secuencia para `final_summary`.
 *
 * @param {Object} playState
 * @returns {Object}
 */
function buildSequenceFinalSummary(playState) {
  const rounds = playState?.strategyState?.roundResults || [];
  if (rounds.length === 0) {
    return {
      sequencesCompleted: 0,
      sequencesBlocked: 0,
      sequencesTimedOut: 0,
      maxSequenceLengthAchieved: 0,
      partialReproductions: 0,
      averageReproductionTimeMs: 0,
      blockedCardsTotal: 0,
      hintsUsed: Number(playState?.strategyState?.hintsConsumed || 0)
    };
  }

  let sequencesCompleted = 0;
  let sequencesBlocked = 0;
  let sequencesTimedOut = 0;
  let maxLength = 0;
  let partialReproductions = 0;
  let totalDuration = 0;
  let blockedCardsTotal = 0;

  for (const round of rounds) {
    const correctCount = round.results.filter(r => r.status === 'correct').length;
    const hadTimedOut = round.results.some(r => r.status === 'timedOut');
    const hadBlocked = round.results.some(r => r.status === 'blocked');

    if (correctCount === round.length) {
      sequencesCompleted += 1;
      maxLength = Math.max(maxLength, round.length);
    } else if (hadTimedOut) {
      sequencesTimedOut += 1;
    } else if (hadBlocked) {
      sequencesBlocked += 1;
    }

    partialReproductions += correctCount;
    blockedCardsTotal += round.results.filter(r => r.status === 'blocked').length;
    totalDuration += Number(round.durationMs || 0);
  }

  const averageReproductionTimeMs =
    sequencesCompleted > 0 ? Math.round(totalDuration / rounds.length) : 0;

  return {
    sequencesCompleted,
    sequencesBlocked,
    sequencesTimedOut,
    maxSequenceLengthAchieved: maxLength,
    partialReproductions,
    averageReproductionTimeMs,
    blockedCardsTotal,
    hintsUsed: Number(playState?.strategyState?.hintsConsumed || 0)
  };
}

module.exports = {
  startSequenceMemorizingPhase,
  enterSequenceReproducingPhase,
  processSequenceScan,
  handleSequenceRoundTimeout,
  finalizeSequenceRound,
  buildSequenceFinalSummary,
  pauseMemorizingPhase,
  resumeMemorizingPhase
};
