/**
 * @fileoverview Estado Card Assignment para RFID.
 */

const BaseRfidState = require('./BaseRfidState');

class CardAssignmentState extends BaseRfidState {
  constructor() {
    super('card_assignment');
  }

  allowsReads() {
    return true;
  }

  validateRoom({ socket, rooms }) {
    return socket.rooms.has(rooms.assignment);
  }

  getRoomMismatchMessage() {
    return 'Modo RFID invalido para asignacion';
  }
}

module.exports = CardAssignmentState;
