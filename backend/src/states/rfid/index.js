/**
 * @fileoverview Factory de estados RFID.
 */

const IdleState = require('./IdleState');
const GameplayState = require('./GameplayState');
const CardRegistrationState = require('./CardRegistrationState');
const CardAssignmentState = require('./CardAssignmentState');

const states = {
  idle: new IdleState(),
  gameplay: new GameplayState(),
  card_registration: new CardRegistrationState(),
  card_assignment: new CardAssignmentState()
};

const normalize = value => (value ? value.toString().toLowerCase() : 'idle');

const getRfidState = (mode, logger) => {
  const key = normalize(mode);
  if (states[key]) {
    return states[key];
  }

  if (logger) {
    logger.warn('Modo RFID sin estado dedicado, usando idle', { mode: mode || null });
  }

  return states.idle;
};

module.exports = {
  getRfidState
};
