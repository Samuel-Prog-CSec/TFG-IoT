/**
 * @fileoverview Seeder de mecánicas de juego.
 * Crea las mecánicas principales con reglas detalladas y configurables.
 * @module seeders/03-mechanics
 */

const GameMechanic = require('../src/models/GameMechanic');
const logger = require('../src/utils/logger');

/**
 * Datos de mecánicas de juego con reglas detalladas.
 *
 * Cada mecánica incluye:
 * - Configuración por defecto
 * - Límites permitidos
 * - Comportamiento específico
 */
const mechanicsData = [
  {
    name: 'association',
    displayName: 'Asociación',
    description:
      'El alumno ve una consigna en pantalla y debe encontrar la tarjeta física correcta.',
    icon: '🔗',
    rules: {
      // Configuración por defecto
      defaults: {
        numberOfCards: 5,
        numberOfRounds: 5,
        timeLimit: 15,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      },
      // Límites permitidos
      limits: {
        minCards: 2,
        maxCards: 20,
        minRounds: 1,
        maxRounds: 20,
        minTimeLimit: 5,
        maxTimeLimit: 60
      },
      // Comportamiento
      behavior: {
        challengeMode: 'single_prompt_single_scan',
        allowRepetition: true,
        avoidImmediateRepeat: true,
        showFeedback: true,
        soundEffects: true,
        showTimer: true
      }
    },
    isActive: true
  },
  {
    name: 'memory',
    displayName: 'Memoria',
    description:
      'Tablero de cartas boca abajo: el alumno las voltea por parejas para encontrar todas las iguales.',
    icon: '🧠',
    rules: {
      defaults: {
        numberOfCards: 6,
        numberOfRounds: 5,
        timeLimit: 20,
        pointsPerCorrect: 20,
        penaltyPerError: -3
      },
      limits: {
        minCards: 4,
        maxCards: 20,
        minRounds: 1,
        maxRounds: 10,
        minTimeLimit: 10,
        maxTimeLimit: 300
      },
      behavior: {
        boardMode: 'fixed_layout_from_wizard',
        cardVisibilityStart: 'face_down',
        matchingGroupSize: 2,
        revealOnScan: true,
        keepMatchedVisible: true,
        hideUnmatchedAfterDelayMs: 1200,
        completeWhenAllGroupsMatched: true
      }
    },
    isActive: true
  }
];

/**
 * Ejecuta el seeder de mecánicas.
 * Idempotente: si ya existen mecánicas en la base de datos, las devuelve sin
 * volver a crearlas (evita E11000 por el índice unique en `name`).
 * @returns {Promise<Array>} Array de mecánicas creadas o preexistentes
 */
async function seedMechanics() {
  try {
    const existing = await GameMechanic.find({});
    if (existing.length > 0) {
      logger.info(`Mecánicas ya existen (${existing.length}), omitiendo creacion`);
      return existing;
    }

    const mechanics = await GameMechanic.create(mechanicsData);

    const active = mechanics.filter(m => m.isActive).length;
    const inactive = mechanics.filter(m => !m.isActive).length;

    logger.info('Mecánicas de juego seeded exitosamente');
    logger.info(`- ${active} mecánicas activas`);
    logger.info(`- ${inactive} mecánicas inactivas`);

    return mechanics;
  } catch (error) {
    logger.error('Error en seedMechanics:', error);
    throw error;
  }
}

module.exports = seedMechanics;
