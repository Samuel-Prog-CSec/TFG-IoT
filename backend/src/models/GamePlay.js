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
const { PLAY_STATUS, EVENT_TYPE } = require('../constants/enums');
const logger = require('../utils/logger').child({ component: 'GamePlayModel' });

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
      default: 0,
      min: 0
    },
    // maxScore guardado para auditoria e integridad. Calculado al crear la partida
    // como numberOfRounds * pointsPerCorrect. Hace imposible que el score supere el
    // maximo teorico de la sesion, incluso si llegan eventos duplicados.
    maxScore: {
      type: Number,
      default: null,
      min: 1
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
          enum: EVENT_TYPE
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
      },
      // Métricas específicas de la mecánica Memoria (ADR-A, sesión 04/05/2026).
      // Persisten como Mixed para evitar el comportamiento de Mongoose con
      // sub-schemas typed + `default: undefined` que en QA 04/05/2026
      // resultó en métricas no persistidas tras `playDoc.complete()`. El
      // shape se documenta aquí para referencia y se valida en `dtos.js`.
      // Forma: { groupsMatched, peakStreak, averageMatchTimeMs,
      //          attemptsToFirstMatch, groupSize }.
      memory: { type: mongoose.Schema.Types.Mixed, default: undefined },
      // Métricas específicas de la mecánica Asociación (ADR-A). Mixed por
      // la misma razón que `memory`. Forma:
      //   { peakStreak, quickestCorrectMs, slowestCorrectMs,
      //     byValueAccuracy: { '<slug>': { correct, total } },
      //     categoryDominance }.
      association: { type: mongoose.Schema.Types.Mixed, default: undefined },
      // Métricas específicas de la mecánica Secuencia (T-921). Sólo se
      // persisten cuando la partida es de tipo 'sequence'; para Asociación
      // y Memoria quedan undefined y el DTO las omite del payload público.
      sequencesCompleted: { type: Number, default: undefined },
      sequencesBlocked: { type: Number, default: undefined },
      sequencesTimedOut: { type: Number, default: undefined },
      maxSequenceLengthAchieved: { type: Number, default: undefined },
      partialReproductions: { type: Number, default: undefined },
      // Rondas con al menos un acierto pero sin completar la secuencia
      // (T-921 QA 03/05/2026). Sustituye en el UI a `partialReproductions`,
      // que duplicaba el total de "Cartas acertadas" del bloque superior.
      partialRounds: { type: Number, default: undefined },
      // Total de rondas jugadas en la partida de Secuencia. Denominador correcto
      // del detector `sequence_order_errors` (partialRounds/roundsPlayed ≤ 1).
      roundsPlayed: { type: Number, default: undefined },
      averageReproductionTimeMs: { type: Number, default: undefined },
      blockedCardsTotal: { type: Number, default: undefined },
      hintsUsed: { type: Number, default: undefined }
    },
    status: {
      type: String,
      lowercase: true,
      trim: true,
      enum: PLAY_STATUS,
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

  // El `$push` de events y los `$inc` de metrics/score/currentRound ya están
  // persistidos por updateOne. La mutación adicional sobre `this` que hace
  // `applyEventToDocState` mantiene el doc en memoria sincronizado para los
  // callers que leen `playDoc.metrics.*` justo después, pero deja a Mongoose
  // tracking esos cambios como modificaciones pendientes. Si más tarde se
  // invoca `playDoc.save()` (p. ej. en `complete()`, `persistPause/Resume` o
  // `checkpointPlayIfNeeded`), Mongoose vuelve a aplicar el `$push` del array
  // y los $inc, duplicando eventos en BD (QA 26/04/2026: partida de memoria
  // de 7 pares mostraba 28 entradas en events). $__reset() limpia el
  // tracking interno para que los siguientes save() solo persistan campos
  // realmente modificados después de este addEventAtomic.
  if (typeof this.$__reset === 'function') {
    this.$__reset();
  }

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

  // Calcular el tiempo medio de respuesta SOLO sobre eventos de respuesta real
  // (acierto/error). Antes promediaba cualquier evento con `timeElapsed`,
  // mezclando el `round_end` de Secuencia (duración de la ronda ENTERA, ~60s),
  // el `card_scanned` de la 1ª carta de Memoria, y el `timeout` de Asociación
  // (= límite de tiempo completo). Eso inflaba/distorsionaba el KPI "T. medio de
  // respuesta" y las métricas del alumno. Un timeout no es una respuesta.
  const ANSWER_EVENT_TYPES = new Set(['correct', 'error']);
  const responseTimes = this.events
    .filter(e => ANSWER_EVENT_TYPES.has(e.eventType) && e.timeElapsed)
    .map(e => e.timeElapsed);

  // Evitar división por cero
  if (responseTimes.length > 0) {
    this.metrics.averageResponseTime =
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  }

  // Salvaguarda de integridad: clampar score al maximo teorico.
  // Pre-save hook tambien valida, pero lo hacemos explicito aqui para que
  // quede en logs de auditoria antes de delegar al hook.
  if (typeof this.maxScore === 'number' && this.score > this.maxScore) {
    this.score = this.maxScore;
  }

  return this.save();
};

