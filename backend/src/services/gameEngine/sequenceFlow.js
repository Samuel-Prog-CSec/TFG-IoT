/**
 * @fileoverview Helpers de flujo para la mecánica Secuencia.
 *
 * Aísla la lógica específica de Secuencia (fases memorizing/reproducing,
 * eventos socket `sequence_*` y agregación de métricas) para que el
 * GameEngine principal no crezca innecesariamente.
 *
 * @module services/gameEngine/sequenceFlow
 */

const Sentry = require('@sentry/node');
const logger = require('../../utils/logger').child({ component: 'sequenceFlow' });
const { SEQUENCE_PHASE } = require('../../constants/enums');

// Tiempo entre que se cierra una ronda (`sequence_round_result`) y el
// arranque de la siguiente. Reparto:
//   1. 2400ms revelado de las cartas con su estado final (verde/rojo/ámbar)
//      → el alumno necesita ese tiempo para asimilar cómo le fue, sin que
//      la siguiente animación pise visualmente la anterior.
//   2. ~640ms recogida (stagger 70ms × 5 cartas + 320ms ease).
//   3. ~460ms de respiro antes del reparto de la siguiente ronda.
//
// Antes (1700ms) el alumno solo veía 800ms las cartas reveladas y la
// partida saturaba (QA 2026-05-06: "todo pasa demasiado deprisa, el niño
// no puede ver cómo le fue").
const FEEDBACK_PAUSE_MS = 3500;

// Margen entre que el frontend muestra el `PhaseTransitionOverlay` (countdown
// "Reproduce la secuencia" 2400ms) y el momento en que el alumno realmente
// puede responder. Antes (QA 2026-05-06) el `roundTimer` se armaba
// instantáneamente al transicionar a reproducing y el countdown del
// overlay consumía 2400ms del tiempo jugable — el alumno empezaba la
// ronda con menos tiempo del configurado. Con la grace, el `roundTimer`
// real arranca tras el overlay.
const SEQUENCE_REPRODUCE_GRACE_MS = 2400;

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
    score: playState.playDoc.score,
    // Contexto canónico de mecánica para la mascota viva (ADR-D) y
    // handlers genéricos. Simetría con sequence_card_result/round_result.
    mechanicType: 'sequence'
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
    timeLimitMs,
    // QA 2026-05-06: el frontend muestra `PhaseTransitionOverlay` con
    // countdown 2400ms ("Reproduce la secuencia"). Le comunicamos el grace
    // para que postponga `awaitingResponse=true` (TimerBar congelada
    // durante el overlay) y para sincronizarse con el `roundTimer` real.
    gracePeriodMs: SEQUENCE_REPRODUCE_GRACE_MS,
    // Contexto canónico para la mascota viva (ADR-D). Simetría con el resto
    // de eventos de la mecánica Secuencia.
    mechanicType: 'sequence'
  });

  logger.debug('Fase reproducing iniciada', {
    playId,
    roundNumber: playState.playDoc.currentRound,
    timeLimitMs,
    gracePeriodMs: SEQUENCE_REPRODUCE_GRACE_MS
  });

  if (playState.roundTimer) {
    clearTimeout(playState.roundTimer);
  }
  // El `roundTimer` se calibra a `grace + timeLimit + 150` (ROUND_GRACE_PERIOD_MS)
  // para que el alumno tenga el tiempo configurado de respuesta REAL — antes
  // perdía 2400ms de tiempo jugable durante el countdown del overlay.
  // Si el alumno responde dentro del overlay (tap muy rápido), sus scans se
  // procesan normal porque `awaitingResponse` ya es true desde aquí.
  playState.roundTimer = setTimeout(
    () => {
      handleSequenceRoundTimeout(engine, playId);
    },
    timeLimitMs + SEQUENCE_REPRODUCE_GRACE_MS + 150
  );
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
  // T-904 Fase A: span por escaneo de Secuencia. Atributos básicos (sin PII).
  return Sentry.startSpan(
    {
      name: 'gameplay.sequence.processScan',
      op: 'gameplay.sequence',
      attributes: {
        'play.id': playId,
        'round.number': playState?.playDoc?.currentRound,
        'card.uid': scannedCardMapping?.uid
      }
    },
    () => _processSequenceScanImpl(engine, playId, playState, scannedCardMapping)
  );
}

