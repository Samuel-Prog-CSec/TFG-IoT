/**
 * @fileoverview Estrategia de mecánica Secuencia.
 *
 * Una ronda de Secuencia se compone de dos fases:
 * 1. **memorizing**: el cliente muestra la secuencia completa al alumno
 *    durante `sequenceConfig.displaySeconds` segundos.
 * 2. **reproducing**: las cartas se ocultan y el alumno debe escanearlas en
 *    el orden mostrado. Cada acierto avanza el cursor; cada fallo incrementa
 *    el contador de intentos para esa posición.
 *
 * La dificultad regula los intentos permitidos por carta y la disponibilidad
 * de pistas progresivas (parcial → completa) tras cada fallo previo al
 * bloqueo. Una carta bloqueada **no reinicia** la secuencia: se marca como
 * fallada y el cursor avanza a la siguiente posición — decisión pedagógica
 * para evitar frustración acumulativa.
 *
 * @module strategies/mechanics/SequenceStrategy
 */

const BaseMechanicStrategy = require('./BaseMechanicStrategy');
const { SEQUENCE_DIFFICULTY_RULES, SEQUENCE_PHASE } = require('../../constants/enums');
const { buildHintPayload } = require('../../utils/sequenceHints');

const DEFAULT_DIFFICULTY = 'medium';

const cloneDisplayData = displayData =>
  displayData && typeof displayData === 'object' ? { ...displayData } : {};

const cloneSequenceItem = item => ({
  uid: item.uid,
  assignedValue: item.assignedValue,
  displayData: cloneDisplayData(item.displayData)
});

const resolveDifficulty = sessionDoc => {
  const value = (sessionDoc?.difficulty || DEFAULT_DIFFICULTY).toString().toLowerCase();
  return SEQUENCE_DIFFICULTY_RULES[value] ? value : DEFAULT_DIFFICULTY;
};

const getRules = difficulty =>
  SEQUENCE_DIFFICULTY_RULES[difficulty] || SEQUENCE_DIFFICULTY_RULES[DEFAULT_DIFFICULTY];

class SequenceStrategy extends BaseMechanicStrategy {
  constructor() {
    super('sequence');
  }

  /**
   * Cada ronda de Secuencia tiene su propio timer (en la fase reproducing).
   * Por eso `isTurnBasedRound` es `true`, igual que en Asociación.
   */
  isTurnBasedRound() {
    return true;
  }

  /**
   * Duración del timer de ronda. Solo aplica a la fase de reproducción —
   * la memorización es overhead controlado por `displaySeconds`.
   */
  getRoundDurationMs(sessionDoc) {
    const seconds = Number(sessionDoc?.config?.timeLimit || 0);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  }

  /**
   * Inicializa el estado intra-partida.
   *
   * @param {object} args
   * @param {object} args.sessionDoc
   * @returns {object}
   */
  initialize({ sessionDoc }) {
    const plan = Array.isArray(sessionDoc?.sequencePlan) ? sessionDoc.sequencePlan : [];
    const sortedPlan = [...plan].sort((a, b) => Number(a.roundNumber) - Number(b.roundNumber));

    const difficulty = resolveDifficulty(sessionDoc);
    const config = sessionDoc?.sequenceConfig || {};

    return {
      plan: sortedPlan.map(round => ({
        roundNumber: Number(round.roundNumber),
        length: Number(round.length) || (Array.isArray(round.sequence) ? round.sequence.length : 0),
        sequence: Array.isArray(round.sequence) ? round.sequence.map(cloneSequenceItem) : []
      })),
      difficulty,
      displaySeconds: Number(config.displaySeconds) || 3,
      phase: SEQUENCE_PHASE[0], // 'memorizing'
      currentRoundIndex: 0,
      expectedSequence: [],
      cursor: 0,
      attempts: {},
      blocked: [],
      hintsConsumed: 0,
      roundResults: [], // [{ roundNumber, results: [{ uid, status, attempts }], durationMs }]
      currentRoundStartedAt: null
    };
  }

