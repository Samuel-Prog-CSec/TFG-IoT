/**
 * @fileoverview Comando para unir a una partida.
 */

const BaseSocketCommand = require('./BaseSocketCommand');
const { playIdEventSchema } = require('../../validators/socketCommandsValidator');

class JoinPlayCommand extends BaseSocketCommand {
  constructor() {
    super('join_play', { schema: playIdEventSchema });
  }

  async execute({ socket, data, helpers, logger, gameEngine }) {
    const { playId } = data;

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

    // WS-12: `await` el cambio de modo RFID. Sin él, un RFID_LOCK_TIMEOUT (10s) en el
    // lock RFID del usuario se convertía en unhandledRejection (escapa del try/catch
    // del pipeline `executeSocketCommand`). Además, activar el modo GAMEPLAY ANTES de
    // emitir `play_state` evita que un scan inmediato tras el join se rechace con
    // RFID_MODE_INVALID porque la cola del lock RFID iba retrasada.
    await helpers.setRfidModeState(socket.data.userId, helpers.RFID_MODES.GAMEPLAY, socket.id, {
      playId
    });

    const playState = gameEngine.getPlayState(playId);
    if (playState) {
      socket.emit('play_state', playState);
    }
  }
}

module.exports = JoinPlayCommand;
