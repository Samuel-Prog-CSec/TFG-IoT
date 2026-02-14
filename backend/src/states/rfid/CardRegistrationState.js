/**
 * @fileoverview Estado Card Registration para RFID.
 */

const BaseRfidState = require('./BaseRfidState');

class CardRegistrationState extends BaseRfidState {
  constructor() {
    super('card_registration');
  }

  allowsReads() {
    return true;
  }

  validateRoom({ socket, rooms }) {
    return socket.rooms.has(rooms.registration);
  }

  getRoomMismatchMessage() {
    return 'Modo RFID invalido para registro';
  }
}

module.exports = CardRegistrationState;
