/**
 * @fileoverview Comando para salir de card assignment.
 */

const BaseSocketCommand = require('./BaseSocketCommand');

class LeaveCardAssignmentCommand extends BaseSocketCommand {
  constructor() {
    super('leave_card_assignment');
  }

  async execute({ socket, helpers }) {
    socket.leave(helpers.getAssignmentRoom(socket.data.userId));
    helpers.clearRfidModeState(socket.data.userId, socket.id);
  }
}

module.exports = LeaveCardAssignmentCommand;
