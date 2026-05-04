/**
 * @fileoverview Contrato base para estrategias de mecanicas.
 */

class BaseMechanicStrategy {
  constructor(name) {
    this.name = name;
  }

  getName() {
    return this.name;
  }

  initialize() {
    return {};
  }

  selectChallenge() {
    throw new Error('selectChallenge() no implementado');
  }

  isTurnBasedRound() {
    return true;
  }

  getRoundDurationMs(sessionDoc) {
    const seconds = Number(sessionDoc?.config?.timeLimit || 0);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  }

  getPlayDurationMs(sessionDoc) {
    return this.getRoundDurationMs(sessionDoc);
  }

  processScan() {
    return null;
  }

  /**
   * Hook invocado por el GameEngine inmediatamente después de evaluar la
   * respuesta del jugador (antes de persistir el evento). Permite a la
   * strategy mantener bookkeeping en `strategyState` para que
   * `finalSummary.buildXxxFinalSummary` pueda derivar métricas como
   * `peakStreak`, `quickestCorrectMs`, `byValueAccuracy`, etc.
   *
   * Por defecto no hace nada — sólo Memoria y Asociación lo sobreescriben.
   * Secuencia mantiene su bookkeeping en `strategyState.roundResults`
   * gestionado por `sequenceFlow`.
   *
   * @param {Object} params
   * @param {boolean} params.isCorrect
   * @param {Object} [params.scannedCard]
   * @param {Object} [params.currentChallenge]
   * @param {number} [params.timeElapsed] - ms desde inicio de ronda.
   * @param {Object} params.strategyState - mutable.
   * @param {Object} [params.sessionDoc]
   * @returns {void}
   */
  recordScanResult() {
    /* default: noop */
  }
}

module.exports = BaseMechanicStrategy;
