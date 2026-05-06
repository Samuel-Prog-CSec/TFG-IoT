/**
 * @fileoverview Modelo de datos para sesiones de juego configuradas por el profesor.
 * Define la configuración completa de un juego antes de que los estudiantes lo jueguen.
 *
 * IMPORTANTE (duda #16): Una GameSession representa la CONFIGURACIÓN de una "sala de juego".
 * Múltiples GamePlays (partidas individuales) pueden estar asociadas a una misma GameSession.
 * Cada estudiante tiene su propia partida (GamePlay) independiente, pero comparten la configuración
 * de la sesión (mecánica, contexto, tarjetas, reglas). Los estudiantes juegan a su propio ritmo.
 *
 * FLUJO DE CREACIÓN (dudas #3, #4, #5, #10, #18):
 * 1. El profesor selecciona una mecánica de juego (ej: "Asociación")
 * 2. El profesor selecciona un contexto compatible (ej: "Geografía")
 * 3. El profesor consulta las tarjetas RFID disponibles en la BD (duda #5)
 * 4. El profesor selecciona qué tarjetas usar en el juego (duda #4)
 * 5. El profesor asigna valores de los assets del contexto a cada tarjeta (dudas #3, #10)
 *    Ejemplo: Tarjeta UID=32B8FA05 → assignedValue="España" (del asset geography)
 * 6. El profesor configura las reglas (rondas, tiempo límite, puntos)
 * 7. Se crea la GameSession con status='created'
 * 8. El profesor crea GamePlays (partidas) para cada estudiante (duda #18)
 * 9. Los estudiantes juegan de forma independiente usando las tarjetas físicas
 *
 * @module models/GameSession
 */

const mongoose = require('mongoose');
const { SESSION_STATUS, DIFFICULTY } = require('../constants/enums');

/**
 * Calcula la dificultad del juego basándose en el número de tarjetas.
 *
 * Rangos de dificultad:
 * - easy: 2-5 tarjetas (juegos simples para niños pequeños)
 * - medium: 6-12 tarjetas (dificultad intermedia)
 * - hard: 13-30 tarjetas (juegos más desafiantes)
 *
 * @param {number} numberOfCards - Número de tarjetas en el juego
 * @returns {string} Nivel de dificultad ('easy', 'medium', 'hard')
 */
const calculateDifficulty = numberOfCards => {
  if (numberOfCards <= 5) {
    return 'easy';
  }
  if (numberOfCards <= 12) {
    return 'medium';
  }
  return 'hard';
};

/**
 * Esquema de Mongoose para sesiones de juego.
 * Una sesión es la configuración completa de un juego: mecánica, contexto, tarjetas y reglas.
 * Esta configuración es compartida por múltiples estudiantes que juegan en paralelo.
 *
 * @typedef {Object} GameSession
 * @property {ObjectId} mechanicId - Referencia a la mecánica de juego utilizada
 * @property {ObjectId} [deckId] - Referencia al mazo de tarjetas RFID reutilizable
 * @property {ObjectId} contextId - Referencia al contexto temático del juego
 * @property {string} [sensorId] - ID del sensor RFID asignado a esta sesión (T-009)
 * @property {Object} config - Configuración de las reglas del juego
 * @property {number} config.numberOfCards - Cantidad de tarjetas RFID usadas en el juego (2-30)
 * @property {number} config.numberOfRounds - Número de rondas/desafíos del juego
 * @property {number} config.timeLimit - Tiempo límite en segundos (3-300, según mecánica)
 * @property {number} config.pointsPerCorrect - Puntos otorgados por respuesta correcta
 * @property {number} config.penaltyPerError - Puntos restados por respuesta incorrecta (número negativo)
 * @property {Array<CardMapping>} cardMappings - Mapeo de tarjetas RFID a valores del juego
 * @property {string} status - Estado de la sesión (created, active, completed)
 * @property {string} difficulty - Dificultad del juego (easy, medium, hard)
 * @property {Date} [startedAt] - Fecha y hora de inicio de la sesión
 * @property {Date} [endedAt] - Fecha y hora de finalización de la sesión
 * @property {ObjectId} createdBy - ID del profesor que creó la sesión (ref: User)
 * @property {Date} createdAt - Fecha de creación del registro
 * @property {Date} updatedAt - Fecha de última actualización
 *
 * @typedef {Object} CardMapping
 * @property {string} uid - UID físico de la tarjeta RFID (token fungible, 8 o 14 hex)
 * @property {string} assignedValue - Valor asignado a esta tarjeta para el juego
 * @property {Mixed} displayData - Datos de visualización para el frontend (flexible)
 */
