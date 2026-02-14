/**
 * @fileoverview Estado Idle para RFID.
 */

const BaseRfidState = require('./BaseRfidState');

class IdleState extends BaseRfidState {
  constructor() {
    super('idle');
  }
}

module.exports = IdleState;
