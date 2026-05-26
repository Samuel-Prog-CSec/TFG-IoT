/**
 * @fileoverview Comando para pausar una partida.
 */

const BaseSocketCommand = require('./BaseSocketCommand');
const { playIdEventSchema } = require('../../validators/socketCommandsValidator');

class PausePlayCommand extends BaseSocketCommand {
  constructor() {
    super('pause_play', { schema: playIdEventSchema });
  }

  async execute({ socket, data, helpers, logger, gameEngine }) {
    try {
      // Defense in depth: aunque `executeSocketCommand` ya aplica el schema
      // Zod, este guard permite que los tests unitarios invoquen el command
      // directamente y mantiene compatibilidad con cualquier código futuro
      // que use `execute()` sin pasar por el pipeline.
      const { playId } = data || {};
      if (!playId) {
        socket.emit('error', { code: 'VALIDATION_ERROR', message: 'playId requerido' });
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
      socket.emit('error', { code: 'ENGINE_ERROR', message: 'Error al pausar la partida' });
    }
  }
}

module.exports = PausePlayCommand;