  /**
   * Devuelve la secuencia de la ronda en curso para que el GameEngine la
   * emita al cliente. El GameEngine se encarga de:
   *  1. Emitir `sequence_phase_memorizing` con la secuencia visible.
   *  2. Tras `displaySeconds`, emitir `sequence_phase_reproducing` con la
   *     longitud (no la secuencia oculta).
   */
  selectChallenge({ playDoc, playState }) {
    const state = playState?.strategyState;
    if (!state || !Array.isArray(state.plan) || state.plan.length === 0) {
      return null;
    }

    const roundNumber = Number(playDoc?.currentRound || 1);
    const round = state.plan.find(item => item.roundNumber === roundNumber);
    if (!round) {
      return null;
    }

    state.currentRoundIndex = state.plan.indexOf(round);
    state.expectedSequence = round.sequence.map(cloneSequenceItem);
    state.cursor = 0;
    state.attempts = {};
    state.blocked = [];
    state.phase = SEQUENCE_PHASE[0]; // 'memorizing'
    state.currentRoundStartedAt = null;

    return {
      uid: null,
      assignedValue: null,
      displayData: {
        mode: 'sequence_round',
        roundNumber,
        phase: state.phase,
        length: round.length,
        sequence: round.sequence.map(cloneSequenceItem),
        displaySeconds: state.displaySeconds
      }
    };
  }

  /**
   * Marca el inicio de la fase de reproducción. El GameEngine llama a este
   * método tras los `displaySeconds` de memorización.
   */
  enterReproducingPhase(strategyState) {
    if (!strategyState) {
      return;
    }
    strategyState.phase = SEQUENCE_PHASE[1]; // 'reproducing'
    strategyState.currentRoundStartedAt = Date.now();
  }

  /**
   * Procesa un escaneo en la fase reproducing.
   *
   * @returns {object} Resultado uno de:
   *  - `{ type: 'ignored', reason }`
   *  - `{ type: 'correct', expectedUid, advance, points, roundCompleted }`
   *  - `{ type: 'incorrect', expectedUid, scannedUid, attemptsForCurrent }`
   *  - `{ type: 'incorrect_with_hint', expectedUid, scannedUid, hint, attemptsForCurrent }`
   *  - `{ type: 'blocked', expectedUid, scannedUid, attemptsForCurrent, advance, roundCompleted }`
   */
  processScan({ scannedCard, sessionDoc, strategyState }) {
    if (!strategyState || !scannedCard?.uid) {
      return { type: 'ignored', reason: 'invalid_state' };
    }

    if (strategyState.phase !== SEQUENCE_PHASE[1]) {
      return { type: 'ignored', reason: 'not_reproducing' };
    }

    const expectedSequence = Array.isArray(strategyState.expectedSequence)
      ? strategyState.expectedSequence
      : [];
    if (strategyState.cursor >= expectedSequence.length) {
      return { type: 'ignored', reason: 'sequence_complete' };
    }

    const expected = expectedSequence[strategyState.cursor];
    if (!expected) {
      return { type: 'ignored', reason: 'no_expected' };
    }

    const difficulty = strategyState.difficulty || DEFAULT_DIFFICULTY;
    const rules = getRules(difficulty);
    const pointsPerCorrect = Number(sessionDoc?.config?.pointsPerCorrect || 0);
    const penaltyPerError = Number(sessionDoc?.config?.penaltyPerError || 0);

    if (scannedCard.uid === expected.uid) {
      strategyState.cursor += 1;
      const roundCompleted = strategyState.cursor >= expectedSequence.length;
      return {
        type: 'correct',
        expectedUid: expected.uid,
        scannedUid: scannedCard.uid,
        advance: true,
        points: pointsPerCorrect,
        cursor: strategyState.cursor,
        length: expectedSequence.length,
        roundCompleted
      };
    }

    // Fallo: incrementar intentos para la posición actual.
    const previousAttempts = Number(strategyState.attempts[expected.uid] || 0);
    const attemptsForCurrent = previousAttempts + 1;
    strategyState.attempts[expected.uid] = attemptsForCurrent;

    if (attemptsForCurrent >= rules.maxAttemptsPerCard) {
      // Bloquear y avanzar (no reiniciar).
      if (!strategyState.blocked.includes(expected.uid)) {
        strategyState.blocked.push(expected.uid);
      }
      strategyState.cursor += 1;
      const roundCompleted = strategyState.cursor >= expectedSequence.length;
      return {
        type: 'blocked',
        expectedUid: expected.uid,
        scannedUid: scannedCard.uid,
        attemptsForCurrent,
        points: penaltyPerError,
        advance: true,
        cursor: strategyState.cursor,
        length: expectedSequence.length,
        roundCompleted
      };
    }

    const hintLevel = rules.hints[attemptsForCurrent - 1];
    if (hintLevel) {
      strategyState.hintsConsumed = Number(strategyState.hintsConsumed || 0) + 1;
      return {
        type: 'incorrect_with_hint',
        expectedUid: expected.uid,
        scannedUid: scannedCard.uid,
        attemptsForCurrent,
        points: penaltyPerError,
        hint: buildHintPayload(hintLevel, expected.assignedValue),
        cursor: strategyState.cursor,
        length: expectedSequence.length,
        roundCompleted: false
      };
    }

    return {
      type: 'incorrect',
      expectedUid: expected.uid,
      scannedUid: scannedCard.uid,
      attemptsForCurrent,
      points: penaltyPerError,
      cursor: strategyState.cursor,
      length: expectedSequence.length,
      roundCompleted: false
    };
  }

