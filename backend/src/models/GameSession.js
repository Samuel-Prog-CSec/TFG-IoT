const mongoose = require('mongoose');

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
      default: 5
    },
    timeLimit: { // en segundos
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
  cardMappings: [{ // Mapeo de tarjetas a valores específicos para la sesión
    cardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Card',
      required: true
    },
    // Denormalizamos el UID para búsquedas O(1) en el GameEngine (REVISAR)
    uid: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    assignedValue: {  // Valor guardado en la targeta - respuesta (e.g., color, número, símbolo)
      type: String,
      required: true
    },
    displayData: mongoose.Schema.Types.Mixed // Valor de la cuestión en el frontend
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

// Métodos de instancia
gameSessionSchema.methods.start = function() {
  this.status = 'active';
  this.startedAt = new Date();
  return this.save();
};

gameSessionSchema.methods.pause = function() {
  this.status = 'paused';
  return this.save();
};

gameSessionSchema.methods.end = function() {
  this.status = 'completed';
  this.endedAt = new Date();
  return this.save();
};

// Validación del array de cardMappings
gameSessionSchema.path('cardMappings').validate(function(value) {
  // 'this' es el documento de la sesión
  if (value.length === 0) {
    return false; // No puede estar vacío
  }

  if (value.length !== this.config.numberOfCards) {
    return false; // El número de mapeos debe coincidir
  }

  return true;
}, 'El número de cardMappings no es válido o está vacío.');

// Índice para buscar sesiones activas o completadas
gameSessionSchema.index({ status: 1 });

// Índice para listar todas las sesiones disponibles para una mecánica
gameSessionSchema.index({ mechanicId: 1 });

// Índice para listar todas las sesiones que han usado un contexto específico
gameSessionSchema.index({ contextId: 1 });

module.exports = mongoose.model('GameSession', gameSessionSchema);
