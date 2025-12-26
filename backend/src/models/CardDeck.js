/**
 * @fileoverview Modelo de datos para mazos de cartas de tarjetas RFID del sistema.
 * Representa un conjunto de tarjetas físicas que pueden ser escaneadas por el lector RC522.
 * A estas tarjetas se les ha pre-asignado un significado específico dentro del contexto de un juego o actividad.
 * Se utilizan para facilitar la gestión y organización de las tarjetas en grupos lógicos.
 * Los mazos se asignan a sesiones de juego para definir qué tarjetas están disponibles y su función dentro de esa sesión.
 * @module models/CardDeck
 */

const mongoose = require('mongoose');

/**
 * Subdocumento: mapeo de una tarjeta RFID a un valor dentro de un contexto.
 * Se reutiliza posteriormente al crear GameSessions desde un mazo.
 */
const cardDeckMappingSchema = new mongoose.Schema(
  {
    cardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Card',
      required: true
    },
    uid: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    assignedValue: {
      type: String,
      required: true,
      trim: true
    },
    displayData: mongoose.Schema.Types.Mixed
  },
  {
    _id: true
  }
);

/**
 * Esquema de Mongoose para mazos de cartas de tarjetas RFID.
 *
 * @typedef {Object} CardDeck
 * @property {string} name - Nombre del mazo
 * @property {string} [description] - Descripción opcional del mazo
 * @property {ObjectId} contextId - Referencia al contexto temático (GameContext)
 * @property {CardMapping[]} cardMappings - Array de mapeos de tarjetas en el mazo
 * @property {string} status - Estado del mazo ('active' o 'archived')
 * @property {ObjectId} createdBy - Referencia al usuario (profesor) que creó el mazo
 * @property {Date} createdAt - Fecha de creación del registro
 * @property {Date} updatedAt - Fecha de última actualización del registro
 *
 */
const CardDeckSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    contextId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameContext',
      required: true
    },
    cardMappings: {
      type: [cardDeckMappingSchema],
      default: []
    },
    status: {
      type: String,
      lowercase: true,
      trim: true,
      enum: ['active', 'archived'],
      default: 'active'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true, // Añade createdAt y updatedAt automáticamente
    collection: 'card_decks'
  }
);

// Validación: el mazo debe tener al menos 2 mapeos y como máximo 20
CardDeckSchema.path('cardMappings').validate(value => {
  if (!Array.isArray(value)) {
    return false;
  }
  if (value.length < 2) {
    return false;
  }
  if (value.length > 30) {
    return false;
  }
  return true;
}, 'El mazo debe tener entre 2 y 30 mapeos de tarjetas.');
// Índices
CardDeckSchema.index({ createdBy: 1, createdAt: -1 });
CardDeckSchema.index({ createdBy: 1, contextId: 1 });
CardDeckSchema.index({ status: 1 });
// Evitar nombres duplicados por profesor (UX más limpia)
CardDeckSchema.index({ createdBy: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('CardDeck', CardDeckSchema);
