/**
 * @fileoverview Comando para reanudar una partida.
 */

const BaseSocketCommand = require('./BaseSocketCommand');

class ResumePlayCommand extends BaseSocketCommand {
  constructor() {
    super('resume_play');
  }

  async execute({ socket, data, helpers, logger, gameEngine }) {
    try {
      const { playId } = data || {};
      if (!playId) {
        socket.emit('error', { code: 'VALIDATION_ERROR', message: 'playId requerido' });
        return;
      }

      if (!helpers.validatePlayId(socket, playId, 'resume_play')) {
        return;
      }

      if (!helpers.requireSocketRole(socket, ['teacher', 'super_admin'], 'resume_play')) {
        return;
      }

      const ownership = await helpers.requirePlayOwnership(socket, playId, 'resume_play');
      if (!ownership) {
        return;
      }

      await gameEngine.resumePlayInternal(playId, { requestedBy: socket.data.userId });
      helpers.setRfidModeState(socket.data.userId, helpers.RFID_MODES.GAMEPLAY, socket.id, {
        playId
      });
    } catch (error) {
      logger.error(`Error al reanudar la partida: ${error.message}`);
      socket.emit('error', { code: 'ENGINE_ERROR', message: 'Error al reanudar la partida' });
    }
  }
}

module.exports = ResumePlayCommand;
