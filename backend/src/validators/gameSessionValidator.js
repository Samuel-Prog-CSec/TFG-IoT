/**
 * @fileoverview Validadores Zod para GameSession.
 * Define esquemas de validación para sesiones de juego con validación compleja.
 * @module validators/gameSessionValidator
 */

const { z } = require('zod');
const { objectIdSchema, paginationSchema, uidSchema } = require('./commonValidator');

/**
 * Schema para configuración de la sesión.
 * Define reglas del juego: cantidad de tarjetas, rondas, tiempo, puntuación.
 */
const sessionConfigSchema = z.object({
  numberOfCards: z
    .number()
    .int('numberOfCards debe ser un número entero')
    .min(2, 'Deben usarse al menos 2 tarjetas')
    .max(20, 'No se pueden usar más de 20 tarjetas'),

  numberOfRounds: z
    .number()
    .int('numberOfRounds debe ser un número entero')
    .min(1, 'Debe haber al menos 1 ronda')
    .max(20, 'No pueden haber más de 20 rondas')
    .default(5),

  timeLimit: z
    .number()
    .int('timeLimit debe ser un número entero')
    .min(3, 'El límite de tiempo debe ser al menos 3 segundos')
    .max(60, 'El límite de tiempo no puede exceder 60 segundos')
    .default(15),

  pointsPerCorrect: z
    .number()
    .int('pointsPerCorrect debe ser un número entero')
    .positive('Los puntos por respuesta correcta deben ser positivos')
    .default(10),

  penaltyPerError: z
    .number()
    .int('penaltyPerError debe ser un número entero')
    .negative('La penalización debe ser un número negativo')
    .default(-2)
});

/**
 * Schema para mapeo de tarjeta a valor de juego.
 * Relaciona una tarjeta RFID física con un valor específico del contexto.
 *
 * @example
 * {
 *   cardId: '507f1f77bcf86cd799439011',
 *   uid: '32B8FA05',
 *   assignedValue: 'España',
 *   displayData: { emoji: '🇪🇸', audioUrl: '...', color: 'red' }
 * }
 */
const cardMappingSchema = z
  .object({
    cardId: objectIdSchema,

    uid: uidSchema,

    assignedValue: z
      .string()
      .min(1, 'El valor asignado es requerido')
      .max(200, 'El valor asignado no puede exceder 200 caracteres')
      .trim(),

    displayData: z.record(z.any()).optional().default({})
  })
  .strict();

/**
 * Schema para crear una nueva sesión de juego.
 *
 * Este es el schema más complejo del sistema. Valida:
 * 1. Referencias válidas a mechanic y context
 * 2. Configuración de sesión coherente
 * 3. Mapeos de tarjetas completos
 * 4. Que numberOfCards coincida con longitud de cardMappings
 * 5. Que los UIDs en cardMappings sean únicos
 *
 * Flujo típico:
 * 1. Profesor selecciona mecánica (ej: 'association')
 * 2. Profesor selecciona contexto (ej: 'geography')
 * 3. Profesor asigna tarjetas disponibles a valores del contexto
 * 4. Sistema valida que todo sea coherente
 *
 * @example
 * {
 *   mechanicId: '507f1f77bcf86cd799439011',
 *   contextId: '507f1f77bcf86cd799439012',
 *   config: {
 *     numberOfCards: 3,
 *     numberOfRounds: 5,
 *     timeLimit: 15,
 *     pointsPerCorrect: 10,
 *     penaltyPerError: -2
 *   },
 *   cardMappings: [
 *     { cardId: '...', uid: '32B8FA05', assignedValue: 'España', displayData: {...} },
 *     { cardId: '...', uid: 'A1B2C3D4', assignedValue: 'Francia', displayData: {...} },
 *     { cardId: '...', uid: 'E5F6G7H8', assignedValue: 'Italia', displayData: {...} }
 *   ],
 *   difficulty: 'medium',
 *   createdBy: '507f1f77bcf86cd799439013'
 * }
 */
const sessionConfigInputSchema = sessionConfigSchema.partial();

const createGameSessionSchema = z
  .object({
    mechanicId: objectIdSchema,

    deckId: objectIdSchema,

    contextId: objectIdSchema.optional(),

    config: sessionConfigInputSchema.optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debe proporcionar datos para crear la sesión'
  });

/**
 * Schema para actualizar una sesión existente.
 * Solo permite actualizar config y status si la sesión NO ha iniciado.
 *
 * IMPORTANTE: Una vez iniciada (status='active'), solo se permite cambiar a 'paused'.
 * No se permite modificar cardMappings, mechanicId ni contextId después de crear.
 */
const updateGameSessionSchema = z
  .object({
    deckId: objectIdSchema.optional(),

    config: sessionConfigInputSchema.optional(),

    status: z.enum(['created', 'active', 'paused', 'completed']).optional(),

    difficulty: z.enum(['easy', 'medium', 'hard']).optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  });

/**
 * Schema para query params de búsqueda de sesiones.
 *
 * Permite filtrar por:
 * - mechanicId: Mecánica específica
 * - contextId: Contexto específico
 * - status: Estado de la sesión
 * - difficulty: Dificultad
 * - createdBy: Profesor que la creó
 *
 * @example
 * GET /sessions?status=active&difficulty=medium&page=1&limit=10
 */
const gameSessionQuerySchema = paginationSchema.extend({
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'startedAt', 'difficulty'])
    .optional()
    .default('createdAt'),

  mechanicId: objectIdSchema.optional(),

  contextId: objectIdSchema.optional(),

  status: z.enum(['created', 'active', 'paused', 'completed']).optional(),

  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),

  createdBy: objectIdSchema.optional()
});

/**
 * Schema para validar parámetros de ruta (:id)
 */
const gameSessionParamsSchema = z
  .object({
    id: objectIdSchema
  })
  .strict();

/**
 * Schema para acciones de la sesión (start, pause, end).
 * No requiere body, solo valida que el ID sea correcto.
 */
const sessionActionSchema = z
  .object({
    id: objectIdSchema
  })
  .strict();

module.exports = {
  createGameSessionSchema,
  updateGameSessionSchema,
  gameSessionQuerySchema,
  gameSessionParamsSchema,
  sessionActionSchema,
  sessionConfigSchema,
  sessionConfigInputSchema,
  cardMappingSchema
};
