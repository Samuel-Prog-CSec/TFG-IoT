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
}

module.exports = BaseMechanicStrategy;
