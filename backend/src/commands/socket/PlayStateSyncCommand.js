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

    // 2. Verificar rol. Igual que `join_play`: el socket de juego lo conduce el
    //    docente (el sensor RFID es USB en su equipo), no el alumno.
    if (!helpers.requireSocketRole(socket, ['teacher', 'super_admin'], this.getName())) {
      return;
    }

    // 3. Verificar propiedad de la partida (defensa IDOR). El snapshot de
    //    `getPlayState` incluye `currentChallenge` (con la respuesta esperada), el
    //    tablero de Memoria, score y ronda: NO es público. Un `playId` es un
    //    ObjectId que aparece en URLs/DTOs (identificador, no secreto), así que sin
    //    esta comprobación cualquier usuario autenticado podía emitir
    //    `play_state_sync` con el playId de otra aula y leer su partida en vivo
    //    (incluida la respuesta). `requirePlayOwnership` reutiliza la caché de
    //    ownership, así que el coste por reconexión es mínimo.
    const ownership = await helpers.requirePlayOwnership(socket, playId, this.getName());
    if (!ownership) {
      return;
    }

    // 4. Obtener estado actual de la partida desde el motor de juego
    const playState = gameEngine.getPlayState(playId);

    if (!playState) {
      socket.emit('play_state', null);
      logger.debug(`play_state_sync: partida ${playId} no encontrada en memoria`, {
        playId,
        socketId: socket.id
      });
      return;
    }

    // 5. Enviar estado al cliente
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
