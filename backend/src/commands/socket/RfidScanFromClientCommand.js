/**
 * @fileoverview Comando para procesar RFID desde cliente.
 */

const BaseSocketCommand = require('./BaseSocketCommand');

class RfidScanFromClientCommand extends BaseSocketCommand {
  constructor() {
    super('rfid_scan_from_client');
  }

  async execute({ socket, data, helpers, gameEngine, rfidService, logger }) {
    await helpers.handleRfidScanFromClient(socket, data, gameEngine, rfidService, logger);
  }
}

module.exports = RfidScanFromClientCommand;
