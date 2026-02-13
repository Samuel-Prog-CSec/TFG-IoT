/**
 * @fileoverview Estrategia de mecanica Secuencia.
 */

const BaseMechanicStrategy = require('./BaseMechanicStrategy');

class SequenceStrategy extends BaseMechanicStrategy {
  constructor() {
    super('sequence');
  }

  initialize({ sessionDoc }) {
    return {
      sequence: Array.isArray(sessionDoc.cardMappings) ? sessionDoc.cardMappings : []
    };
  }

  selectChallenge({ playDoc, playState }) {
    const sequence = playState.strategyState?.sequence || [];
    if (sequence.length === 0) {
      return null;
    }

    const index = (playDoc.currentRound - 1) % sequence.length;
    return sequence[index];
  }
}

module.exports = SequenceStrategy;
