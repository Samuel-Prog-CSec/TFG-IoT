/**
 * @fileoverview Seeder de sesiones de juego.
 * Crea sesiones preconfiguradas utilizando los mazos (CardDecks) creados previamente.
 * Las sesiones ahora REQUIEREN un deckId según el modelo actualizado.
 * @module seeders/06-sessions
 */

const GameSession = require('../src/models/GameSession');
const logger = require('../src/utils/logger');

/**
 * Busca una mecánica por nombre.
 * @param {Array} mechanics - Array de mecánicas
 * @param {string} name - Nombre de la mecánica
 * @returns {Object|undefined} Mecánica encontrada
 */
function findMechanic(mechanics, name) {
  return mechanics.find(m => m.name === name);
}

/**
 * Busca un contexto por contextId.
 * @param {Array} contexts - Array de contextos
 * @param {string} contextId - ID del contexto
 * @returns {Object|undefined} Contexto encontrado
 */
function findContext(contexts, contextId) {
  return contexts.find(c => c.contextId === contextId);
}

/**
 * Busca mazos por el ID del profesor.
 * @param {Array} decks - Array de mazos
 * @param {ObjectId} teacherId - ID del profesor
 * @returns {Array} Mazos del profesor
 */
function getTeacherDecks(decks, teacherId) {
  return decks.filter(d => d.createdBy.toString() === teacherId.toString());
}

/**
 * Busca un mazo por contextId dentro de los mazos de un profesor.
 * @param {Array} teacherDecks - Mazos del profesor
 * @param {Array} contexts - Contextos disponibles
 * @param {string} contextKey - Key del contexto (ej: 'colors-basic')
 * @returns {Object|undefined} Mazo encontrado
 */
function findDeckByContext(teacherDecks, contexts, contextKey) {
  const context = findContext(contexts, contextKey);
  if (!context) {
    return undefined;
  }
  return teacherDecks.find(d => d.contextId.toString() === context._id.toString());
}

/**
 * Configuración de sesiones predefinidas.
 * Cada template define qué tipo de sesión crear.
 */
const sessionTemplates = [
  // --- SESIONES ACTIVAS ---
  {
    contextKey: 'colors-basic',
    mechanicName: 'association',
    config: {
      numberOfRounds: 5,
      timeLimit: 15,
      pointsPerCorrect: 10,
      penaltyPerError: -2
    },
    status: 'active',
    difficulty: 'easy',
    description: 'Asociación con Colores'
  },
  {
    contextKey: 'animals-farm',
    mechanicName: 'association',
    config: {
      numberOfRounds: 6,
      timeLimit: 12,
      pointsPerCorrect: 10,
      penaltyPerError: -3
    },
    status: 'active',
    difficulty: 'medium',
    description: 'Asociación con Animales de Granja'
  },

  // --- SESIONES CREADAS (pendientes de iniciar) ---
  {
    contextKey: 'numbers-1-10',
    mechanicName: 'sequence',
    config: {
      numberOfRounds: 3,
      timeLimit: 30,
      pointsPerCorrect: 15,
      penaltyPerError: -5
    },
    status: 'created',
    difficulty: 'easy',
    description: 'Secuencia con Números'
  },
  {
    contextKey: 'shapes',
    mechanicName: 'memory',
    config: {
      numberOfRounds: 5,
      timeLimit: 20,
      pointsPerCorrect: 20,
      penaltyPerError: -3
    },
    status: 'created',
    difficulty: 'medium',
    description: 'Memoria con Formas'
  },
  {
    contextKey: 'emotions',
    mechanicName: 'classification',
    config: {
      numberOfRounds: 5,
      timeLimit: 20,
      pointsPerCorrect: 10,
      penaltyPerError: -2
    },
    status: 'created',
    difficulty: 'hard',
    description: 'Clasificación con Emociones'
  },
  {
    contextKey: 'alphabet-vowels',
    mechanicName: 'association',
    config: {
      numberOfRounds: 5,
      timeLimit: 15,
      pointsPerCorrect: 10,
      penaltyPerError: -2
    },
    status: 'created',
    difficulty: 'easy',
    description: 'Asociación con Vocales'
  },

  // --- SESIONES COMPLETADAS (históricas) ---
  {
    contextKey: 'fruits',
    mechanicName: 'association',
    config: {
      numberOfRounds: 5,
      timeLimit: 15,
      pointsPerCorrect: 10,
      penaltyPerError: -2
    },
    status: 'completed',
    difficulty: 'easy',
    description: 'Asociación con Frutas',
    daysAgo: 2 // Completada hace 2 días
  },
  {
    contextKey: 'animals-wild',
    mechanicName: 'association',
    config: {
      numberOfRounds: 5,
      timeLimit: 12,
      pointsPerCorrect: 12,
      penaltyPerError: -3
    },
    status: 'completed',
    difficulty: 'medium',
    description: 'Asociación con Animales Salvajes',
    daysAgo: 5 // Completada hace 5 días
  },
  {
    contextKey: 'transport',
    mechanicName: 'sequence',
    config: {
      numberOfRounds: 4,
      timeLimit: 25,
      pointsPerCorrect: 15,
      penaltyPerError: -4
    },
    status: 'completed',
    difficulty: 'medium',
    description: 'Secuencia de Transportes',
    daysAgo: 7 // Completada hace una semana
  },

  // --- SESIONES PAUSADAS ---
  {
    contextKey: 'weekdays',
    mechanicName: 'sequence',
    config: {
      numberOfRounds: 3,
      timeLimit: 30,
      pointsPerCorrect: 15,
      penaltyPerError: -5
    },
    status: 'paused',
    difficulty: 'easy',
    description: 'Secuencia de Días de la Semana'
  }
];