const gameSessionSchema = new mongoose.Schema(
  {
    mechanicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameMechanic',
      required: true
    },
    deckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CardDeck',
      required: true
    },
    contextId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameContext',
      required: true
    },
    sensorId: {
      type: String,
      trim: true
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100
    },
    config: {
      numberOfCards: {
        type: Number,
        required: true,
        min: 2,
        max: 30
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
        max: 300,
        default: 15
      },
      // ADR-114: rangos unificados entre mecánicas para evitar deformación
      // del ranking. 5-15 / -5..0 son los rangos pedagógicos válidos.
      pointsPerCorrect: {
        type: Number,
        min: [5, 'Los puntos por acierto deben ser al menos 5'],
        max: [15, 'Los puntos por acierto no pueden exceder 15'],
        default: 10,
        validate: {
          validator: Number.isInteger,
          message: 'Los puntos por acierto deben ser un entero'
        }
      },
      penaltyPerError: {
        type: Number,
        min: [-5, 'La penalización por error no puede ser inferior a -5'],
        max: [0, 'Los puntos por error deben ser cero o negativos'],
        default: -2,
        validate: {
          validator: Number.isInteger,
          message: 'Los puntos por error deben ser un entero'
        }
      }
    },
    cardMappings: [
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
          required: true
        },
        displayData: mongoose.Schema.Types.Mixed
      }
    ],
    boardLayout: [
      {
        slotIndex: {
          type: Number,
          required: true,
          min: 0
        },
        uid: {
          type: String,
          required: true,
          uppercase: true,
          trim: true,
          match: [/^[0-9A-F]{8}$|^[0-9A-F]{14}$/, 'UID debe ser 8 o 14 caracteres hexadecimales']
        },
        assignedValue: {
          type: String,
          required: true
        },
        displayData: mongoose.Schema.Types.Mixed
      }
    ],
    associationChallengePlan: [
      {
        roundNumber: {
          type: Number,
          required: true,
          min: 1
        },
        uid: {
          type: String,
          required: true,
          uppercase: true,
          trim: true,
          match: [/^[0-9A-F]{8}$|^[0-9A-F]{14}$/, 'UID debe ser 8 o 14 caracteres hexadecimales']
        },
        assignedValue: {
          type: String,
          required: true
        },
        displayData: mongoose.Schema.Types.Mixed,
        promptText: {
          type: String,
          trim: true,
          maxlength: 180
        }
      }
    ],
    requiresAssociationPlanConfiguration: {
      type: Boolean,
      default: false
    },
    /**
     * Plan de secuencias para la mecánica Secuencia.
     * Cada ronda contiene una secuencia ordenada de cartas que el alumno
     * debe memorizar y reproducir. Se persiste para que todos los alumnos
     * asignados a la sesión jueguen las mismas secuencias.
     */
    sequencePlan: [
      {
        roundNumber: {
          type: Number,
          required: true,
          min: 1
        },
        length: {
          type: Number,
          required: true,
          min: 1,
          max: 12
        },
        sequence: [
          {
            uid: {
              type: String,
              required: true,
              uppercase: true,
              trim: true,
              match: [
                /^[0-9A-F]{8}$|^[0-9A-F]{14}$/,
                'UID debe ser 8 o 14 caracteres hexadecimales'
              ]
            },
            assignedValue: {
              type: String,
              required: true
            },
            displayData: mongoose.Schema.Types.Mixed
          }
        ]
      }
    ],
    /**
     * Configuración específica de la mecánica Secuencia. Persiste los
     * parámetros que el profesor define en el wizard (longitud min/max
     * de las secuencias y duración del display de memorización).
     */
    sequenceConfig: {
      minSequenceLength: {
        type: Number,
        min: 1,
        max: 12,
        default: 3
      },
      maxSequenceLength: {
        type: Number,
        min: 1,
        max: 12,
        default: 5
      },
      displaySeconds: {
        type: Number,
        min: 2,
        max: 8,
        default: 3
      }
    },
    status: {
      type: String,
      lowercase: true,
      trim: true,
      enum: SESSION_STATUS,
      default: 'created'
    },
    difficulty: {
      type: String,
      lowercase: true,
      trim: true,
      enum: DIFFICULTY,
      default: 'medium'
    },
    startedAt: Date,
    endedAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true,
    collection: 'game_sessions'
  }
);

/**
 * Inicia la sesión de juego.
 * Cambia el estado a 'active' y registra la hora de inicio.
 *
 * @instance
 * @memberof GameSession
 * @returns {Promise<GameSession>} Promesa que resuelve con el documento actualizado
 */
