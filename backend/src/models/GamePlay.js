/**
 * @fileoverview Modelo de datos para partidas individuales de estudiantes.
 * Registra el progreso, eventos y estadísticas de una partida en curso o completada.
 *
 * IMPORTANTE (dudas #6, #16, #18): Una GamePlay representa UNA PARTIDA INDIVIDUAL de un estudiante.
 * Múltiples GamePlays pueden estar asociadas a la misma GameSession (configuración compartida).
 * El profesor crea la GameSession con la configuración del juego, luego crea una GamePlay por cada
 * estudiante que quiera jugar. Cada estudiante juega de forma independiente a su propio ritmo.
 *
 * @module models/GamePlay
 */

const mongoose = require('mongoose');

const MAX_EVENTS_PER_PLAY = 500;

const ANSWER_EVENT_TYPES = new Set(['correct', 'error', 'timeout']);

const buildEventUpdateOperators = (eventData, options = {}) => {
  const normalizedEventData = {
    ...eventData,
    eventType: eventData.eventType?.toLowerCase?.() || eventData.eventType
  };

  const update = {
    $push: {
      events: {
        $each: [normalizedEventData],
        $slice: -MAX_EVENTS_PER_PLAY
      }
    }
  };

  const increments = {};
  if (ANSWER_EVENT_TYPES.has(normalizedEventData.eventType)) {
    increments['metrics.totalAttempts'] = 1;

    if (normalizedEventData.eventType === 'correct') {
      increments['metrics.correctAttempts'] = 1;
    } else if (normalizedEventData.eventType === 'error') {
      increments['metrics.errorAttempts'] = 1;
    } else if (normalizedEventData.eventType === 'timeout') {
      increments['metrics.timeoutAttempts'] = 1;
    }
  }

  if (typeof normalizedEventData.pointsAwarded === 'number') {
    increments.score = normalizedEventData.pointsAwarded;
  }

  if (options.advanceRound) {
    increments.currentRound = 1;
  }

  if (Object.keys(increments).length > 0) {
    update.$inc = increments;
  }

  return { update, normalizedEventData };
};

const applyEventToDocState = (doc, eventData, options = {}) => {
  doc.events.push(eventData);
  if (doc.events.length > MAX_EVENTS_PER_PLAY) {
    doc.events.splice(0, doc.events.length - MAX_EVENTS_PER_PLAY);
  }

  if (ANSWER_EVENT_TYPES.has(eventData.eventType)) {
    doc.metrics.totalAttempts += 1;

    if (eventData.eventType === 'correct') {
      doc.metrics.correctAttempts += 1;
    } else if (eventData.eventType === 'error') {
      doc.metrics.errorAttempts += 1;
    } else if (eventData.eventType === 'timeout') {
      doc.metrics.timeoutAttempts += 1;
    }
  }

  if (typeof eventData.pointsAwarded === 'number') {
    doc.score += eventData.pointsAwarded;
  }

  if (options.advanceRound) {
    doc.currentRound += 1;
  }
};

/**
 * Esquema de Mongoose para partidas de juego.
 * Una partida representa una instancia de juego ejecutada por un estudiante.
 *
 * @typedef {Object} GamePlay
 * @property {ObjectId} sessionId - Referencia a la sesión de juego configurada
 * @property {ObjectId} playerId - Identificador del jugador (ref: User con role='student')
 * @property {number} score - Puntuación total acumulada en la partida
 * @property {number} currentRound - Número de la ronda actual
 * @property {Array<GameEvent>} events - Log de todos los eventos ocurridos durante la partida
 * @property {Object} metrics - Métricas estadísticas de la partida
 * @property {number} metrics.totalAttempts - Total de intentos realizados
 * @property {number} metrics.correctAttempts - Cantidad de respuestas correctas
 * @property {number} metrics.errorAttempts - Cantidad de respuestas incorrectas
 * @property {number} metrics.timeoutAttempts - Cantidad de timeouts (sin respuesta)
 * @property {number} metrics.averageResponseTime - Tiempo medio de respuesta en milisegundos (duda #17)
 * @property {number} metrics.completionTime - Tiempo total de la partida en milisegundos
 * @property {string} status - Estado de la partida (in-progress, completed, abandoned)
 * @property {Date} [pausedAt] - Fecha/hora de la última pausa
 * @property {number} [remainingTime] - Tiempo restante de la ronda actual en ms (cuando está pausada)
 * @property {Date} startedAt - Fecha y hora de inicio de la partida
 * @property {Date} [completedAt] - Fecha y hora de finalización de la partida
 * @property {Date} createdAt - Fecha de creación del registro
 * @property {Date} updatedAt - Fecha de última actualización
 *
 * @typedef {Object} GameEvent
 * @property {Date} timestamp - Momento exacto del evento
 * @property {string} eventType - Tipo de evento (card_scanned, correct, error, timeout, round_start, round_end, server_restart)
 * @property {string} [cardUid] - UID de la tarjeta involucrada (si aplica)
 * @property {string} [expectedValue] - Valor esperado como respuesta correcta
 * @property {string} [actualValue] - Valor real de la respuesta del jugador
 * @property {number} [pointsAwarded] - Puntos otorgados/restados en este evento
 * @property {number} [timeElapsed] - Tiempo transcurrido en milisegundos desde inicio de ronda (duda #17)
 * @property {number} [roundNumber] - Número de ronda asociado al evento
 */
const gamePlaySchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameSession',
      required: true
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
    events: [
      {
        timestamp: {
          type: Date,
          default: Date.now
        },
        eventType: {
          type: String,
          lowercase: true,
          required: true,
          trim: true,
          enum: [
            'card_scanned',
            'correct',
            'error',
            'timeout',
            'round_start',
            'round_end',
            'server_restart'
          ]
        },
        cardUid: String,
        expectedValue: String,
        actualValue: String,
        pointsAwarded: Number,
        timeElapsed: Number,
        roundNumber: {
          type: Number,
          required: true
        }
      }
    ],
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
      trim: true,
      enum: ['in-progress', 'completed', 'abandoned', 'paused'],
      default: 'in-progress'
    },
    pausedAt: {
      type: Date,
      default: null
    },
    remainingTime: {
      type: Number,
      default: null,
      min: 0
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    completedAt: Date
  },
  {
    timestamps: true,
    collection: 'gameplays'
  }
);

/**
 * Añade un evento al log de la partida y actualiza métricas y puntuación.
 * Este método es el núcleo de la actualización del estado de la partida.
 *
 * @instance
 * @memberof GamePlay
 * @param {Object} eventData - Datos del evento a registrar
 * @param {string} eventData.eventType - Tipo de evento (correct, error, timeout, etc.)
 * @param {string} [eventData.cardUid] - UID de la tarjeta escaneada
 * @param {string} [eventData.expectedValue] - Valor esperado
 * @param {string} [eventData.actualValue] - Valor real proporcionado
 * @param {number} [eventData.pointsAwarded] - Puntos a sumar o restar
 * @param {number} [eventData.timeElapsed] - Tiempo de respuesta en ms
 * @param {number} [eventData.roundNumber] - Número de ronda
 * @returns {Promise<GamePlay>} Promesa que resuelve con el documento actualizado
 * @example
 * await gamePlay.addEvent({
 *   eventType: 'correct',
 *   cardUid: '32B8FA05',
 *   expectedValue: 'España',
 *   actualValue: 'España',
 *   pointsAwarded: 10,
 *   timeElapsed: 3500,
 *   roundNumber: 1
 * });
 */
gamePlaySchema.methods.addEventAtomic = async function (eventData, options = {}) {
  const { update, normalizedEventData } = buildEventUpdateOperators(eventData, options);

  await this.constructor.updateOne({ _id: this._id }, update);
  applyEventToDocState(this, normalizedEventData, options);

  return this;
};

gamePlaySchema.methods.addEvent = function (eventData) {
  return this.addEventAtomic(eventData, { advanceRound: false });
};

/**
 * Verifica si la partida está actualmente en progreso.
 *
 * @instance
 * @memberof GamePlay
 * @returns {boolean} true si el estado es 'in-progress', false en caso contrario
 */
gamePlaySchema.methods.isInProgress = function () {
  return this.status === 'in-progress';
};

/**
 * Marca la partida como completada y calcula métricas finales.
 * Actualiza el estado, registra la hora de finalización y calcula estadísticas.
 *
 * @instance
 * @memberof GamePlay
 * @returns {Promise<GamePlay>} Promesa que resuelve con el documento actualizado
 * @example
 * await gamePlay.complete();
 */
gamePlaySchema.methods.complete = function () {
  this.status = 'completed';
  this.completedAt = new Date();
  this.metrics.completionTime = this.completedAt - this.startedAt;

  // Calcular el tiempo medio de respuesta a partir de los eventos
  const responseTimes = this.events.filter(e => e.timeElapsed).map(e => e.timeElapsed);

  // Evitar división por cero
  if (responseTimes.length > 0) {
    this.metrics.averageResponseTime =
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  }

  return this.save();
};

/**
 * Índice compuesto para búsquedas eficientes en el GameEngine.
 * Permite encontrar rápidamente la partida activa de un jugador en una sesión.
 * Caso de uso: "Obtener la partida en progreso del jugador X en la sesión Y"
 */
gamePlaySchema.index({ sessionId: 1, playerId: 1, status: 1 });

/**
 * Índice para listar todas las partidas de un jugador.
 * Útil para ver el historial de partidas de un estudiante.
 */
gamePlaySchema.index({ playerId: 1 });

/**
 * Índice para listar todas las partidas de una sesión (Dashboard del profesor).
 */
gamePlaySchema.index({ sessionId: 1 });

module.exports = mongoose.model('GamePlay', gamePlaySchema);
