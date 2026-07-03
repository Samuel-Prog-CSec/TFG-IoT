/**
 * @fileoverview Validadores Zod para GameSession.
 * Define esquemas de validación para sesiones de juego con validación compleja.
 * @module validators/gameSessionValidator
 */

const { z } = require('zod');
const {
  objectIdSchema,
  paginationSchema,
  uidSchema,
  cardMappingSchema,
  sanitizedString
} = require('./commonValidator');
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

  // QA 2026-05-06 (ADR-114): rangos unificados entre las 3 mecánicas para
  // evitar deformación del ranking. `pointsPerCorrect` 5-15 y
  // `penaltyPerError` -5..0 son los rangos pedagógicos válidos. Sin esta
  // restricción el wizard permitía ratios extremos (Asociación 5-25,
  // Memoria 5-30) que producían maxScores 6× más altos en una mecánica
  // que en otra para el mismo número de aciertos.
  pointsPerCorrect: z
    .number()
    .int('pointsPerCorrect debe ser un número entero')
    .min(5, 'Los puntos por acierto deben ser al menos 5')
    .max(15, 'Los puntos por acierto no pueden exceder 15')
    .default(10),

  penaltyPerError: z
    .number()
    .int('penaltyPerError debe ser un número entero')
    .min(-5, 'La penalización por error no puede ser inferior a -5')
    .max(0, 'La penalización debe ser cero o negativa')
    .default(-2)
});

// cardMappingSchema se importa desde commonValidator (consolidado pre-v1.0.0).
// Mantenemos el re-export en module.exports para preservar el API público existente.

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
    assignedValue: sanitizedString({
      min: 1,
      max: 200,
      label: 'assignedValue en boardLayout'
    }),
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
    assignedValue: sanitizedString({
      min: 1,
      max: 200,
      label: 'assignedValue en associationChallengePlan'
    }),
    displayData: z.record(z.string(), z.any()).optional().default({}),
    promptText: sanitizedString({ min: 0, max: 180, label: 'promptText' }).optional()
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
    assignedValue: sanitizedString({
      min: 1,
      max: 200,
      label: 'assignedValue en sequencePlan'
    }),
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

/**
 * Configuración específica de la mecánica Asociación. Por ahora solo el flag
 * `autoPlayPrompt` (locución automática de la consigna de audio). `.strict()`
 * rechaza claves desconocidas para no colar campos arbitrarios.
 */
const associationConfigSchema = z
  .object({
    autoPlayPrompt: z.boolean().optional()
  })
  .strict();

const createGameSessionSchema = z
  .object({
    mechanicId: objectIdSchema,

    deckId: objectIdSchema,

    contextId: objectIdSchema.optional(),

    sensorId: sanitizedString({ min: 0, max: 100, label: 'sensorId' }).optional(),

    name: sanitizedString({ min: 0, max: 100, label: 'El nombre de la sesión' }).optional(),

    difficulty: z.enum([...DIFFICULTY]).optional(),

    config: sessionConfigInputSchema.optional(),

    boardLayout: boardLayoutSchema,

    associationChallengePlan: associationChallengePlanSchema,

    sequencePlan: sequencePlanSchema,

    sequenceConfig: sequenceConfigSchema.optional(),

    associationConfig: associationConfigSchema.optional()
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

    sensorId: sanitizedString({ min: 0, max: 100, label: 'sensorId' }).optional(),

    name: sanitizedString({ min: 0, max: 100, label: 'El nombre de la sesión' }).optional(),

    config: sessionConfigInputSchema.optional(),

    boardLayout: boardLayoutSchema,

    associationChallengePlan: associationChallengePlanSchema,

    sequencePlan: sequencePlanSchema,

    sequenceConfig: sequenceConfigSchema.optional(),

    associationConfig: associationConfigSchema.optional(),

    difficulty: z.enum([...DIFFICULTY]).optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  })
  .superRefine((data, ctx) => {
    // Si el caller envía simultáneamente sequencePlan y config.numberOfRounds,
    // ambos deben coincidir en longitud. Hasta T-921 era posible enviar un plan
    // de 3 rondas y un numberOfRounds=5, dejando la mecánica Secuencia en estado
    // incoherente (rondas pintadas sin entradas en el plan).
    if (
      Array.isArray(data.sequencePlan) &&
      data.config?.numberOfRounds !== undefined &&
      data.sequencePlan.length !== data.config.numberOfRounds
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sequencePlan'],
        message: 'sequencePlan debe tener el mismo número de rondas que config.numberOfRounds'
      });
    }
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
  associationConfigSchema,
  sequenceItemSchema,
  sequencePlanRoundSchema
};
