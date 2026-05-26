/**
 * @fileoverview Comando Socket.IO para sincronizar estado de partida tras reconexión.
 * Permite al cliente solicitar un snapshot completo del estado actual de una partida activa.
 * @module commands/socket/PlayStateSyncCommand
 */

const BaseSocketCommand = require('./BaseSocketCommand');
const { playIdEventSchema } = require('../../validators/socketCommandsValidator');

class PlayStateSyncCommand extends BaseSocketCommand {
  constructor() {
    super('play_state_sync', { schema: playIdEventSchema });
  }

  async execute(context) {
    const { socket, data, logger, gameEngine, helpers } = context;
    const { playId } = data;

    // 1. Validar formato de playId
    if (!helpers.validatePlayId(socket, playId, this.getName())) {
      return;
    }

    // 2. Verificar rol
    if (!helpers.requireSocketRole(socket, ['teacher', 'student', 'super_admin'], this.getName())) {
      return;
    }

    // Nota: no se valida ownership (requirePlayOwnership) deliberadamente.
    // - getPlayState() solo retorna datos de gameplay público (score, ronda, challenge)
    // - Añadir ownership requeriría una consulta a DB en cada reconexión
    // - El rate limit (2/s) y la autenticación ya limitan el abuso
    // - El playId solo lo conoce el cliente que estaba en la partida

    // 3. Obtener estado actual de la partida desde el motor de juego
    const playState = gameEngine.getPlayState(playId);

    if (!playState) {
      socket.emit('play_state', null);
      logger.debug(`play_state_sync: partida ${playId} no encontrada en memoria`, {
        playId,
        socketId: socket.id
      });
      return;
    }

    // 4. Enviar estado al cliente
    socket.emit('play_state', playState);

    logger.debug(`play_state_sync: estado enviado para partida ${playId}`, {
      playId,
      socketId: socket.id,
      currentRound: playState.currentRound,
      score: playState.score
    });
  }
}

module.exports = PlayStateSyncCommand;
