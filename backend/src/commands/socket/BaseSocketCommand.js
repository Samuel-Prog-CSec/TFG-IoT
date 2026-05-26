/**
 * @fileoverview Contrato base para comandos Socket.IO.
 *
 * Cada subclase representa un evento del namespace `/game`. Si la subclase
 * declara un `schema` Zod, el pipeline (`executeSocketCommand`) lo aplica
 * sobre el `data` recibido y rechaza al cliente con `PAYLOAD_INVALID` si
 * no valida, evitando que el `execute()` vea payloads malformados.
 */

class BaseSocketCommand {
  /**
   * @param {string} name - nombre del evento socket.io
   * @param {object} [options]
   * @param {import('zod').ZodSchema|null} [options.schema=null] - Schema Zod
   *   opcional para validar el `data` del evento antes de ejecutar.
   */
  constructor(name, { schema = null } = {}) {
    this.name = name;
    this.schema = schema;
  }

  getName() {
    return this.name;
  }

  getSchema() {
    return this.schema;
  }

  async execute() {
    throw new Error('execute() no implementado');
  }
}

module.exports = BaseSocketCommand;
