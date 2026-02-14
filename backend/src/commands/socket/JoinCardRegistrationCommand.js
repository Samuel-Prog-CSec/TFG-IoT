/**
 * @fileoverview Comando para unir a card registration.
 */

const BaseSocketCommand = require('./BaseSocketCommand');

class JoinCardRegistrationCommand extends BaseSocketCommand {
  constructor() {
    super('join_card_registration');
  }

  async execute({ socket, helpers, logger }) {
    if (!helpers.requireSocketRole(socket, ['teacher', 'super_admin'], 'join_card_registration')) {
      return;
    }

    socket.join(helpers.getRegistrationRoom(socket.data.userId));
    helpers.setRfidModeState(socket.data.userId, helpers.RFID_MODES.CARD_REGISTRATION, socket.id);

    logger.info(`Socket ${socket.id} se unio a card_registration`, {
      userId: socket.data.userId
    });
  }
}

module.exports = JoinCardRegistrationCommand;
