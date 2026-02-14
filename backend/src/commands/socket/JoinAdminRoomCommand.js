/**
 * @fileoverview Comando para unir a admin_room.
 */

const BaseSocketCommand = require('./BaseSocketCommand');

class JoinAdminRoomCommand extends BaseSocketCommand {
  constructor() {
    super('join_admin_room');
  }

  async execute({ socket, helpers, logger }) {
    if (!helpers.requireSocketRole(socket, ['super_admin'], 'join_admin_room')) {
      return;
    }

    socket.join('admin_room');
    logger.info(`Socket ${socket.id} se unio a admin_room`);
  }
}

module.exports = JoinAdminRoomCommand;
