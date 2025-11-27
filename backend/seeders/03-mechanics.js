/**
 * @fileoverview Seeder de mecánicas de juego.
 * Crea las mecánicas principales: association, sequence, memory, classification.
 * @module seeders/03-mechanics
 */

const GameMechanic = require('../src/models/GameMechanic');
const logger = require('../src/utils/logger');

/**
 * Datos de mecánicas de juego.
 */
const mechanicsData = [
  {
    name: 'association',
    displayName: 'Asociación',
    description: 'Emparejar elementos relacionados (ej: país → bandera, animal → sonido)',
    icon: '🔗',
    rules: {
      maxPairs: 20,
      minPairs: 2,
      allowRepetition: false,
      showFeedback: true,
      timePerPair: 15
    },
    isActive: true
  },
  {
    name: 'sequence',
    displayName: 'Secuencia',
    description: 'Escanear tarjetas en el orden correcto (ej: línea temporal, pasos de un proceso)',
    icon: '🔢',
    rules: {
      maxSteps: 10,
      minSteps: 3,
      strictOrder: true,
      allowSkip: false,
      showProgress: true
    },
    isActive: true
  },
  {
    name: 'memory',
    displayName: 'Memoria',
    description: 'Recordar y recrear patrones de tarjetas',
    icon: '🧠',
    rules: {
      maxPatternLength: 8,
      minPatternLength: 3,
      showPattern: true,
      patternDisplayTime: 5,
      allowRetry: false
    },
    isActive: true
  },
  {
    name: 'classification',
    displayName: 'Clasificación',
    description: 'Agrupar elementos según categorías (ej: frutas, verduras, animales)',
    icon: '📂',
    rules: {
      maxCategories: 5,
      minCategories: 2,
      allowMultipleCategories: false,
      showCategoryHints: true
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

    logger.info('✅ Mecánicas de juego seeded exitosamente');

    return mechanics;
  } catch (error) {
    logger.error('❌ Error en seedMechanics:', error);
    throw error;
  }
}

module.exports = seedMechanics;
