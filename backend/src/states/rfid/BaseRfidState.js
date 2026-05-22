/**
 * @fileoverview Contrato base para estados RFID.
 */

class BaseRfidState {
  constructor(mode) {
    this.mode = mode;
  }

  getMode() {
    return this.mode;
  }

  allowsReads() {
    return false;
  }

  validateRoom() {
    return true;
  }

  getReadNotAllowedMessage() {
    return 'Modo RFID no permite lecturas';
  }

  getRoomMismatchMessage() {
    return 'Modo RFID inválido';
  }

  getRoomMismatchReason() {
    return 'RFID_MODE_ROOM_MISMATCH';
  }
}

module.exports = BaseRfidState;
