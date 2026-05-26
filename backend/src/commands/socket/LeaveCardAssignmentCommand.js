/**
 * @fileoverview Comando para salir de card assignment.
 */

const BaseSocketCommand = require('./BaseSocketCommand');
const { cardAssignmentEventSchema } = require('../../validators/socketCommandsValidator');

class LeaveCardAssignmentCommand extends BaseSocketCommand {
  constructor() {
    super('leave_card_assignment', { schema: cardAssignmentEventSchema });
  }

  async execute({ socket, helpers }) {
    socket.leave(helpers.getAssignmentRoom(socket.data.userId));
    helpers.clearRfidModeState(socket.data.userId, socket.id);
  }
}

module.exports = LeaveCardAssignmentCommand;