  /**
   * Cierra la ronda actual marcando las cartas restantes como `timedOut`.
   * Se invoca al expirar el `roundTimer` de la fase reproducing.
   *
   * @returns {object} `{ results: [...], timedOutUids: [...], cursor }`
   */
  forceTimeoutCurrentRound(strategyState) {
    if (!strategyState || strategyState.phase !== SEQUENCE_PHASE[1]) {
      return { results: [], timedOutUids: [], cursor: 0 };
    }

    const expectedSequence = strategyState.expectedSequence || [];
    const remaining = expectedSequence.slice(strategyState.cursor);
    const timedOutUids = remaining.map(item => item.uid);

    strategyState.cursor = expectedSequence.length;
    strategyState.phase = SEQUENCE_PHASE[2]; // 'completed'

    return {
      results: this.buildRoundResults(strategyState, { timedOutUids }),
      timedOutUids,
      cursor: strategyState.cursor
    };
  }

  /**
   * Construye el resumen final de la ronda actual: para cada elemento de la
   * secuencia, indica si fue `correct`, `blocked` o `timedOut`.
   *
   * @returns {{ uid, status, attempts }[]}
   */
  buildRoundResults(strategyState, { timedOutUids = [] } = {}) {
    const expectedSequence = strategyState.expectedSequence || [];
    const blockedSet = new Set(strategyState.blocked || []);
    const timedOutSet = new Set(timedOutUids);

    return expectedSequence.map(item => {
      const attempts = Number(strategyState.attempts[item.uid] || 0);
      let status;
      if (timedOutSet.has(item.uid)) {
        status = 'timedOut';
      } else if (blockedSet.has(item.uid)) {
        status = 'blocked';
      } else {
        status = 'correct';
      }
      return {
        uid: item.uid,
        assignedValue: item.assignedValue,
        status,
        attempts
      };
    });
  }

  /**
   * Persiste el resumen de la ronda en `roundResults` y deja el state listo
   * para la siguiente ronda. Llamado por GameEngine tras cada cierre de ronda.
   */
  recordRoundCompletion(strategyState, { timedOutUids = [] } = {}) {
    if (!strategyState) {
      return null;
    }

    const results = this.buildRoundResults(strategyState, { timedOutUids });
    const durationMs = strategyState.currentRoundStartedAt
      ? Math.max(0, Date.now() - strategyState.currentRoundStartedAt)
      : 0;
    const round = strategyState.plan[strategyState.currentRoundIndex];

    const summary = {
      roundNumber: round?.roundNumber,
      length: round?.length || results.length,
      results,
      durationMs,
      completed: results.every(item => item.status === 'correct')
    };
    strategyState.roundResults.push(summary);
    strategyState.phase = SEQUENCE_PHASE[2]; // 'completed'
    return summary;
  }
}

module.exports = SequenceStrategy;