gameSessionSchema.methods.start = function () {
  this.status = 'active';
  this.startedAt = new Date();
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
gameSessionSchema.methods.end = function () {
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
gameSessionSchema.methods.isActive = function () {
  return this.status === 'active';
};

/**
 * Middleware pre-save para auto-calcular la dificultad.
 * Se ejecuta antes de guardar y calcula la dificultad basándose en numberOfCards.
 */
gameSessionSchema.pre('save', function () {
  // Solo auto-calcular si:
  // 1. Es un documento nuevo
  // 2. Se modificó numberOfCards
  const shouldAutoCalculate = this.isNew || this.isModified('config.numberOfCards');
  if (shouldAutoCalculate && this.config?.numberOfCards) {
    this.difficulty = calculateDifficulty(this.config.numberOfCards);
  }
});

/**
 * Validación personalizada para el array de cardMappings.
 * Asegura que:
 * 1. El array no esté vacío
 * 2. El número de mapeos coincida con config.numberOfCards
 *
 * @param {Array<CardMapping>} value - El array de cardMappings a validar
 * @returns {boolean} true si la validación es exitosa, false en caso contrario
 */
gameSessionSchema.path('cardMappings').validate(function (value) {
  if (value.length === 0) {
    return false;
  }

  if (value.length !== this.config.numberOfCards) {
    return false;
  }

  return true;
}, 'El número de cardMappings no es válido o está vacío.');

gameSessionSchema.path('boardLayout').validate(function (value) {
  if (!Array.isArray(value) || value.length === 0) {
    return true;
  }

  const slotIndexes = value.map(item => item.slotIndex);
  const uniqueSlotIndexes = new Set(slotIndexes);
  if (uniqueSlotIndexes.size !== slotIndexes.length) {
    return false;
  }

  const uids = value.map(item => item.uid).filter(Boolean);
  const uniqueUids = new Set(uids);
  if (uniqueUids.size !== uids.length) {
    return false;
  }

  const mappingUids = new Set((this.cardMappings || []).map(mapping => mapping.uid));
  const hasUnknownUid = uids.some(uid => !mappingUids.has(uid));

  if (hasUnknownUid) {
    return false;
  }

  return true;
}, 'boardLayout no es válido: revisa slots duplicados o tarjetas fuera del mazo.');

/**
 * Validador del plan de secuencias.
 * - roundNumbers únicos
 * - cada secuencia con al menos 1 elemento y sin UIDs duplicados
 * - todos los UIDs presentes en cardMappings
 * - length coincide con sequence.length
 */
gameSessionSchema.path('sequencePlan').validate(function (value) {
  if (!Array.isArray(value) || value.length === 0) {
    return true;
  }

  const roundNumbers = value.map(item => item.roundNumber);
  if (new Set(roundNumbers).size !== roundNumbers.length) {
    return false;
  }

  const mappingUids = new Set((this.cardMappings || []).map(mapping => mapping.uid));

  for (const round of value) {
    if (!Array.isArray(round.sequence) || round.sequence.length === 0) {
      return false;
    }
    if (Number(round.length) !== round.sequence.length) {
      return false;
    }
    const uids = round.sequence.map(item => item.uid).filter(Boolean);
    if (uids.length !== round.sequence.length) {
      return false;
    }
    if (new Set(uids).size !== uids.length) {
      return false;
    }
    if (uids.some(uid => !mappingUids.has(uid))) {
      return false;
    }
  }

  return true;
}, 'sequencePlan no es válido: revisa rondas duplicadas, UIDs duplicados o tarjetas fuera del mazo.');

/**
 * Validación de sequenceConfig: minSequenceLength <= maxSequenceLength.
 * Implementada como middleware pre('validate') porque Mongoose no expone
 * la validación de subdocumentos definidos inline mediante `.path()`.
 */
gameSessionSchema.pre('validate', function () {
  const cfg = this.sequenceConfig;
  if (!cfg) {
    return;
  }
  const min = Number(cfg.minSequenceLength);
  const max = Number(cfg.maxSequenceLength);
  if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
    this.invalidate(
      'sequenceConfig.minSequenceLength',
      'minSequenceLength debe ser <= maxSequenceLength'
    );
  }
});

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

/**
 * Índice para buscar sesiones por sensor asignado.
 */
gameSessionSchema.index({ sensorId: 1 });

/**
 * Índice compuesto para listar sesiones de un profesor ordenadas por fecha.
 * Cubre el patrón de consulta más frecuente: GET /api/sessions?createdBy=X&sort=createdAt
 */
gameSessionSchema.index({ createdBy: 1, createdAt: -1 });

/**
 * Índice compuesto para filtrar sesiones de un profesor por estado.
 * Cubre consultas como: sesiones activas de un profesor específico.
 */
gameSessionSchema.index({ createdBy: 1, status: 1 });

/**
 * Índice compuesto para lookups de contenido por profesor y contexto.
 * Caso de uso: análisis de tarjetas, efectividad de contenido (E06, E12-E14).
 */
gameSessionSchema.index({ createdBy: 1, contextId: 1 });

/**
 * Índice compuesto para lookups de analytics por profesor y mecánica.
 * Caso de uso: efectividad de contenido, fatiga, engagement (E06, E08, E12-E14).
 */
gameSessionSchema.index({ createdBy: 1, mechanicId: 1 });

const GameSession = mongoose.model('GameSession', gameSessionSchema);

// Exportar modelo y función auxiliar
module.exports = GameSession;
