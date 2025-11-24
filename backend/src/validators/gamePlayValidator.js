/**
 * @fileoverview Validadores Zod para GamePlay.
 * Define esquemas de validación para partidas individuales de estudiantes.
 * @module validators/gamePlayValidator
 */

const { z } = require('zod');

/**
 * Schema para ObjectId de MongoDB
 */
const objectIdSchema = z.string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Formato de ObjectId inválido');

/**
 * Schema para un evento individual en la partida.
 * Registra cada acción del jugador (escaneo, correcta, error, timeout, etc.).
 *
 * @example
 * {
 *   eventType: 'correct',
 *   cardUid: '32B8FA05',
 *   expectedValue: 'España',
 *   actualValue: 'España',
 *   pointsAwarded: 10,
 *   timeElapsed: 3500,
 *   roundNumber: 2
 * }
 */
const gameEventSchema = z.object({
  timestamp: z.date()
    .default(() => new Date()),

  eventType: z.enum([
    'card_scanned',
    'correct',
    'error',
    'timeout',
    'round_start',
    'round_end'
  ]),

  cardUid: z.string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-F]{8}$|^[0-9A-F]{14}$/)
    .optional(),

  expectedValue: z.string()
    .trim()
    .optional(),

  actualValue: z.string()
    .trim()
    .optional(),

  pointsAwarded: z.number()
    .int('pointsAwarded debe ser un número entero')
    .optional(),

  timeElapsed: z.number()
    .int('timeElapsed debe ser un número entero (milisegundos)')
    .min(0, 'El tiempo no puede ser negativo')
    .optional(),

  roundNumber: z.number()
    .int('roundNumber debe ser un número entero')
    .min(1, 'El número de ronda debe ser al menos 1')
    .optional()
});

/**
 * Schema para las métricas acumuladas de la partida.
 * Se actualiza automáticamente con cada evento.
 */
const gameMetricsSchema = z.object({
  totalAttempts: z.number()
    .int()
    .min(0)
    .default(0),

  correctAttempts: z.number()
    .int()
    .min(0)
    .default(0),

  errorAttempts: z.number()
    .int()
    .min(0)
    .default(0),

  timeoutAttempts: z.number()
    .int()
    .min(0)
    .default(0),

  averageResponseTime: z.number()
    .min(0)
    .default(0),

  completionTime: z.number()
    .int()
    .min(0)
    .default(0)
});

/**
 * Schema para crear una nueva partida (GamePlay).
 *
 * Una GamePlay es una partida individual de un estudiante en una sesión específica.
 * Múltiples GamePlays pueden asociarse a la misma GameSession.
 *
 * Flujo típico:
 * 1. Profesor crea GameSession con configuración
 * 2. Profesor crea GamePlay para cada alumno que jugará
 * 3. Cada alumno juega su propia GamePlay a su ritmo
 * 4. Sistema registra eventos y calcula métricas
 * 5. Al finalizar, actualiza User.studentMetrics
 *
 * @example
 * {
 *   sessionId: '507f1f77bcf86cd799439011',
 *   playerId: '507f1f77bcf86cd799439012'
 * }
 */
const createGamePlaySchema = z.object({
  sessionId: objectIdSchema,

  playerId: objectIdSchema
})
.refine(
  async (data) => {
    // NOTA: Esta validación se hará en el Controller/Service
    // Aquí solo validamos formato, no existencia en DB
    return true;
  },
  {
    message: 'sessionId y playerId deben referenciar documentos existentes'
  }
);

/**
 * Schema para actualizar una partida existente.
 *
 * IMPORTANTE: La mayoría de actualizaciones se hacen automáticamente
 * mediante el método addEvent() del modelo. Este schema es para
 * actualizaciones manuales excepcionales (ej: completar forzosamente).
 */
const updateGamePlaySchema = z.object({
  status: z.enum(['in-progress', 'completed', 'abandoned'])
    .optional(),

  score: z.number()
    .int('El score debe ser un número entero')
    .optional(),

  currentRound: z.number()
    .int('currentRound debe ser un número entero')
    .min(1)
    .optional(),

  completedAt: z.date()
    .optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Debe proporcionar al menos un campo para actualizar' }
);

/**
 * Schema para añadir un evento a una partida existente.
 * Usado por el GameEngine cuando el alumno escanea una tarjeta.
 *
 * @example
 * POST /plays/:id/events
 * {
 *   eventType: 'correct',
 *   cardUid: '32B8FA05',
 *   expectedValue: 'España',
 *   actualValue: 'España',
 *   pointsAwarded: 10,
 *   timeElapsed: 3500,
 *   roundNumber: 2
 * }
 */
const addEventSchema = gameEventSchema.omit({ timestamp: true });

/**
 * Schema para query params de búsqueda de partidas.
 *
 * Permite filtrar por:
 * - sessionId: Todas las partidas de una sesión
 * - playerId: Todas las partidas de un alumno
 * - status: Estado de la partida
 * - Rango de fechas (startedAt, completedAt)
 * - Rango de puntuación
 *
 * @example
 * GET /plays?playerId=507f...&status=completed&minScore=50&page=1
 */
const gamePlayQuerySchema = z.object({
  page: z.string()
    .optional()
    .transform(val => val ? parseInt(val, 10) : 1)
    .pipe(z.number().int().min(1)),

  limit: z.string()
    .optional()
    .transform(val => val ? parseInt(val, 10) : 20)
    .pipe(z.number().int().min(1).max(100)),

  sortBy: z.enum(['createdAt', 'startedAt', 'completedAt', 'score'])
    .optional()
    .default('createdAt'),

  order: z.enum(['asc', 'desc'])
    .optional()
    .default('desc'),

  sessionId: objectIdSchema.optional(),

  playerId: objectIdSchema.optional(),

  status: z.enum(['in-progress', 'completed', 'abandoned'])
    .optional(),

  minScore: z.string()
    .optional()
    .transform(val => val ? parseInt(val, 10) : undefined)
    .pipe(z.number().int().optional()),

  maxScore: z.string()
    .optional()
    .transform(val => val ? parseInt(val, 10) : undefined)
    .pipe(z.number().int().optional())
});

/**
 * Schema para validar parámetros de ruta (:id)
 */
const gamePlayParamsSchema = z.object({
  id: objectIdSchema
});

/**
 * Schema para obtener estadísticas de un jugador.
 *
 * @example
 * GET /plays/stats/:playerId?sessionId=507f...
 */
const playerStatsQuerySchema = z.object({
  sessionId: objectIdSchema.optional()
});

module.exports = {
  createGamePlaySchema,
  updateGamePlaySchema,
  addEventSchema,
  gamePlayQuerySchema,
  gamePlayParamsSchema,
  playerStatsQuerySchema,
  gameEventSchema,
  gameMetricsSchema
};
