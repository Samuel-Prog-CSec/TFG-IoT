/**
 * @fileoverview Estado Gameplay para RFID.
 */

const BaseRfidState = require('./BaseRfidState');

class GameplayState extends BaseRfidState {
  constructor() {
    super('gameplay');
  }

  allowsReads() {
    return true;
  }
}

module.exports = GameplayState;