async function _processSequenceScanImpl(engine, playId, playState, scannedCardMapping) {
  const result = playState.mechanicStrategy.processScan({
    scannedCard: scannedCardMapping,
    sessionDoc: playState.sessionDoc,
    strategyState: playState.strategyState
  });

  if (!result || result.type === 'ignored') {
    // C.3 (pre-v1.0.0): volatile.emit con fallback graceful si el mock
    // no expone `.volatile` (tests legacy). Perder un `scan_ignored`
    // bajo backpressure no afecta correctness.
    const target = engine.io.to(`play_${playId}`);
    const channel = target.volatile || target;
    channel.emit('scan_ignored', {
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
    points,
    // Contexto canónico de mecánica para la mascota viva (ADR-D). El
    // `cursor` actúa como "streak" dentro de una secuencia.
    mechanicType: 'sequence'
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
  return Sentry.startSpan(
    {
      name: 'gameplay.sequence.roundTimeout',
      op: 'gameplay.sequence',
      attributes: {
        'play.id': playId
      }
    },
    async () => {
      const playState = engine.activePlays.get(playId);
      if (!playState || playState.mechanicName !== 'sequence') {
        return;
      }
      if (playState.paused) {
        return;
      }

      await finalizeSequenceRound(engine, playId, { timedOut: true });
    }
  );
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
    score: playState.playDoc.score,
    // Contexto canónico para la mascota (ADR-D). El frontend escucha este
    // evento y dispara reacciones distintas según `completed`/`timedOut`.
    mechanicType: 'sequence'
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
      partialRounds: 0,
      averageReproductionTimeMs: 0,
      blockedCardsTotal: 0,
      hintsUsed: Number(playState?.strategyState?.hintsConsumed || 0)
    };
  }

  let sequencesCompleted = 0;
  let sequencesBlocked = 0;
  let sequencesTimedOut = 0;
  // Mayor longitud alcanzada por el alumno en cualquier ronda — incluye
  // rondas no completadas. Antes sólo contábamos secuencias completas, lo
  // que dejaba `maxSequenceLengthAchieved=0` en partidas con muchos
  // aciertos parciales (BUG QA 03/05/2026: pantalla final mostraba 0 a
  // pesar de haber 9 cartas correctas en cuatro rondas).
  let maxLength = 0;
  // `partialReproductions` (cartas correctas totales) se mantiene por
  // compatibilidad con datos históricos en analytics. El UI usa el nuevo
  // `partialRounds` — número de rondas con al menos un acierto pero sin
  // completar la secuencia. Más informativo: refleja "casi lo logra".
  let partialReproductions = 0;
  let partialRounds = 0;
  let totalDuration = 0;
  let blockedCardsTotal = 0;

  for (const round of rounds) {
    const correctCount = round.results.filter(r => r.status === 'correct').length;
    const hadTimedOut = round.results.some(r => r.status === 'timedOut');
    const hadBlocked = round.results.some(r => r.status === 'blocked');

    if (correctCount === round.length) {
      sequencesCompleted += 1;
    } else if (hadTimedOut) {
      sequencesTimedOut += 1;
    } else if (hadBlocked) {
      sequencesBlocked += 1;
    }

    if (correctCount > 0 && correctCount < round.length) {
      partialRounds += 1;
    }

    maxLength = Math.max(maxLength, correctCount);
    partialReproductions += correctCount;
    blockedCardsTotal += round.results.filter(r => r.status === 'blocked').length;
    totalDuration += Number(round.durationMs || 0);
  }

  // Media de duración por ronda — siempre calculable, no sólo cuando hay
  // secuencias completas. Un alumno con 5 rondas que se quedan sin tiempo
  // sigue teniendo un T. medio significativo (cuánto duró el intento).
  const averageReproductionTimeMs =
    rounds.length > 0 ? Math.round(totalDuration / rounds.length) : 0;

  return {
    sequencesCompleted,
    sequencesBlocked,
    sequencesTimedOut,
    maxSequenceLengthAchieved: maxLength,
    partialReproductions,
    partialRounds,
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
