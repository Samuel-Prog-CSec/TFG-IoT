/**
 * @fileoverview Validadores Zod para GameSession.
 * Define esquemas de validación para sesiones de juego con validación compleja.
 * @module validators/gameSessionValidator
 */

const { z } = require('zod');
const { objectIdSchema, paginationSchema, uidSchema } = require('./commonValidator');
const { DIFFICULTY, SESSION_STATUS } = require('../constants/enums');

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
    .max(300, 'El límite de tiempo no puede exceder 300 segundos')
    .default(15),

  pointsPerCorrect: z
    .number()
    .int('pointsPerCorrect debe ser un número entero')
    .positive('Los puntos por respuesta correcta deben ser positivos')
    .default(10),

  penaltyPerError: z
    .number()
    .int('penaltyPerError debe ser un número entero')
    .nonpositive('La penalización debe ser cero o un número negativo')
    .default(-2)
});

/**
 * Schema para mapeo de token RFID fungible a valor de juego.
 * Relaciona una tarjeta RFID (identificada por UID) con un valor del contexto (ADR-012).
 *
 * @example
 * {
 *   uid: '32B8FA05',
 *   assignedValue: 'España',
 *   displayData: { emoji: '🇪🇸', audioUrl: '...', color: 'red' }
 * }
 */
const cardMappingSchema = z
  .object({
    uid: uidSchema,

    assignedValue: z
      .string()
      .min(1, 'El valor asignado es requerido')
      .max(200, 'El valor asignado no puede exceder 200 caracteres')
      .trim(),

    displayData: z.record(z.string(), z.any()).optional().default({})
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
 * 4. Sistema valida que la configuración sea coherente
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
 *     { uid: '32B8FA05', assignedValue: 'España', displayData: {...} },
 *     { uid: 'A1B2C3D4', assignedValue: 'Francia', displayData: {...} },
 *     { uid: 'E5F60708', assignedValue: 'Italia', displayData: {...} }
 *   ],
 *   difficulty: 'medium',
 *   createdBy: '507f1f77bcf86cd799439013'
 * }
 */
const sessionConfigInputSchema = sessionConfigSchema.partial();

const boardLayoutItemSchema = z
  .object({
    slotIndex: z
      .number()
      .int('slotIndex debe ser un número entero')
      .min(0, 'slotIndex no puede ser negativo'),
    uid: uidSchema,
    assignedValue: z
      .string()
      .min(1, 'assignedValue es requerido en boardLayout')
      .max(200, 'assignedValue en boardLayout no puede exceder 200 caracteres')
      .trim(),
    displayData: z.record(z.string(), z.any()).optional().default({})
  })
  .strict();

const boardLayoutSchema = z
  .array(boardLayoutItemSchema)
  .optional()
  .refine(layout => {
    if (!Array.isArray(layout) || layout.length === 0) {
      return true;
    }

    const slotSet = new Set(layout.map(item => item.slotIndex));
    return slotSet.size === layout.length;
  }, 'No puede haber slots duplicados en boardLayout')
  .refine(layout => {
    if (!Array.isArray(layout) || layout.length === 0) {
      return true;
    }

    const uidSet = new Set(layout.map(item => item.uid));
    return uidSet.size === layout.length;
  }, 'No puede haber UIDs duplicados en boardLayout');

const associationChallengeItemSchema = z
  .object({
    roundNumber: z
      .number()
      .int('roundNumber debe ser un número entero')
      .min(1, 'roundNumber debe ser >= 1'),
    uid: uidSchema,
    assignedValue: z
      .string()
      .min(1, 'assignedValue es requerido en associationChallengePlan')
      .max(200, 'assignedValue en associationChallengePlan no puede exceder 200 caracteres')
      .trim(),
    displayData: z.record(z.string(), z.any()).optional().default({}),
    promptText: z.string().max(180, 'promptText no puede exceder 180 caracteres').trim().optional()
  })
  .strict();

const associationChallengePlanSchema = z
  .array(associationChallengeItemSchema)
  .optional()
  .refine(plan => {
    if (!Array.isArray(plan) || plan.length === 0) {
      return true;
    }

    const roundSet = new Set(plan.map(item => item.roundNumber));
    return roundSet.size === plan.length;
  }, 'No puede haber rondas duplicadas en associationChallengePlan');

/**
 * Schema para un item individual dentro de la secuencia de una ronda.
 */
const sequenceItemSchema = z
  .object({
    uid: uidSchema,
    assignedValue: z
      .string()
      .min(1, 'assignedValue es requerido en sequencePlan')
      .max(200, 'assignedValue en sequencePlan no puede exceder 200 caracteres')
      .trim(),
    displayData: z.record(z.string(), z.any()).optional().default({})
  })
  .strict();

