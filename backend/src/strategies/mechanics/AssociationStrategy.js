/**
 * @fileoverview Estrategia de mecanica Asociacion.
 */

const BaseMechanicStrategy = require('./BaseMechanicStrategy');

class AssociationStrategy extends BaseMechanicStrategy {
  constructor() {
    super('association');
  }

  initialize() {
    return {
      lastUid: null,
      // Bookkeeping para finalSummary (ADR-A, ADR-B). Estas métricas no son
      // incrementales (peakStreak, max/min, mapa por valor) y no se pueden
      // derivar de forma fiable a partir de `events` post-truncado, así
      // que se acumulan aquí durante la partida.
      currentStreak: 0,
      peakStreak: 0,
      quickestCorrectMs: null,
      slowestCorrectMs: null,
      // Mapa { assignedValue → { correct, total } }. Usamos el valor
      // semántico de la carta (lo que el alumno está aprendiendo) en vez
      // del slug del contexto, porque una sesión Asociación trabaja un
      // único contextId — sería un mapa de un solo elemento. El
      // assignedValue refleja "qué concepto domina mejor".
      byValueAccuracy: {}
    };
  }

  /**
   * Bookkeeping de Asociación tras evaluar el scan del jugador.
   * `currentChallenge.assignedValue` identifica el concepto preguntado
   * en la ronda; agregamos correct/total por valor para que el summary
   * final pueda decidir la `categoryDominance`.
   */
  recordScanResult({ isCorrect, currentChallenge, timeElapsed, strategyState } = {}) {
    if (!strategyState) {
      return;
    }
    const value = currentChallenge?.assignedValue || '__unknown__';
    if (!strategyState.byValueAccuracy || typeof strategyState.byValueAccuracy !== 'object') {
      strategyState.byValueAccuracy = {};
    }
    if (!strategyState.byValueAccuracy[value]) {
      strategyState.byValueAccuracy[value] = { correct: 0, total: 0 };
    }
    strategyState.byValueAccuracy[value].total += 1;

    if (isCorrect) {
      strategyState.byValueAccuracy[value].correct += 1;
      const newStreak = Number(strategyState.currentStreak || 0) + 1;
      strategyState.currentStreak = newStreak;
      strategyState.peakStreak = Math.max(Number(strategyState.peakStreak || 0), newStreak);

      const elapsed = Number(timeElapsed || 0);
      if (elapsed > 0) {
        strategyState.quickestCorrectMs =
          strategyState.quickestCorrectMs === null || strategyState.quickestCorrectMs === undefined
            ? elapsed
            : Math.min(Number(strategyState.quickestCorrectMs), elapsed);
        strategyState.slowestCorrectMs =
          strategyState.slowestCorrectMs === null || strategyState.slowestCorrectMs === undefined
            ? elapsed
            : Math.max(Number(strategyState.slowestCorrectMs), elapsed);
      }
    } else {
      strategyState.currentStreak = 0;
    }
  }

  resolvePlannedChallenge({ sessionDoc, playDoc }) {
    const roundNumber = Number(playDoc?.currentRound || 0);
    if (!Number.isFinite(roundNumber) || roundNumber < 1) {
      return null;
    }

    const plan = Array.isArray(sessionDoc?.associationChallengePlan)
      ? sessionDoc.associationChallengePlan
      : [];

    if (plan.length === 0) {
      return null;
    }

    const plannedItem = plan.find(item => Number(item?.roundNumber) === roundNumber);
    if (!plannedItem) {
      return null;
    }

    const mappings = Array.isArray(sessionDoc?.cardMappings) ? sessionDoc.cardMappings : [];
    const mapping = mappings.find(candidate => candidate.uid === plannedItem.uid) || null;
    if (!mapping) {
      return null;
    }

    const plainMapping =
      typeof mapping.toObject === 'function' ? mapping.toObject() : { ...mapping };
    return {
      ...plainMapping,
      displayData:
        plannedItem.displayData && Object.keys(plannedItem.displayData).length > 0
          ? plannedItem.displayData
          : plainMapping.displayData || {},
      promptText: plannedItem.promptText
    };
  }

  selectChallenge({ sessionDoc, playState }) {
    const plannedChallenge = this.resolvePlannedChallenge({
      sessionDoc,
      playDoc: playState?.playDoc
    });

    if (plannedChallenge) {
      if (playState?.strategyState) {
        playState.strategyState.lastUid = plannedChallenge.uid || null;
      }

      return plannedChallenge;
    }

    const mappings = sessionDoc.cardMappings || [];
    if (mappings.length === 0) {
      return null;
    }

    let candidate = null;
    let attempts = 0;

    do {
      // eslint-disable-next-line sonarjs/pseudo-random -- safe: game shuffling does not require CSPRNG
      const randomIndex = Math.floor(Math.random() * mappings.length);
      candidate = mappings[randomIndex];
      attempts += 1;
    } while (
      mappings.length > 1 &&
      candidate?.uid === playState.strategyState?.lastUid &&
      attempts < 5
    );

    if (playState.strategyState) {
      playState.strategyState.lastUid = candidate?.uid || null;
    }

    return candidate;
  }
}

module.exports = AssociationStrategy;
