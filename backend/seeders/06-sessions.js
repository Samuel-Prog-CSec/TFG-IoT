/**
 * @fileoverview Seeder de sesiones de juego.
 * Crea sesiones preconfiguradas utilizando los mazos (CardDecks) creados previamente.
 * Las sesiones incluyen associationChallengePlan y boardLayout segun la mecanica,
 * replicando fielmente los documentos que crea el controller real.
 * @module seeders/06-sessions
 */

const GameSession = require('../src/models/GameSession');
const logger = require('../src/utils/logger');

/**
 * Busca una mecanica por nombre.
 * @param {Array} mechanics - Array de mecanicas
 * @param {string} name - Nombre de la mecanica
 * @returns {Object|undefined} Mecanica encontrada
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
 * Genera un associationChallengePlan para sesiones de mecanica 'association'.
 * Selecciona tarjetas del mazo de forma determinista con repeticion controlada.
 * @param {Array} cardMappings - Mapeos de tarjetas de la sesion
 * @param {number} numberOfRounds - Numero de rondas
 * @returns {Array} Plan de retos de asociacion
 */
function generateAssociationPlan(cardMappings, numberOfRounds) {
  const plan = [];

  for (let round = 1; round <= numberOfRounds; round++) {
    // Seleccion determinista: evitar repetir la tarjeta inmediatamente anterior
    let index;
    if (round <= cardMappings.length) {
      index = round - 1;
    } else {
      // Despues de agotar todas, ciclar evitando repeticion inmediata
      index = (round - 1) % cardMappings.length;
      if (plan.length > 0) {
        const prevCardId = plan[plan.length - 1].cardId.toString();
        if (cardMappings[index].cardId.toString() === prevCardId) {
          index = (index + 1) % cardMappings.length;
        }
      }
    }

    const mapping = cardMappings[index];
    plan.push({
      roundNumber: round,
      cardId: mapping.cardId,
      uid: mapping.uid,
      assignedValue: mapping.assignedValue,
      displayData: mapping.displayData
    });
  }

  return plan;
}

/**
 * Genera un boardLayout para sesiones de mecanica 'memory'.
 * Duplica las tarjetas (parejas) y las baraja de forma determinista.
 * @param {Array} cardMappings - Mapeos de tarjetas de la sesion
 * @param {number} numberOfCards - Numero de tarjetas unicas (las parejas son el doble)
 * @returns {Array} Layout del tablero
 */
