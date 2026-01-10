/**
 * @fileoverview Modelo de datos para tarjetas RFID físicas del sistema.
 * Representa una tarjeta física que puede ser escaneada por el lector RC522.
 * @module models/Card
 */

const mongoose = require('mongoose');

/**
 * Esquema de Mongoose para tarjetas RFID.
 *
 * NOTA: El campo 'alias' fue eliminado (duda #2) ya que es redundante.
 * Las tarjetas obtienen su significado contextual a través del campo 'assignedValue'
 * en GameSession.cardMappings cuando el profesor crea una sesión de juego.
 *
 * @typedef {Object} Card
 * @property {string} uid - Identificador único de la tarjeta (8 o 14 caracteres hexadecimales)
 * @property {string} type - Tipo de tarjeta RFID (MIFARE_1KB, MIFARE_4KB, NTAG, UNKNOWN)
 * @property {string} status - Estado de la tarjeta (active, inactive, lost)
 * @property {Date} createdAt - Fecha de creación del registro (añadido por timestamps)
 * @property {Date} updatedAt - Fecha de última actualización (añadido por timestamps)
 */
const cardSchema = new mongoose.Schema(
  {
    uid: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[0-9A-F]{8}$|^[0-9A-F]{14}$/, 'UID debe ser 8 o 14 caracteres hexadecimales']
    },
    type: {
      type: String,
      uppercase: true,
      trim: true,
      enum: ['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN'],
      default: 'UNKNOWN'
    },
    status: {
      type: String,
      lowercase: true,
      trim: true,
      enum: ['active', 'inactive', 'lost'],
      default: 'active'
    }
  },
  {
    timestamps: true, // Añade createdAt y updatedAt automáticamente
    collection: 'cards'
  }
);

/**
 * Índice para filtrar tarjetas por estado.
 * Útil para listar tarjetas activas/inactivas en el panel de administración.
 */
cardSchema.index({ status: 1 });

module.exports = mongoose.model('Card', cardSchema);
