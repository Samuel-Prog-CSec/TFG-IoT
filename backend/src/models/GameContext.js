/**
 * @fileoverview Modelo de datos para contextos temáticos de las mecánicas de juego.
 * Define los temas específicos que puede tener una mecánica (geografía, historia, ciencias, etc.).
 * @module models/GameContext
 */

const mongoose = require('mongoose');

/**
 * Esquema de Mongoose para contextos de juego.
 * Un contexto define el tema y los assets (recursos) específicos que pueden usarse con cualquier mecánica.
 *
 * IMPORTANTE (dudas #15 y #15.1): Los contextos tienen compatibilidad ABSOLUTA con todas las mecánicas.
 * Un mismo contexto (ej: "Geografía") puede usarse con cualquier mecánica (Asociación, Secuencia, Memoria, etc.).
 * Por ello, NO existe referencia a mechanicId - el contexto es independiente de la mecánica.
 *
 * GESTIÓN DE ASSETS (dudas #12 y #13):
 * - Los contextos pueden ser PREDEFINIDOS (incluidos en seeders) o creados por profesores
 * - Los profesores pueden AÑADIR assets a contextos existentes
 * - Los profesores pueden CREAR contextos completamente nuevos
 * - Los archivos multimedia (imageUrl, audioUrl) se almacenan en Supabase Storage
 * - Las URLs apuntan a buckets de Supabase con políticas de acceso público
 * - El backend expone un endpoint API REST para subir archivos a Supabase
 * - Flujo de subida:
 *   1. Frontend envía archivo al backend (POST /api/assets/upload)
 *   2. Backend valida tipo/tamaño y sube a Supabase
 *   3. Backend retorna URL pública del asset
 *   4. Frontend usa la URL en el formulario de creación de contexto
 *
 * @typedef {Object} GameContext
 * @property {string} contextId - Identificador único del contexto (ej: 'geography', 'history')
 * @property {string} name - Nombre amigable del contexto para mostrar en la interfaz
 * @property {boolean} isActive - Indica si el contexto está habilitado en el sistema
 * @property {Array<Asset>} assets - Array de recursos/elementos del contexto
 * @property {Date} createdAt - Fecha de creación del registro
 * @property {Date} updatedAt - Fecha de última actualización
 *
 * @typedef {Object} Asset
 * @property {string} key - Clave única del elemento (ej: 'spain', 'france')
 * @property {string} [display] - Representación visual del elemento (ej: emoji de bandera '🇪🇸')
 * @property {string} value - Valor textual del elemento (ej: 'España', 'Francia')
 * @property {string} [audioUrl] - URL del archivo de audio en Supabase Storage (duda #12)
 * @property {string} [imageUrl] - URL de la imagen en Supabase Storage (duda #12)
 */
const gameContextSchema = new mongoose.Schema(
  {
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
    isActive: {
      type: Boolean,
      default: true
    },
    assets: [
      {
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
      }
    ]
  },
  {
    timestamps: true,
    collection: 'game_contexts'
  }
);

/**
 * Validación personalizada para el array de assets.
 * Asegura que cada contexto tenga al menos un asset disponible.
 *
 * @param {Array<Asset>} value - El array de assets a validar
 * @returns {boolean} true si el array no está vacío, false en caso contrario
 */
gameContextSchema.path('assets').validate(value => {
  if (value.length === 0) {
    return false;
  }
  return true;
}, 'El array de assets no puede estar vacío.');

module.exports = mongoose.model('GameContext', gameContextSchema);
