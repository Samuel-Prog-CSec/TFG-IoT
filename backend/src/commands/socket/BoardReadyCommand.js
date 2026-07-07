/**
 * @fileoverview Comando para confirmar que el tablero de memoria está visible en el cliente.
 * El timer de la partida de memoria solo empieza cuando el frontend confirma que el tablero se renderizó.
 */

const BaseSocketCommand = require('./BaseSocketCommand');
const { playIdEventSchema } = require('../../validators/socketCommandsValidator');

class BoardReadyCommand extends BaseSocketCommand {
  constructor() {
    super('board_ready', { schema: playIdEventSchema });
  }

  async execute({ socket, data, helpers, logger, gameEngine }) {
    try {
      const { playId } = data;

      if (!helpers.validatePlayId(socket, playId, 'board_ready')) {
        return;
      }

      // Solo los roles con socket autenticado (docente/super_admin) y dueños de
      // la sesión pueden arrancar el temporizador del tablero. Sin esta
      // comprobación, cualquier socket autenticado podía disparar
      // `confirmBoardReady` sobre la partida de OTRO docente (sabotaje del timer).
      if (!helpers.requireSocketRole(socket, ['teacher', 'super_admin'], 'board_ready')) {
        return;
      }

      const ownership = await helpers.requirePlayOwnership(socket, playId, 'board_ready');
      if (!ownership) {
        return;
      }

      await gameEngine.confirmBoardReady(playId);

      logger.info('Tablero de memoria confirmado como visible', {
        playId,
        userId: socket.data.userId
      });
    } catch (error) {
      logger.error(`Error en board_ready: ${error.message}`);
    }
  }
}

module.exports = BoardReadyCommand;
