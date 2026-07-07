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
      // La partida NO está en memoria (`activePlays`). Caso crítico: tras un
      // reinicio del servidor, `recoverActivePlays` marca las partidas en curso
      // como `abandoned` y emite `play_interrupted` ANTES de que el servidor
      // escuche sockets (se pierde, no hay nadie conectado). Al reconectar, el
      // cliente pide `play_state_sync` y antes recibía `play_state: null`, que
      // `handlePlayState` ignora → el cliente quedaba COLGADO para siempre con un
      // playId muerto (los escaneos se rechazan; única salida = F5). Si la partida
      // está en estado terminal en BD, le mandamos `play_interrupted` (lo gestiona
      // `handlePlayInterrupted` en el cliente, que tiene fallback de finalScore y
      // mecánica) para sacarlo a la pantalla final. (El `status` ya viene de
      // `requirePlayOwnership`, consulta fresca tras el reinicio.)
      const dbStatus = ownership?.play?.status;
      if (dbStatus === 'abandoned' || dbStatus === 'completed') {
        socket.emit('play_interrupted', {
          playId,
          reason: 'server_restart',
          message:
            'La partida se interrumpió (reinicio del servidor o limpieza). Consulta al docente.'
        });
        logger.info(
          `play_state_sync: partida ${playId} terminal (${dbStatus}); play_interrupted emitido`,
          {
            playId,
            socketId: socket.id,
            status: dbStatus
          }
        );
        return;
      }
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
