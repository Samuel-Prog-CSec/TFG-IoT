/**
 * @fileoverview Esquemas Zod para payloads de comandos Socket.IO.
 *
 * Centraliza la validación del `data` que llega a cada handler en
 * `commands/socket/`. Antes cada command hacía `if (!playId)` manualmente,
 * sin verificar tipo, longitud ni rechazar parámetros desconocidos. Aplicar
 * Zod en el pipeline (`executeSocketCommand`) blinda contra payloads
 * malformados antes de que el comando vea los datos y devuelve mensajes de
 * error uniformes al cliente.
 *
 * Convención: cada schema usa `.strict()` para rechazar parámetros extra y
 * `objectIdSchema` para los IDs (24 chars hex). El RFID scan tiene su propio
 * esquema (`rfidClientEventSchema`) y se valida dentro de
 * `handleRfidScanFromClient`; no se duplica aquí.
 *
 * @module validators/socketCommandsValidator
 */

const { z } = require('zod');
const { objectIdSchema } = require('./commonValidator');

/**
 * Payload de comandos que operan sobre una partida concreta:
 *   join_play, leave_play, start_play, pause_play, resume_play,
 *   next_round, play_state_sync, board_ready.
 */
const playIdEventSchema = z
  .object({
    playId: objectIdSchema
  })
  .strict();

/**
 * Payload de comandos de asignación de tarjetas (sin parámetros — el
 * `userId` viene de `socket.data`).
 *   join_card_assignment, leave_card_assignment.
 */
const cardAssignmentEventSchema = z.object({}).strict();

/**
 * Payload de comandos de la sala admin (sin parámetros — el rol se
 * comprueba en el handler).
 *   join_admin_room, leave_admin_room.
 */
const adminRoomEventSchema = z.object({}).strict();

module.exports = {
  playIdEventSchema,
  cardAssignmentEventSchema,
  adminRoomEventSchema
};
