/**
 * @fileoverview Comando para forzar siguiente ronda.
 */

const BaseSocketCommand = require('./BaseSocketCommand');

class NextRoundCommand extends BaseSocketCommand {
  constructor() {
    super('next_round');
  }

  async execute({ socket, data, helpers, gameEngine }) {
    const { playId } = data || {};
    if (!playId) {
      socket.emit('error', { message: 'playId requerido' });
      return;
    }

    if (!helpers.validatePlayId(socket, playId, 'next_round')) {
      return;
    }

    if (!helpers.requireSocketRole(socket, ['teacher', 'super_admin'], 'next_round')) {
      return;
    }

    const ownership = await helpers.requirePlayOwnership(socket, playId, 'next_round');
    if (!ownership) {
      return;
    }

    const result = await gameEngine.advanceToNextRound(playId);
    if (!result.ok) {
      if (result.reason === 'awaiting_response') {
        socket.emit('error', {
          message: 'No se puede avanzar de ronda mientras se espera una respuesta'
        });
        return;
      }

      socket.emit('error', { message: 'La partida no está activa en el motor de juego' });
    }
  }
}

module.exports = NextRoundCommand;
