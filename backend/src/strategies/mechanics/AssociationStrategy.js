/**
 * @fileoverview Estrategia de mecanica Asociacion.
 */

const BaseMechanicStrategy = require('./BaseMechanicStrategy');

class AssociationStrategy extends BaseMechanicStrategy {
  constructor() {
    super('association');
  }

  initialize() {
    return { lastUid: null };
  }

  selectChallenge({ sessionDoc, playState }) {
    const mappings = sessionDoc.cardMappings || [];
    if (mappings.length === 0) {
      return null;
    }

    let candidate = null;
    let attempts = 0;

    do {
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
