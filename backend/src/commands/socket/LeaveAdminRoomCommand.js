/**
 * @fileoverview Comando para salir de admin_room.
 */

const BaseSocketCommand = require('./BaseSocketCommand');
const { adminRoomEventSchema } = require('../../validators/socketCommandsValidator');

class LeaveAdminRoomCommand extends BaseSocketCommand {
  constructor() {
    super('leave_admin_room', { schema: adminRoomEventSchema });
  }

  async execute({ socket }) {
    socket.leave('admin_room');
  }
}

module.exports = LeaveAdminRoomCommand;
