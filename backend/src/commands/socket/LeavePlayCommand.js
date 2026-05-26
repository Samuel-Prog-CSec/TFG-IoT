/**
 * @fileoverview Comando para abandonar una partida.
 */

const BaseSocketCommand = require('./BaseSocketCommand');
const { playIdEventSchema } = require('../../validators/socketCommandsValidator');

class LeavePlayCommand extends BaseSocketCommand {
  constructor() {
    super('leave_play', { schema: playIdEventSchema });
  }

  async execute({ socket, data, helpers, logger }) {
    const { playId } = data;

    if (!helpers.validatePlayId(socket, playId, 'leave_play')) {
      return;
    }

    if (!helpers.requireSocketRole(socket, ['teacher', 'super_admin'], 'leave_play')) {
      return;
    }

    const ownership = await helpers.requirePlayOwnership(socket, playId, 'leave_play');
    if (!ownership) {
      return;
    }

    socket.leave(helpers.getPlayRoom(playId));
    helpers.clearRfidModeState(socket.data.userId, socket.id);

    logger.info(`Socket ${socket.id} abandono la partida ${playId}`, {
      userId: socket.data.userId
    });
  }
}

module.exports = LeavePlayCommand;
