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
 * @property {string} type - Tipo de tarjeta RFID (MIFARE 1KB, MIFARE 4KB, NTAG, UNKNOWN)
 * @property {string} status - Estado de la tarjeta (active, inactive, lost)
 * @property {Object} metadata - Metadatos adicionales de la tarjeta
 * @property {string} [metadata.color] - Color asociado a la tarjeta para identificación visual
 * @property {string} [metadata.icon] - Icono asociado a la tarjeta
 * @property {Date} [metadata.lastUsed] - Última fecha de uso de la tarjeta
 * @property {Date} createdAt - Fecha de creación del registro (añadido por timestamps)
 * @property {Date} updatedAt - Fecha de última actualización (añadido por timestamps)
 */
const cardSchema = new mongoose.Schema({
  uid: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  type: {
    type: String,
    uppercase: true,
    trim: true,
    enum: ['MIFARE 1KB', 'MIFARE 4KB', 'NTAG', 'UNKNOWN'],
    default: 'NTAG'
  },
  status: {
    type: String,
    lowercase: true,
    trim: true,
    enum: ['active', 'inactive', 'lost'],
    default: 'active'
  },
  metadata: {
    color: String,
    icon: String,
    lastUsed: Date
  }
}, {
  timestamps: true, // Añade createdAt y updatedAt automáticamente
  collection: 'cards'
});

/**
 * Índice para filtrar tarjetas por estado.
 * Útil para listar tarjetas activas/inactivas en el panel de administración.
 */
cardSchema.index({ status: 1 });

/**
 * Actualiza la fecha del último uso de la tarjeta.
 * Este método debe ser llamado cada vez que se escanea la tarjeta en una partida.
 *
 * @instance
 * @memberof Card
 * @returns {Promise<Card>} Promesa que resuelve con el documento actualizado
 * @example
 * const card = await Card.findOne({ uid: '32B8FA05' });
 * await card.updateLastUsed();
 */
cardSchema.methods.updateLastUsed = function() {
  this.metadata.lastUsed = new Date();
  return this.save();
};

module.exports = mongoose.model('Card', cardSchema);