/**
 * Genera sesiones para un profesor usando sus mazos.
 * @param {Object} teacher - Documento del profesor
 * @param {Array} teacherDecks - Mazos del profesor
 * @param {Array} mechanics - Mecánicas disponibles
 * @param {Array} contexts - Contextos disponibles
 * @returns {Array} Array de datos de sesiones
 */
function generateSessionsForTeacher(teacher, teacherDecks, mechanics, contexts) {
  const sessions = [];

  sessionTemplates.forEach(template => {
    const mechanic = findMechanic(mechanics, template.mechanicName);
    const deck = findDeckByContext(teacherDecks, contexts, template.contextKey);

    if (!mechanic) {
      logger.warn(`Mecánica '${template.mechanicName}' no encontrada, saltando sesión`);
      return;
    }

    if (!deck) {
      // Puede que este profesor no tenga un mazo para este contexto
      return;
    }

    // Calcular timestamps según el estado
    let startedAt = null;
    let endedAt = null;

    if (template.status === 'active' || template.status === 'paused') {
      startedAt = new Date();
      // Si está pausada, empezó hace una hora
      if (template.status === 'paused') {
        startedAt = new Date(Date.now() - 60 * 60 * 1000);
      }
    } else if (template.status === 'completed' && template.daysAgo) {
      const daysInMs = template.daysAgo * 24 * 60 * 60 * 1000;
      startedAt = new Date(Date.now() - daysInMs);
      endedAt = new Date(startedAt.getTime() + 30 * 60 * 1000); // Duró 30 minutos
    }

    sessions.push({
      mechanicId: mechanic._id,
      deckId: deck._id,
      contextId: deck.contextId,
      config: {
        numberOfCards: deck.cardMappings.length,
        numberOfRounds: template.config.numberOfRounds,
        timeLimit: template.config.timeLimit,
        pointsPerCorrect: template.config.pointsPerCorrect,
        penaltyPerError: template.config.penaltyPerError
      },
      // Los cardMappings se copian desde el mazo
      cardMappings: deck.cardMappings.map(mapping => ({
        cardId: mapping.cardId,
        uid: mapping.uid,
        assignedValue: mapping.assignedValue,
        displayData: mapping.displayData
      })),
      status: template.status,
      difficulty: template.difficulty,
      createdBy: teacher._id,
      startedAt,
      endedAt
    });
  });

  return sessions;
}

/**
 * Ejecuta el seeder de sesiones.
 * @param {Object} users - Usuarios creados { teachers, students }
 * @param {Array} mechanics - Mecánicas creadas
 * @param {Array} contexts - Contextos creados
 * @param {Array} cards - Tarjetas creadas (no usado directamente, viene del mazo)
 * @param {Array} decks - Mazos creados
 * @returns {Promise<Array>} Array de sesiones creadas
 */
async function seedSessions(users, mechanics, contexts, cards, decks) {
  try {
    const { teachers } = users;
    const allSessions = [];

    // Generar sesiones para cada profesor
    for (const teacher of teachers) {
      const teacherDecks = getTeacherDecks(decks, teacher._id);
      const teacherSessions = generateSessionsForTeacher(
        teacher,
        teacherDecks,
        mechanics,
        contexts
      );
      allSessions.push(...teacherSessions);
    }

    // Insertar todas las sesiones
    const sessions = await GameSession.insertMany(allSessions);

    // Estadísticas por estado
    const byStatus = sessions.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});

    // Estadísticas por dificultad
    const byDifficulty = sessions.reduce((acc, s) => {
      acc[s.difficulty] = (acc[s.difficulty] || 0) + 1;
      return acc;
    }, {});

    logger.info('✅ Sesiones de juego seeded exitosamente');
    logger.info(`   - ${sessions.length} sesiones totales`);
    logger.info(`   - Por estado:`);
    Object.entries(byStatus).forEach(([status, count]) => {
      logger.info(`     • ${count} sesiones "${status}"`);
    });
    logger.info(`   - Por dificultad:`);
    Object.entries(byDifficulty).forEach(([difficulty, count]) => {
      logger.info(`     • ${count} sesiones "${difficulty}"`);
    });

    return sessions;
  } catch (error) {
    logger.error('❌ Error en seedSessions:', error);
    throw error;
  }
}

module.exports = seedSessions;
