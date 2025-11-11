/**
 * @fileoverview Modelo de datos para sesiones de juego configuradas por el profesor.
 * Define la configuración completa de un juego antes de que los estudiantes lo jueguen.
 * @module models/GameSession
 */

const mongoose = require('mongoose');

/**
 * Esquema de Mongoose para sesiones de juego.
 * Una sesión es la configuración completa de un juego: mecánica, contexto, tarjetas y reglas.
 *
 * @typedef {Object} GameSession
 * @property {ObjectId} mechanicId - Referencia a la mecánica de juego utilizada
 * @property {ObjectId} contextId - Referencia al contexto temático del juego
 * @property {Object} config - Configuración de las reglas del juego
 * @property {number} config.numberOfCards - Cantidad de tarjetas RFID usadas en el juego (2-20)
 * @property {number} config.numberOfRounds - Número de rondas/desafíos del juego
 * @property {number} config.timeLimit - Tiempo límite por ronda en segundos (3-60)
 * @property {number} config.pointsPerCorrect - Puntos otorgados por respuesta correcta
 * @property {number} config.penaltyPerError - Puntos restados por respuesta incorrecta (número negativo)
 * @property {Array<CardMapping>} cardMappings - Mapeo de tarjetas RFID a valores del juego
 * @property {string} status - Estado de la sesión (created, active, paused, completed)
 * @property {Date} [startedAt] - Fecha y hora de inicio de la sesión
 * @property {Date} [endedAt] - Fecha y hora de finalización de la sesión
 * @property {string} [createdBy] - ID del usuario que creó la sesión (profesor)
 * @property {Date} createdAt - Fecha de creación del registro
 * @property {Date} updatedAt - Fecha de última actualización
 *
 * @typedef {Object} CardMapping
 * @property {ObjectId} cardId - Referencia al documento de la tarjeta RFID
 * @property {string} uid - UID de la tarjeta (denormalizado para búsquedas rápidas)
 * @property {string} assignedValue - Valor asignado a esta tarjeta para el juego
 * @property {Mixed} displayData - Datos de visualización para el frontend (flexible)
 */
const gameSessionSchema = new mongoose.Schema({
  mechanicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GameMechanic',
    required: true
  },
  contextId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GameContext',
    required: true
  },
  config: {
    numberOfCards: {
      type: Number,
      required: true,
      min: 2,
      max: 20
    },
    numberOfRounds: {
      type: Number,
      min: 1,
      max: 20,
      default: 5
    },
    timeLimit: {
      type: Number,
      min: 3,
      max: 60,
      default: 15
    },
    pointsPerCorrect: {
      type: Number,
      min: [1, 'Los puntos por acierto deben ser mayores que 0'],
      default: 10,
      validate: {
        validator: Number.isInteger,
        message: 'Los puntos por acierto deben ser un entero'
      }
    },
    penaltyPerError: {
      type: Number,
      max: [-1, 'Los puntos por error deben ser menores que 0'],
      default: -2,
      validate: {
        validator: Number.isInteger,
        message: 'Los puntos por error deben ser un entero'
      }
    }
  },
  cardMappings: [{
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
      required: true
    },
    displayData: mongoose.Schema.Types.Mixed
  }],
  status: {
    type: String,
    lowercase: true,
    trim: true,
    enum: ['created', 'active', 'paused', 'completed'],
    default: 'created'
  },
  startedAt: Date,
  endedAt: Date,
  createdBy: String
}, {
  timestamps: true
});

/**
 * Inicia la sesión de juego.
 * Cambia el estado a 'active' y registra la hora de inicio.
 *
 * @instance
 * @memberof GameSession
 * @returns {Promise<GameSession>} Promesa que resuelve con el documento actualizado
 */
gameSessionSchema.methods.start = function() {
  this.status = 'active';
  this.startedAt = new Date();
  return this.save();
};

/**
 * Pausa la sesión de juego.
 * Cambia el estado a 'paused' sin modificar los timestamps.
 *
 * @instance
 * @memberof GameSession
 * @returns {Promise<GameSession>} Promesa que resuelve con el documento actualizado
 */
gameSessionSchema.methods.pause = function() {
  this.status = 'paused';
  return this.save();
};

/**
 * Finaliza la sesión de juego.
 * Cambia el estado a 'completed' y registra la hora de finalización.
 *
 * @instance
 * @memberof GameSession
 * @returns {Promise<GameSession>} Promesa que resuelve con el documento actualizado
 */
gameSessionSchema.methods.end = function() {
  this.status = 'completed';
  this.endedAt = new Date();
  return this.save();
};

/**
 * Verifica si la sesión está activa.
 *
 * @instance
 * @memberof GameSession
 * @returns {boolean} true si el estado es 'active', false en caso contrario
 */
gameSessionSchema.methods.isActive = function() {
  return this.status === 'active';
};

/**
 * Validación personalizada para el array de cardMappings.
 * Asegura que:
 * 1. El array no esté vacío
 * 2. El número de mapeos coincida con config.numberOfCards
 *
 * @param {Array<CardMapping>} value - El array de cardMappings a validar
 * @returns {boolean} true si la validación es exitosa, false en caso contrario
 */
gameSessionSchema.path('cardMappings').validate(function(value) {
  if (value.length === 0) {
    return false;
  }

  if (value.length !== this.config.numberOfCards) {
    return false;
  }

  return true;
}, 'El número de cardMappings no es válido o está vacío.');

/**
 * Índice para búsqueda de sesiones por estado.
 * Útil para filtrar sesiones activas, completadas, etc.
 */
gameSessionSchema.index({ status: 1 });

/**
 * Índice para listar sesiones de una mecánica específica.
 */
gameSessionSchema.index({ mechanicId: 1 });

/**
 * Índice para listar sesiones de un contexto específico.
 */
gameSessionSchema.index({ contextId: 1 });

module.exports = mongoose.model('GameSession', gameSessionSchema);
