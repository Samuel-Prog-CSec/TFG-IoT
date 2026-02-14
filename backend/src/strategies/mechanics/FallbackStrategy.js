/**
 * @fileoverview Estrategia fallback para mecanicas no soportadas.
 */

const BaseMechanicStrategy = require('./BaseMechanicStrategy');
const AssociationStrategy = require('./AssociationStrategy');

class FallbackStrategy extends BaseMechanicStrategy {
  constructor(requestedName) {
    super(requestedName || 'fallback');
    this.associationStrategy = new AssociationStrategy();
  }

  initialize(context) {
    return this.associationStrategy.initialize(context);
  }

  selectChallenge(context) {
    return this.associationStrategy.selectChallenge(context);
  }
}

module.exports = FallbackStrategy;
