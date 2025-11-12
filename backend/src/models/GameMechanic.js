/**
 * @fileoverview Modelo de datos para mecánicas de juego del sistema.
 * Define los tipos de juegos disponibles (asociación, secuencia, memoria, etc.).
 * @module models/GameMechanic
 */

const mongoose = require('mongoose');

/**
 * Esquema de Mongoose para mecánicas de juego.
 * Una mecánica define las reglas y el tipo de interacción del juego.
 *
 * NOTA (duda #8): Este modelo NO contiene referencia a contextos disponibles.
 * Los contextos son independientes de las mecánicas y tienen compatibilidad absoluta.
 * La relación se establece al crear una GameSession donde se elige mecánica + contexto.
 *
 * @typedef {Object} GameMechanic
 * @property {string} name - Identificador interno de la mecánica (ej: 'association', 'sequence', 'memory')
 * @property {string} displayName - Nombre amigable para mostrar en la interfaz
 * @property {string} [description] - Descripción detallada de cómo funciona la mecánica
 * @property {string} [icon] - Icono representativo de la mecánica (emoji o URL)
 * @property {Object} rules - Reglas específicas de la mecánica (estructura flexible)
 * @property {boolean} isActive - Indica si la mecánica está habilitada en el sistema
 * @property {Date} createdAt - Fecha de creación del registro
 * @property {Date} updatedAt - Fecha de última actualización
 */
const gameMechanicSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true
  },
  description: String,
  icon: String,
  rules: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

/**
 * Índice para filtrar mecánicas activas.
 * Usado para listar solo las mecánicas disponibles en la creación de sesiones.
 */
gameMechanicSchema.index({ isActive: 1 });

/**
 * Índice para búsqueda rápida por nombre de mecánica.
 */
gameMechanicSchema.index({ name: 1 });

module.exports = mongoose.model('GameMechanic', gameMechanicSchema);
