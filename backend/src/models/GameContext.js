/**
 * @fileoverview Modelo de datos para contextos temáticos de las mecánicas de juego.
 * Define los temas específicos que puede tener una mecánica (geografía, historia, ciencias, etc.).
 * @module models/GameContext
 */

const mongoose = require('mongoose');

/**
 * Esquema de Mongoose para contextos de juego.
 * Un contexto define el tema y los assets (recursos) específicos para una mecánica.
 *
 * @typedef {Object} GameContext
 * @property {ObjectId} mechanicId - Referencia a la mecánica a la que pertenece este contexto
 * @property {string} contextId - Identificador único del contexto (ej: 'geography', 'history')
 * @property {string} name - Nombre amigable del contexto para mostrar en la interfaz
 * @property {Array<Asset>} assets - Array de recursos/elementos del contexto
 * @property {string} difficulty - Nivel de dificultad del contexto (easy, medium, hard)
 * @property {Date} createdAt - Fecha de creación del registro
 * @property {Date} updatedAt - Fecha de última actualización
 *
 * @typedef {Object} Asset
 * @property {string} key - Clave única del elemento (ej: 'spain', 'france')
 * @property {string} [display] - Representación visual del elemento (ej: emoji de bandera '🇪🇸')
 * @property {string} value - Valor textual del elemento (ej: 'España', 'Francia')
 * @property {string} [audioUrl] - URL del archivo de audio asociado
 * @property {string} [imageUrl] - URL de la imagen asociada
 */
const gameContextSchema = new mongoose.Schema({
  mechanicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GameMechanic',
    required: true
  },
  contextId: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  assets: [{
    key: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    display: String,
    value: {
      type: String,
      required: true,
      trim: true
    },
    audioUrl: String,
    imageUrl: String
  }],
  difficulty: {
    type: String,
    lowercase: true,
    trim: true,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  }
}, {
  timestamps: true
});

/**
 * Validación personalizada para el array de assets.
 * Asegura que cada contexto tenga al menos un asset disponible.
 *
 * @param {Array<Asset>} value - El array de assets a validar
 * @returns {boolean} true si el array no está vacío, false en caso contrario
 */
gameContextSchema.path('assets').validate(function(value) {
  if (value.length === 0) {
    return false;
  }
  return true;
}, 'El array de assets no puede estar vacío.');

/**
 * Índice compuesto para búsqueda eficiente de contextos por mecánica.
 * Usado para listar todos los contextos disponibles para una mecánica específica.
 */
gameContextSchema.index({ mechanicId: 1, contextId: 1 });

module.exports = mongoose.model('GameContext', gameContextSchema);
