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
}

module.exports = BaseMechanicStrategy;
