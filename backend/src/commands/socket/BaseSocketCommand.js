/**
 * @fileoverview Contrato base para comandos Socket.IO.
 */

class BaseSocketCommand {
  constructor(name) {
    this.name = name;
  }

  getName() {
    return this.name;
  }

  async execute() {
    throw new Error('execute() no implementado');
  }
}

module.exports = BaseSocketCommand;
