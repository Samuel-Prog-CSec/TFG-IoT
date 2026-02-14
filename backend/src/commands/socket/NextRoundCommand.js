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

    gameEngine.sendNextRound(playId);
  }
}

module.exports = NextRoundCommand;
