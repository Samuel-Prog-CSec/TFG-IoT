/**
 * @fileoverview Comando para salir de card registration.
 */

const BaseSocketCommand = require('./BaseSocketCommand');

class LeaveCardRegistrationCommand extends BaseSocketCommand {
  constructor() {
    super('leave_card_registration');
  }

  async execute({ socket, helpers }) {
    socket.leave(helpers.getRegistrationRoom(socket.data.userId));
    helpers.clearRfidModeState(socket.data.userId, socket.id);
  }
}

module.exports = LeaveCardRegistrationCommand;
