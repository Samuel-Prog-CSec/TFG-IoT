/**
 * @fileoverview Comando para unir a card assignment.
 */

const BaseSocketCommand = require('./BaseSocketCommand');
const { cardAssignmentEventSchema } = require('../../validators/socketCommandsValidator');

class JoinCardAssignmentCommand extends BaseSocketCommand {
  constructor() {
    super('join_card_assignment', { schema: cardAssignmentEventSchema });
  }

  async execute({ socket, helpers, logger }) {
    if (!helpers.requireSocketRole(socket, ['teacher', 'super_admin'], 'join_card_assignment')) {
      return;
    }

    socket.join(helpers.getAssignmentRoom(socket.data.userId));
    // WS-12: await el cambio de modo RFID (escapaba del try/catch del pipeline como
    // unhandledRejection ante un RFID_LOCK_TIMEOUT).
    await helpers.setRfidModeState(
      socket.data.userId,
      helpers.RFID_MODES.CARD_ASSIGNMENT,
      socket.id
    );

    logger.info(`Socket ${socket.id} se unio a card_assignment`, {
      userId: socket.data.userId
    });
  }
}

module.exports = JoinCardAssignmentCommand;