/**
 * Schema para una ronda completa del plan de secuencias.
 * - sequence con al menos 1 elemento, sin UIDs duplicados.
 * - length coincide con sequence.length.
 */
const sequencePlanRoundSchema = z
  .object({
    roundNumber: z
      .number()
      .int('roundNumber debe ser un número entero')
      .min(1, 'roundNumber debe ser >= 1'),
    length: z
      .number()
      .int('length debe ser un número entero')
      .min(1, 'length debe ser >= 1')
      .max(12, 'length no puede exceder 12'),
    sequence: z.array(sequenceItemSchema).min(1, 'La secuencia debe tener al menos 1 elemento')
  })
  .strict()
  .refine(round => round.length === round.sequence.length, {
    message: 'length debe coincidir con sequence.length'
  })
  .refine(round => {
    const uids = round.sequence.map(item => item.uid);
    return new Set(uids).size === uids.length;
  }, 'No puede haber UIDs duplicados dentro de una secuencia');

const sequencePlanSchema = z
  .array(sequencePlanRoundSchema)
  .optional()
  .refine(plan => {
    if (!Array.isArray(plan) || plan.length === 0) {
      return true;
    }
    const roundSet = new Set(plan.map(item => item.roundNumber));
    return roundSet.size === plan.length;
  }, 'No puede haber rondas duplicadas en sequencePlan');

/**
 * Schema para la configuración específica de Secuencia.
 * `minSequenceLength <= maxSequenceLength` se valida al final con superRefine
 * para que el mensaje de error sea más claro que un refine genérico.
 */
const sequenceConfigSchema = z
  .object({
    minSequenceLength: z
      .number()
      .int('minSequenceLength debe ser un número entero')
      .min(1, 'minSequenceLength debe ser >= 1')
      .max(12, 'minSequenceLength no puede exceder 12')
      .optional(),
    maxSequenceLength: z
      .number()
      .int('maxSequenceLength debe ser un número entero')
      .min(1, 'maxSequenceLength debe ser >= 1')
      .max(12, 'maxSequenceLength no puede exceder 12')
      .optional(),
    displaySeconds: z
      .number()
      .int('displaySeconds debe ser un número entero')
      .min(2, 'displaySeconds debe ser >= 2')
      .max(8, 'displaySeconds no puede exceder 8')
      .optional()
  })
  .strict()
  .refine(
    cfg => {
      if (cfg.minSequenceLength === undefined || cfg.maxSequenceLength === undefined) {
        return true;
      }
      return cfg.minSequenceLength <= cfg.maxSequenceLength;
    },
    {
      message: 'minSequenceLength debe ser <= maxSequenceLength',
      path: ['minSequenceLength']
    }
  );

const createGameSessionSchema = z
  .object({
    mechanicId: objectIdSchema,

    deckId: objectIdSchema,

    contextId: objectIdSchema.optional(),

    sensorId: z.string().max(100, 'sensorId no puede exceder 100 caracteres').trim().optional(),

    name: z.string().max(100, 'El nombre no puede exceder 100 caracteres').trim().optional(),

    difficulty: z.enum([...DIFFICULTY]).optional(),

    config: sessionConfigInputSchema.optional(),

    boardLayout: boardLayoutSchema,

    associationChallengePlan: associationChallengePlanSchema,

    sequencePlan: sequencePlanSchema,

    sequenceConfig: sequenceConfigSchema.optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debe proporcionar datos para crear la sesión'
  });

/**
 * Schema para actualizar una sesión existente.
 * Solo permite actualizar config y status si la sesión NO ha iniciado.
 *
 * IMPORTANTE: Una vez iniciada (status='active'), no se permite modificar el estado.
 * No se permite modificar cardMappings, mechanicId ni contextId después de crear.
 */
const updateGameSessionSchema = z
  .object({
    deckId: objectIdSchema.optional(),

    sensorId: z.string().max(100, 'sensorId no puede exceder 100 caracteres').trim().optional(),

    name: z.string().max(100, 'El nombre no puede exceder 100 caracteres').trim().optional(),

    config: sessionConfigInputSchema.optional(),

    boardLayout: boardLayoutSchema,

    associationChallengePlan: associationChallengePlanSchema,

    sequencePlan: sequencePlanSchema,

    sequenceConfig: sequenceConfigSchema.optional(),

    difficulty: z.enum([...DIFFICULTY]).optional()
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

  status: z.enum([...SESSION_STATUS]).optional(),

  difficulty: z.enum([...DIFFICULTY]).optional(),

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

const cloneSessionParamsSchema = z
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
  cloneSessionParamsSchema,
  sessionConfigSchema,
  sessionConfigInputSchema,
  cardMappingSchema,
  sequencePlanSchema,
  sequenceConfigSchema,
  sequenceItemSchema,
  sequencePlanRoundSchema
};
