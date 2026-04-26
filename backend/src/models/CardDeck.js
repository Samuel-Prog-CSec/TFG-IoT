/**
 * @fileoverview Modelo de datos para mazos de tokens RFID fungibles.
 * Un mazo agrupa tarjetas RFID identificadas únicamente por su UID (token fungible),
 * asignándoles un significado dentro de un contexto educativo.
 * Las tarjetas no requieren registro previo en BD — cualquier tarjeta RFID
 * puede escanearse y asignarse directamente a un mazo (ADR-012).
 * @module models/CardDeck
 */

const mongoose = require('mongoose');
const { DECK_STATUS } = require('../constants/enums');

/**
 * Subdocumento: mapeo de un token RFID fungible a un valor dentro de un contexto.
 * Cada tarjeta se identifica únicamente por su UID físico (8 o 14 hex).
 * Se reutiliza posteriormente al crear GameSessions desde un mazo.
 */
const cardDeckMappingSchema = new mongoose.Schema(
  {
    uid: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: [/^[0-9A-F]{8}$|^[0-9A-F]{14}$/, 'UID debe ser 8 o 14 caracteres hexadecimales']
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
 * Esquema de Mongoose para mazos de tokens RFID fungibles.
 * Cada mazo agrupa tarjetas físicas (identificadas por UID) asignándoles
 * un valor semántico dentro de un contexto educativo (ADR-012).
 *
 * @typedef {Object} CardDeck
 * @property {string} name - Nombre del mazo
 * @property {string} [description] - Descripción opcional del mazo
 * @property {ObjectId} contextId - Referencia al contexto temático (GameContext)
 * @property {TokenMapping[]} cardMappings - Array de mapeos de tokens RFID en el mazo
 * @property {string} status - Estado del mazo ('active' o 'archived')
 * @property {ObjectId} createdBy - Referencia al usuario (profesor) que creó el mazo
 * @property {Date} createdAt - Fecha de creación del registro
 * @property {Date} updatedAt - Fecha de última actualización del registro
 *
 * @typedef {Object} TokenMapping
 * @property {string} uid - UID físico de la tarjeta RFID (8 o 14 hex, token fungible)
 * @property {string} assignedValue - Valor semántico asignado (ej: "España", "5", "Rojo")
 * @property {Mixed} displayData - Datos de visualización para el frontend (flexible)
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
      enum: DECK_STATUS,
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

// Validación: el mazo debe tener al menos 2 mapeos y como máximo 30
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

// Validación: UIDs únicos dentro del mazo (defensa en profundidad — complementa Zod)
CardDeckSchema.path('cardMappings').validate(value => {
  if (!Array.isArray(value)) {
    return true;
  }
  const uids = value.map(m => m.uid);
  return uids.length === new Set(uids).size;
}, 'No puede haber UIDs duplicados dentro del mismo mazo.');
// Índices
CardDeckSchema.index({ createdBy: 1, createdAt: -1 });
CardDeckSchema.index({ createdBy: 1, contextId: 1 });
CardDeckSchema.index({ status: 1 });
// Búsqueda eficiente de UIDs cross-deck por profesor (ADR-022)
CardDeckSchema.index({ createdBy: 1, status: 1, 'cardMappings.uid': 1 });
// Evitar nombres duplicados por profesor (UX más limpia)
CardDeckSchema.index({ createdBy: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('CardDeck', CardDeckSchema);
