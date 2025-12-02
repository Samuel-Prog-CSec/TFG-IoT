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
    description: 'El alumno debe asociar cada desafío con la tarjeta correcta. ' +
      'Por ejemplo: se muestra la bandera de España y el alumno debe escanear la tarjeta asignada a "España".',
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
        allowRepetition: true, // Un mismo desafío puede repetirse
        showFeedback: true,    // Mostrar si es correcto/incorrecto
        soundEffects: true,    // Reproducir sonidos
        showTimer: true        // Mostrar cuenta regresiva
      }
    },
    isActive: true
  },
  {
    name: 'sequence',
    displayName: 'Secuencia',
    description: 'El alumno debe escanear las tarjetas en un orden específico. ' +
      'Por ejemplo: ordenar los números del 1 al 5, o los días de la semana.',
    icon: '🔢',
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
        strictOrder: true,      // Debe ser en orden exacto
        allowSkip: false,       // No puede saltarse elementos
        showProgress: true,     // Mostrar progreso (ej: "3 de 5")
        resetOnError: false     // Si se equivoca, ¿reinicia la secuencia?
      }
    },
    isActive: true
  },
  {
    name: 'memory',
    displayName: 'Memoria',
    description: 'Se muestra un patrón de elementos y el alumno debe reproducirlo escaneando las tarjetas en el mismo orden.',
    icon: '🧠',
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
        showPattern: true,          // Mostrar el patrón al inicio
        patternDisplayTime: 5,      // Segundos que se muestra el patrón
        incrementDifficulty: true,  // Aumentar longitud del patrón
        allowRetry: false           // Permitir reintentar el patrón
      }
    },
    isActive: true
  },
  {
    name: 'classification',
    displayName: 'Clasificación',
    description: 'El alumno debe clasificar elementos en categorías. ' +
      'Por ejemplo: separar frutas de verduras, o animales terrestres de acuáticos.',
    icon: '📂',
    rules: {
      defaults: {
        numberOfCards: 6,
        numberOfRounds: 5,
        timeLimit: 20,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      },
      limits: {
        minCards: 4,
        maxCards: 12,
        minRounds: 1,
        maxRounds: 15,
        minTimeLimit: 10,
        maxTimeLimit: 45
      },
      behavior: {
        maxCategories: 4,              // Máximo de categorías permitidas
        minCategories: 2,              // Mínimo de categorías
        showCategoryHints: true,       // Mostrar pistas de categoría
        allowMultipleCategories: false // Un elemento puede estar en varias categorías
      }
    },
    isActive: true
  },
  {
    name: 'speed',
    displayName: 'Velocidad',
    description: 'El alumno debe responder lo más rápido posible. Bonificación por tiempo de respuesta.',
    icon: '⚡',
    rules: {
      defaults: {
        numberOfCards: 5,
        numberOfRounds: 10,
        timeLimit: 10,
        pointsPerCorrect: 10,
        penaltyPerError: -5
      },
      limits: {
        minCards: 3,
        maxCards: 10,
        minRounds: 5,
        maxRounds: 20,
        minTimeLimit: 3,
        maxTimeLimit: 15
      },
      behavior: {
        timeBonus: true,           // Puntos extra por respuesta rápida
        timeBonusThreshold: 3,     // Segundos para obtener bonus
        timeBonusPoints: 5,        // Puntos de bonus
        showLeaderboard: true      // Mostrar ranking de tiempos
      }
    },
    isActive: false // Deshabilitado por defecto (mecánica avanzada)
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

    logger.info('✅ Mecánicas de juego seeded exitosamente');
    logger.info(`   - ${active} mecánicas activas`);
    logger.info(`   - ${inactive} mecánicas inactivas (avanzadas)`);

    return mechanics;
  } catch (error) {
    logger.error('❌ Error en seedMechanics:', error);
    throw error;
  }
}

module.exports = seedMechanics;
