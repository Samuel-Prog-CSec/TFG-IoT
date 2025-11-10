const mongoose = require('mongoose');

const gamePlaySchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GameSession',
    required: true
  },
  playerId: { // TODO: Incluir referencia a User cuando se cree el modelo
    type: String,
    required: true
  },
  score: {
    type: Number,
    default: 0
  },
  currentRound: {
    type: Number,
    default: 1
  },
  events: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    eventType: {
      type: String,
      lowercase: true,
      trim : true,
      enum: ['card_scanned', 'correct', 'error', 'timeout', 'round_start', 'round_end']
    },
    cardUid: { // Para eventos relacionados con cartas (ELIMINAR requiered: true?????)
      type: String,
      required: false
    },
    expectedValue: String,
    actualValue: String,
    pointsAwarded: Number,
    timeElapsed: Number,
    roundNumber: Number
  }],
  metrics: {
    totalAttempts: {
      type: Number,
      default: 0
    },
    correctAttempts: {
      type: Number,
      default: 0
    },
    errorAttempts: {
      type: Number,
      default: 0
    },
    timeoutAttempts: {
      type: Number,
      default: 0
    },
    averageResponseTime: {
      type: Number,
      default: 0
    },
    completionTime: {
      type: Number,
      default: 0
    }
  },
  status: {
    type: String,
    lowercase: true,
    trim : true,
    enum: ['in-progress', 'completed', 'abandoned'],
    default: 'in-progress'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date
}, {
  timestamps: true
});

/**
 * Añade un evento a la partida y actualiza todas
 * las métricas y puntuación asociadas.
 *
 * @param {Object} eventData - El objeto del evento.
 * @param {Number} [eventData.pointsAwarded] - (Opcional) puntos a sumar/restar.
 */
gamePlaySchema.methods.addEvent = function(eventData) {
  // Añadir al log de eventos
  this.events.push(eventData);

  // Actualizar métricas básicas
  this.metrics.totalAttempts++;

  if (eventData.eventType === 'correct') {
    this.metrics.correctAttempts++;
  } else if (eventData.eventType === 'error') {
    this.metrics.errorAttempts++;
  } else if (eventData.eventType === 'timeout') {
    this.metrics.timeoutAttempts++;
  }

  // Actualizar el score principal
  if (eventData.pointsAwarded && typeof eventData.pointsAwarded === 'number') {
    this.score += eventData.pointsAwarded;
  }

  // Guardar todo en una sola operación atómica
  return this.save();
};

gamePlaySchema.methods.complete = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  this.metrics.completionTime = this.completedAt - this.startedAt;

  // Calcular el tiempo medio de respuesta
  const responseTimes = this.events
    .filter(e => e.timeElapsed)
    .map(e => e.timeElapsed);

  // Evitar división por cero
  if (responseTimes.length > 0) {
    this.metrics.averageResponseTime =
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  }

  return this.save();
};

/* Índice para el GameEngine - Caso de uso:
 * "Dáme la partida activa (status: 'in-progress') del jugador X (playerId) en la sesión Y (sessionId)".
 */
gamePlaySchema.index({ sessionId: 1, playerId: 1, status: 1 });

// Índice para las partidas de un jugador
gamePlaySchema.index({ playerId: 1 });

module.exports = mongoose.model('GamePlay', gamePlaySchema);