/**
 * Hook pre-validate: garantiza score ∈ [0, maxScore] ANTES de que Mongoose
 * aplique el validator `min: 0` del schema.
 *
 * Se ejecuta en validate (no en save) porque en Mongoose ≥7 la cadena es:
 * pre('validate') → validate() → pre('save') → save(). Si clampásemos en
 * pre('save'), el validator `min: 0` ya habría rechazado el documento cuando
 * una partida acumula más penalizaciones que aciertos (`$inc` deja score<0
 * transitoriamente en BD/memoria y el save final falla — detectado en QA
 * 2026-04-23 con score=-4 en asociación).
 */
gamePlaySchema.pre('validate', function () {
  if (typeof this.maxScore === 'number' && this.maxScore > 0 && this.score > this.maxScore) {
    // T-907: cambio de console.warn → logger.warn para cumplir CLAUDE.md (Pino
    // structured logging obligatorio en producción). El logger child añade el
    // contexto 'GamePlayModel' al evento para facilitar filtrado en agregadores.
    logger.warn(
      { playId: this._id, score: this.score, maxScore: this.maxScore },
      `Score excede maxScore en partida ${this._id}. Clampeado.`
    );
    this.score = this.maxScore;
  }
  if (typeof this.score === 'number' && this.score < 0) {
    this.score = 0;
  }
});

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

/**
 * Índice compuesto para analytics: historial de un jugador ordenado por fecha.
 * Caso de uso: GET /api/analytics/student/:id/summary (últimas N partidas).
 */
gamePlaySchema.index({ playerId: 1, completedAt: -1 });

/**
 * Índice ESR (Equality→Sort→Range) para analytics por alumno acotadas a partidas
 * completadas: la inmensa mayoría de queries por jugador filtran `status:'completed'`
 * y ordenan/acotan por `completedAt`. Sin él resolvían por {playerId,completedAt}
 * (no cubre el filtro status) o {playerId,status,startedAt} (ordena por startedAt →
 * sort en memoria al pedir completedAt). Cubre detectores SmartAlert (secuencia/
 * timeout) y getStudentSummary/trajectory tras añadirles la cota temporal.
 */
gamePlaySchema.index({ playerId: 1, status: 1, completedAt: -1 });

/**
 * Índice compuesto para analytics: partidas completadas ordenadas por fecha.
 * Caso de uso: agregaciones de rendimiento en classroom trends/distribution.
 */
gamePlaySchema.index({ status: 1, completedAt: -1 });

/**
 * Índice compuesto para analytics de engagement: queries que necesitan
 * partidas abandonadas y completadas de un jugador ordenadas por fecha.
 * Caso de uso: engagement score, análisis de abandono (E09, E10).
 */
gamePlaySchema.index({ playerId: 1, status: 1, startedAt: -1 });

/**
 * Índice compuesto para analytics de sesión: queries que filtran partidas
 * por sesión, estado y fecha de completado.
 * Caso de uso: análisis de rondas, tarjetas, fatiga (E05-E08).
 */
gamePlaySchema.index({ sessionId: 1, status: 1, completedAt: -1 });

module.exports = mongoose.model('GamePlay', gamePlaySchema);
