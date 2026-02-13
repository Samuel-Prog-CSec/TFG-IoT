/**
 * @fileoverview Comando para pausar una partida.
 */

const BaseSocketCommand = require('./BaseSocketCommand');

class PausePlayCommand extends BaseSocketCommand {
  constructor() {
    super('pause_play');
  }

  async execute({ socket, data, helpers, logger, gameEngine }) {
    try {
      const { playId } = data || {};
      if (!playId) {
        socket.emit('error', { message: 'playId requerido' });
        return;
      }

      if (!helpers.validatePlayId(socket, playId, 'pause_play')) {
        return;
      }

      if (!helpers.requireSocketRole(socket, ['teacher', 'super_admin'], 'pause_play')) {
        return;
      }

      const ownership = await helpers.requirePlayOwnership(socket, playId, 'pause_play');
      if (!ownership) {
        return;
      }

      await gameEngine.pausePlayInternal(playId, { requestedBy: socket.data.userId });
      helpers.setRfidModeState(socket.data.userId, helpers.RFID_MODES.IDLE, socket.id);
    } catch (error) {
      logger.error(`Error al pausar la partida: ${error.message}`);
      socket.emit('error', { message: 'Error al pausar la partida' });
    }
  }
}

module.exports = PausePlayCommand;
