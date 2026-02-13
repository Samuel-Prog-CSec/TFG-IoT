/**
 * @fileoverview Registry de estrategias para mecanicas de juego.
 */

const AssociationStrategy = require('./AssociationStrategy');
const SequenceStrategy = require('./SequenceStrategy');
const MemoryStrategy = require('./MemoryStrategy');
const FallbackStrategy = require('./FallbackStrategy');

const strategies = {
  association: new AssociationStrategy(),
  sequence: new SequenceStrategy(),
  memory: new MemoryStrategy()
};

const normalize = value => (value ? value.toString().toLowerCase() : '');

const getMechanicStrategy = (mechanicName, logger) => {
  const key = normalize(mechanicName);
  if (strategies[key]) {
    return strategies[key];
  }

  if (logger) {
    logger.warn('Mecanica sin estrategia dedicada, usando fallback', {
      mechanicName: mechanicName || null
    });
  }

  return new FallbackStrategy(key || 'unknown');
};

module.exports = {
  getMechanicStrategy
};
