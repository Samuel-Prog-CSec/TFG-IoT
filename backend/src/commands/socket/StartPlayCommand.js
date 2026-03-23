/**
 * @fileoverview Comando para iniciar una partida.
 */

const BaseSocketCommand = require('./BaseSocketCommand');

class StartPlayCommand extends BaseSocketCommand {
  constructor() {
    super('start_play');
  }

  async execute({ socket, data, helpers, logger, gameEngine }) {
    try {
      const { playId } = data || {};
      if (!playId) {
        socket.emit('error', { code: 'VALIDATION_ERROR', message: 'playId requerido' });
        return;
      }

      if (!helpers.validatePlayId(socket, playId, 'start_play')) {
        return;
      }

      if (!helpers.requireSocketRole(socket, ['teacher', 'super_admin'], 'start_play')) {
        return;
      }

      const ownership = await helpers.requirePlayOwnership(socket, playId, 'start_play', {
        includeSessionRuntime: true
      });
      if (!ownership) {
        return;
      }

      await gameEngine.startPlay(ownership.play, ownership.session);

      logger.info(`Partida comenzada: ${playId}`, {
        userId: socket.data.userId
      });
    } catch (error) {
      logger.error(`Error al iniciar la partida: ${error.message}`);
      socket.emit('error', { code: 'ENGINE_ERROR', message: 'Error al iniciar la partida' });
    }
  }
}

module.exports = StartPlayCommand;
