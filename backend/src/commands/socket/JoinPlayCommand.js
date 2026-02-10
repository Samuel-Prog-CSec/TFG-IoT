/**
 * @fileoverview Comando para unir a una partida.
 */

const BaseSocketCommand = require('./BaseSocketCommand');

class JoinPlayCommand extends BaseSocketCommand {
  constructor() {
    super('join_play');
  }

  async execute({ socket, data, helpers, logger, gameEngine }) {
    const { playId } = data || {};
    if (!playId) {
      socket.emit('error', { message: 'playId requerido' });
      return;
    }

    if (!helpers.validatePlayId(socket, playId, 'join_play')) {
      return;
    }

    if (!helpers.requireSocketRole(socket, ['teacher', 'super_admin'], 'join_play')) {
      return;
    }

    const ownership = await helpers.requirePlayOwnership(socket, playId, 'join_play');
    if (!ownership) {
      return;
    }

    socket.join(helpers.getPlayRoom(playId));

    logger.info(`Socket ${socket.id} se unio a la partida ${playId}`, {
      userId: socket.data.userId
    });

    helpers.setRfidModeState(socket.data.userId, helpers.RFID_MODES.GAMEPLAY, socket.id, {
      playId
    });

    const playState = gameEngine.getPlayState(playId);
    if (playState) {
      socket.emit('play_state', playState);
    }
  }
}

module.exports = JoinPlayCommand;
