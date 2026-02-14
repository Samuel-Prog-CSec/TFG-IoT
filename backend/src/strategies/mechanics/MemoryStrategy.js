/**
 * @fileoverview Estrategia de mecanica Memoria.
 */

const BaseMechanicStrategy = require('./BaseMechanicStrategy');

const shuffle = list => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

class MemoryStrategy extends BaseMechanicStrategy {
  constructor() {
    super('memory');
  }

  initialize({ sessionDoc }) {
    const mappings = Array.isArray(sessionDoc.cardMappings) ? sessionDoc.cardMappings : [];
    const rounds = sessionDoc.config?.numberOfRounds || mappings.length;
    const shuffled = shuffle(mappings);
    const pattern = [];

    if (shuffled.length === 0) {
      return { pattern };
    }

    for (let i = 0; i < rounds; i += 1) {
      pattern.push(shuffled[i % shuffled.length]);
    }

    return { pattern };
  }

  selectChallenge({ playDoc, playState }) {
    const pattern = playState.strategyState?.pattern || [];
    if (pattern.length === 0) {
      return null;
    }

    const index = (playDoc.currentRound - 1) % pattern.length;
    return pattern[index];
  }
}

module.exports = MemoryStrategy;
