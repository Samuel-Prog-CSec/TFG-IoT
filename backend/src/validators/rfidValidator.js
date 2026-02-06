/**
 * @fileoverview Validadores Zod para eventos RFID desde el cliente.
 * @module validators/rfidValidator
 */

const { z } = require('zod');
const { uidSchema } = require('./commonValidator');

const RFID_CARD_TYPES = ['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN'];

const rfidClientEventSchema = z
  .object({
    uid: uidSchema,
    type: z.enum(RFID_CARD_TYPES),
    sensorId: z.string().trim().min(1, 'sensorId inválido'),
    timestamp: z.number().int().positive('timestamp inválido'),
    source: z.literal('web_serial')
  })
  .strict();

module.exports = {
  rfidClientEventSchema,
  RFID_CARD_TYPES
};
