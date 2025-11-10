const mongoose = require('mongoose');

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
    trim: true
  },
  name: {
    type: String,
    required: true
  },
  assets: [{ // Array de assets específicos para el contexto del juego
    key: {
      type: String,         // e.g., "spain"
      required: true,
      lowercase: true,
      trim: true
    },
    display: String,        // e.g., "🇪🇸"
    value: {
      type: String,         // e.g., "España"
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

// Validación del array de assets
gameContextSchema.path('assets').validate(function(value) {
  if (value.length === 0) {
    return false; // No puede estar vacío
  }
  return true;
}, 'El array de assets no puede estar vacío.');

// Índice compuesto para mechanic + context
gameContextSchema.index({ mechanicId: 1, contextId: 1 });

module.exports = mongoose.model('GameContext', gameContextSchema);