function generateBoardLayout(cardMappings, numberOfCards) {
  // Para memoria, el tablero contiene cada tarjeta una vez con su posicion
  const layout = [];

  // Baraja determinista basada en indice (Fisher-Yates con seed fija)
  const indices = Array.from({ length: numberOfCards }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    // Intercambio determinista basado en posicion
    const j = (i * 7 + 3) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  for (let slot = 0; slot < numberOfCards; slot++) {
    const mappingIndex = indices[slot];
    const mapping = cardMappings[mappingIndex];
    layout.push({
      slotIndex: slot,
      cardId: mapping.cardId,
      uid: mapping.uid,
      assignedValue: mapping.assignedValue,
      displayData: mapping.displayData
    });
  }

  return layout;
}

/**
 * Configuracion de sesiones predefinidas.
 * Cada template define que tipo de sesion crear.
 * Incluye variedad de estados para datos mas realistas.
 */
const sessionTemplates = [
  {
    contextKey: 'geography-europe',
    mechanicName: 'association',
    config: {
      numberOfRounds: 6,
      timeLimit: 20,
      pointsPerCorrect: 10,
      penaltyPerError: -2
    },
    status: 'completed',
    description: 'Asociacion con paises de Europa',
    daysAgo: 10
  },
  {
    contextKey: 'animals-farm',
    mechanicName: 'association',
    config: {
      numberOfRounds: 6,
      timeLimit: 15,
      pointsPerCorrect: 10,
      penaltyPerError: -3
    },
    status: 'completed',
    description: 'Animales de granja - repaso',
    daysAgo: 8
  },
  {
    contextKey: 'colors-basic',
    mechanicName: 'association',
    config: {
      numberOfRounds: 6,
      timeLimit: 12,
      pointsPerCorrect: 10,
      penaltyPerError: -2
    },
    status: 'completed',
    description: 'Colores basicos - practica',
    daysAgo: 6
  },
  {
    contextKey: 'numbers-1-15',
    mechanicName: 'association',
    config: {
      numberOfRounds: 5,
      timeLimit: 25,
      pointsPerCorrect: 15,
      penaltyPerError: -5
    },
    // Sesion recien creada, aun sin iniciar
    status: 'created',
    description: 'Numeros del 1 al 6 - asociacion',
    daysAgo: 1
  },
  {
    contextKey: 'shapes-basic',
    mechanicName: 'memory',
    config: {
      numberOfRounds: 5,
      timeLimit: 20,
      pointsPerCorrect: 20,
      penaltyPerError: -3
    },
    status: 'completed',
    description: 'Memoria con formas basicas',
    daysAgo: 2
  }
];

/**
 * Genera sesiones para un profesor usando sus mazos.
 * @param {Object} teacher - Documento del profesor
 * @param {Array} teacherDecks - Mazos del profesor
 * @param {Array} mechanics - Mecanicas disponibles
 * @param {Array} contexts - Contextos disponibles
 * @returns {Array} Array de datos de sesiones
 */
function generateSessionsForTeacher(teacher, teacherDecks, mechanics, contexts) {
  const sessions = [];

  sessionTemplates.forEach(template => {
    const mechanic = findMechanic(mechanics, template.mechanicName);
    const deck = findDeckByContext(teacherDecks, contexts, template.contextKey);

    if (!mechanic) {
      logger.warn(`Mecanica '${template.mechanicName}' no encontrada, saltando sesion`);
      return;
    }

    if (!deck) {
      return;
    }

    const numberOfCards = deck.cardMappings.length;

    // Construir cardMappings copiados desde el mazo (como hace el controller real)
    const cardMappings = deck.cardMappings.map(mapping => ({
      cardId: mapping.cardId,
      uid: mapping.uid,
      assignedValue: mapping.assignedValue,
      displayData: mapping.displayData
    }));

    // Calcular timestamps segun el estado
    let startedAt = null;
    let endedAt = null;

    if (template.status === 'completed' && template.daysAgo) {
      const daysInMs = template.daysAgo * 24 * 60 * 60 * 1000;
      startedAt = new Date(Date.now() - daysInMs);
      endedAt = new Date(startedAt.getTime() + 30 * 60 * 1000);
    }

    const sessionData = {
      mechanicId: mechanic._id,
      deckId: deck._id,
      contextId: deck.contextId,
      config: {
        numberOfCards,
        numberOfRounds: template.config.numberOfRounds,
        timeLimit: template.config.timeLimit,
        pointsPerCorrect: template.config.pointsPerCorrect,
        penaltyPerError: template.config.penaltyPerError
      },
      cardMappings,
      status: template.status,
      // difficulty se calcula automaticamente por el pre-save hook del modelo
      createdBy: teacher._id,
      startedAt,
      endedAt
    };

    // Generar associationChallengePlan para mecanica 'association'
    if (template.mechanicName === 'association') {
      sessionData.associationChallengePlan = generateAssociationPlan(
        cardMappings,
        template.config.numberOfRounds
      );
      sessionData.requiresAssociationPlanConfiguration = false;
    }

    // Generar boardLayout para mecanica 'memory'
    if (template.mechanicName === 'memory') {
      sessionData.boardLayout = generateBoardLayout(cardMappings, numberOfCards);
    }

    sessions.push(sessionData);
  });

  return sessions;
}

/**
 * Ejecuta el seeder de sesiones.
 * @param {Object} users - Usuarios creados { teachers, students }
 * @param {Array} mechanics - Mecanicas creadas
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
    const sessions = await GameSession.create(allSessions);

    // Estadisticas por estado
    const byStatus = sessions.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});

    // Estadisticas por mecanica
    const byMechanic = {};
    sessions.forEach(s => {
      const hasAssocPlan = s.associationChallengePlan && s.associationChallengePlan.length > 0;
      const hasBoard = s.boardLayout && s.boardLayout.length > 0;
      if (hasAssocPlan) {
        byMechanic['association'] = (byMechanic['association'] || 0) + 1;
      }
      if (hasBoard) {
        byMechanic['memory'] = (byMechanic['memory'] || 0) + 1;
      }
    });

    logger.info('Sesiones de juego seeded exitosamente');
    logger.info(`- ${sessions.length} sesiones totales`);
    logger.info('- Por estado:');
    Object.entries(byStatus).forEach(([status, count]) => {
      logger.info(`  - ${count} sesiones "${status}"`);
    });
    if (Object.keys(byMechanic).length > 0) {
      logger.info('- Extras de mecanica:');
      Object.entries(byMechanic).forEach(([mechanic, count]) => {
        logger.info(
          `  - ${count} sesiones con ${mechanic === 'association' ? 'associationChallengePlan' : 'boardLayout'}`
        );
      });
    }

    return sessions;
  } catch (error) {
    logger.error('Error en seedSessions:', error);
    throw error;
  }
}

module.exports = seedSessions;
