/**
 * @fileoverview Validadores Zod para eventos RFID desde el cliente.
 * @module validators/rfidValidator
 */

const { z } = require('zod');
const { uidSchema } = require('./commonValidator');

const RFID_CARD_TYPES = ['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN'];
const RFID_CLIENT_MAX_TIMESTAMP_SKEW_MS =
  Number.parseInt(process.env.RFID_CLIENT_MAX_TIMESTAMP_SKEW_MS, 10) || 30000;

const rfidClientEventSchema = z
  .object({
    uid: uidSchema,
    type: z.enum(RFID_CARD_TYPES),
    sensorId: z
      .string()
      .trim()
      .min(1, 'sensorId inválido')
      .max(64, 'sensorId inválido')
      .regex(/^[a-zA-Z0-9:_-]+$/, 'sensorId inválido'),
    timestamp: z.number().int().positive('timestamp inválido'),
    source: z.literal('web_serial')
  })
  .superRefine((value, ctx) => {
    if (Math.abs(Date.now() - value.timestamp) <= RFID_CLIENT_MAX_TIMESTAMP_SKEW_MS) {
      return;
    }

    ctx.addIssue({
      code: 'custom',
      path: ['timestamp'],
      message: `timestamp fuera de ventana permitida (±${Math.floor(
        RFID_CLIENT_MAX_TIMESTAMP_SKEW_MS / 1000
      )}s)`
    });
  })
  .strict();

module.exports = {
  rfidClientEventSchema,
  RFID_CARD_TYPES
};
