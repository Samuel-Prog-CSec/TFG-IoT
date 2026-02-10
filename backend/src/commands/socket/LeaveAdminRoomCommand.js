/**
 * @fileoverview Comando para salir de admin_room.
 */

const BaseSocketCommand = require('./BaseSocketCommand');

class LeaveAdminRoomCommand extends BaseSocketCommand {
  constructor() {
    super('leave_admin_room');
  }

  async execute({ socket }) {
    socket.leave('admin_room');
  }
}

module.exports = LeaveAdminRoomCommand;
