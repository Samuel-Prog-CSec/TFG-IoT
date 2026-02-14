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
      'El alumno debe asociar cada desafío con la tarjeta correcta. ' +
      'Por ejemplo: se muestra la bandera de España y el alumno debe escanear la tarjeta asignada a "España".',
    icon: 'association',
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
        allowRepetition: true, // Un mismo desafío puede repetirse
        showFeedback: true, // Mostrar si es correcto/incorrecto
        soundEffects: true, // Reproducir sonidos
        showTimer: true // Mostrar cuenta regresiva
      }
    },
    isActive: true
  },
  {
    name: 'sequence',
    displayName: 'Secuencia',
    description:
      'El alumno debe escanear las tarjetas en un orden específico. ' +
      'Por ejemplo: ordenar los números del 1 al 5, o los días de la semana.',
    icon: 'sequence',
    rules: {
      defaults: {
        numberOfCards: 5,
        numberOfRounds: 3,
        timeLimit: 30,
        pointsPerCorrect: 15,
        penaltyPerError: -5
      },
      limits: {
        minCards: 3,
        maxCards: 10,
        minRounds: 1,
        maxRounds: 10,
        minTimeLimit: 10,
        maxTimeLimit: 120
      },
      behavior: {
        strictOrder: true, // Debe ser en orden exacto
        allowSkip: false, // No puede saltarse elementos
        showProgress: true, // Mostrar progreso (ej: "3 de 5")
        resetOnError: false // Si se equivoca, ¿reinicia la secuencia?
      }
    },
    isActive: true
  },
  {
    name: 'memory',
    displayName: 'Memoria',
    description:
      'Se muestra un patrón de elementos y el alumno debe reproducirlo escaneando las tarjetas en el mismo orden.',
    icon: 'memory',
    rules: {
      defaults: {
        numberOfCards: 4,
        numberOfRounds: 5,
        timeLimit: 20,
        pointsPerCorrect: 20,
        penaltyPerError: -3
      },
      limits: {
        minCards: 3,
        maxCards: 8,
        minRounds: 1,
        maxRounds: 10,
        minTimeLimit: 10,
        maxTimeLimit: 60
      },
      behavior: {
        showPattern: true, // Mostrar el patrón al inicio
        patternDisplayTime: 5, // Segundos que se muestra el patrón
        incrementDifficulty: true, // Aumentar longitud del patrón
        allowRetry: false // Permitir reintentar el patrón
      }
    },
    isActive: true
  }
];

/**
 * Ejecuta el seeder de mecánicas.
 * @returns {Promise<Array>} Array de mecánicas creadas
 */
async function seedMechanics() {
  try {
    const mechanics = await GameMechanic.insertMany(mechanicsData);

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
