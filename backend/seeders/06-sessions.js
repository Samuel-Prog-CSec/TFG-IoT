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
 * Opcionalmente filtra por nombre del mazo cuando hay varios mazos con el mismo contexto.
 * @param {Array} teacherDecks - Mazos del profesor
 * @param {Array} contexts - Contextos disponibles
 * @param {string} contextKey - Key del contexto (ej: 'colors-basic')
 * @param {string} [deckName] - Nombre del mazo para desambiguar
 * @returns {Object|undefined} Mazo encontrado
 */
function findDeckByContext(teacherDecks, contexts, contextKey, deckName) {
  const context = findContext(contexts, contextKey);
  if (!context) {
    return undefined;
  }
  const candidates = teacherDecks.filter(d => d.contextId.toString() === context._id.toString());
  if (deckName) {
    return candidates.find(d => d.name === deckName) || candidates[0];
  }
  return candidates[0];
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
        const prevUid = plan[plan.length - 1].uid;
        if (cardMappings[index].uid === prevUid) {
          index = (index + 1) % cardMappings.length;
        }
      }
    }

    const mapping = cardMappings[index];
    plan.push({
      roundNumber: round,
      uid: mapping.uid,
      assignedValue: mapping.assignedValue,
      displayData: mapping.displayData
    });
  }

  return plan;
}

/**
 * Genera un boardLayout para sesiones de mecanica 'memory'.
 * Usa todos los cardMappings del mazo (que ya contienen 2N tarjetas con parejas)
 * y los baraja de forma determinista. Cada tarjeta ocupa su propio slot con UID unico.
 * @param {Array} cardMappings - Mapeos de tarjetas de la sesion (ya con parejas, 2N)
 * @returns {Array} Layout del tablero
 */
function generateBoardLayout(cardMappings) {
  const totalCards = cardMappings.length;
  const layout = [];

  // Baraja determinista basada en indice (Fisher-Yates con seed fija)
  const indices = Array.from({ length: totalCards }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    // Intercambio determinista basado en posicion
    const j = (i * 7 + 3) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  for (let slot = 0; slot < totalCards; slot++) {
    const mappingIndex = indices[slot];
    const mapping = cardMappings[mappingIndex];
    layout.push({
      slotIndex: slot,
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
/**
 * Templates de sesiones distribuidas en 60 días para alimentar analytics avanzados.
 * Incluye variedad temporal, mecánicas y estados (completed, created).
 * El seeder de gameplays (07) generará partidas para las sesiones completed.
 *
 * Criterios BI:
 * - Suficientes sesiones para trends de 7d, 30d y 90d
 * - Múltiples contextos y mecánicas para content-effectiveness
 * - Distribución temporal para heatmaps y trayectorias
 * - Sesiones recientes y antiguas para detección de tendencias
 */
const sessionTemplates = [
  // ─── Semana 8-9 (hace ~56-60 días) — inicio del periodo ───
  {
    contextKey: 'geography-europe',
    mechanicName: 'association',
    config: { numberOfRounds: 6, timeLimit: 20, pointsPerCorrect: 10, penaltyPerError: -2 },
    status: 'completed',
    description: 'Geografía Europa - sesión inicial',
    daysAgo: 58
  },
  {
    contextKey: 'colors-basic',
    mechanicName: 'association',
    config: { numberOfRounds: 5, timeLimit: 12, pointsPerCorrect: 10, penaltyPerError: -2 },
    status: 'completed',
    description: 'Colores básicos - primera sesión',
    daysAgo: 55
  },
  // ─── Semana 6-7 (hace ~42-49 días) ───
  {
    contextKey: 'animals-farm',
    mechanicName: 'association',
    config: { numberOfRounds: 6, timeLimit: 15, pointsPerCorrect: 10, penaltyPerError: -3 },
    status: 'completed',
    description: 'Animales de granja - introducción',
    daysAgo: 47
  },
  {
    contextKey: 'geography-europe',
    mechanicName: 'association',
    config: { numberOfRounds: 6, timeLimit: 20, pointsPerCorrect: 10, penaltyPerError: -2 },
    status: 'completed',
    description: 'Geografía Europa - repaso 1',
    daysAgo: 42
  },
  // ─── Semana 4-5 (hace ~28-35 días) ───
  {
    contextKey: 'numbers-1-6',
    mechanicName: 'association',
    config: { numberOfRounds: 5, timeLimit: 25, pointsPerCorrect: 15, penaltyPerError: -5 },
    status: 'completed',
    description: 'Números 1-6 - primera sesión',
    daysAgo: 33
  },
  {
    contextKey: 'colors-basic',
    mechanicName: 'association',
    config: { numberOfRounds: 6, timeLimit: 12, pointsPerCorrect: 10, penaltyPerError: -2 },
    status: 'completed',
    description: 'Colores básicos - repaso',
    daysAgo: 28
  },
  {
    contextKey: 'shapes-basic',
    deckName: 'Formas Memoria',
    mechanicName: 'memory',
    config: { numberOfRounds: 5, timeLimit: 20, pointsPerCorrect: 15, penaltyPerError: -3 },
    status: 'completed',
    description: 'Memoria con formas - introducción',
    daysAgo: 26
  },
  // ─── Semana 3 (hace ~18-22 días) ───
  {
    contextKey: 'animals-farm',
    mechanicName: 'association',
    config: { numberOfRounds: 6, timeLimit: 15, pointsPerCorrect: 10, penaltyPerError: -3 },
    status: 'completed',
    description: 'Animales de granja - repaso',
    daysAgo: 21
  },
  {
    contextKey: 'geography-europe',
    mechanicName: 'association',
    config: { numberOfRounds: 6, timeLimit: 18, pointsPerCorrect: 10, penaltyPerError: -3 },
    status: 'completed',
    description: 'Geografía Europa - repaso 2',
    daysAgo: 18
  },
  // ─── Semana 2 (hace ~10-14 días) ───
  {
    contextKey: 'numbers-1-6',
    mechanicName: 'association',
    config: { numberOfRounds: 6, timeLimit: 20, pointsPerCorrect: 15, penaltyPerError: -5 },
    status: 'completed',
    description: 'Números 1-6 - repaso',
    daysAgo: 12
  },
  {
    contextKey: 'shapes-basic',
    deckName: 'Formas Memoria',
    mechanicName: 'memory',
    config: { numberOfRounds: 6, timeLimit: 18, pointsPerCorrect: 15, penaltyPerError: -3 },
    status: 'completed',
    description: 'Memoria con formas - repaso',
    daysAgo: 10
  },
  {
    contextKey: 'colors-basic',
    mechanicName: 'association',
    config: { numberOfRounds: 6, timeLimit: 12, pointsPerCorrect: 10, penaltyPerError: -2 },
    status: 'completed',
    description: 'Colores - práctica avanzada',
    daysAgo: 8
  },
  // ─── Semana 1 (hace ~3-6 días) — más reciente ───
  {
    contextKey: 'animals-farm',
    mechanicName: 'association',
    config: { numberOfRounds: 6, timeLimit: 15, pointsPerCorrect: 10, penaltyPerError: -3 },
    status: 'completed',
    description: 'Animales de granja - evaluación',
    daysAgo: 5
  },
  {
    contextKey: 'geography-europe',
    mechanicName: 'association',
    config: { numberOfRounds: 6, timeLimit: 18, pointsPerCorrect: 10, penaltyPerError: -3 },
    status: 'completed',
    description: 'Geografía Europa - evaluación final',
    daysAgo: 3
  },
  // ─── Sesiones pendientes (para testing de estados) ───
  {
    contextKey: 'numbers-1-6',
    mechanicName: 'association',
    config: { numberOfRounds: 5, timeLimit: 25, pointsPerCorrect: 15, penaltyPerError: -5 },
    status: 'created',
    description: 'Números 1-6 - sesión programada',
    daysAgo: 0
  },
  // ─── Mecánica Secuencia (T-921/T-922/T-923) ───
  // Cubre las 3 dificultades + estados completed/created en distintos
  // contextos para alimentar analytics (heatmap, trends, rankings).
  {
    contextKey: 'animals-farm',
    mechanicName: 'sequence',
    difficulty: 'easy',
    config: { numberOfRounds: 4, timeLimit: 30, pointsPerCorrect: 15, penaltyPerError: -3 },
    sequenceConfig: { minSequenceLength: 3, maxSequenceLength: 4, displaySeconds: 4 },
    status: 'completed',
    description: 'Secuencia animales - introducción',
    daysAgo: 30
  },
  {
    contextKey: 'colors-basic',
    mechanicName: 'sequence',
    difficulty: 'medium',
    config: { numberOfRounds: 5, timeLimit: 30, pointsPerCorrect: 15, penaltyPerError: -3 },
    sequenceConfig: { minSequenceLength: 3, maxSequenceLength: 5, displaySeconds: 3 },
    status: 'completed',
    description: 'Secuencia colores - intermedio',
    daysAgo: 14
  },
  {
    contextKey: 'numbers-1-6',
    mechanicName: 'sequence',
    difficulty: 'hard',
    config: { numberOfRounds: 5, timeLimit: 25, pointsPerCorrect: 15, penaltyPerError: -4 },
    sequenceConfig: { minSequenceLength: 4, maxSequenceLength: 6, displaySeconds: 2 },
    status: 'completed',
    description: 'Secuencia números - desafío',
    daysAgo: 7
  },
  {
    contextKey: 'geography-europe',
    mechanicName: 'sequence',
    difficulty: 'medium',
    config: { numberOfRounds: 6, timeLimit: 35, pointsPerCorrect: 15, penaltyPerError: -3 },
    sequenceConfig: { minSequenceLength: 3, maxSequenceLength: 5, displaySeconds: 3 },
    status: 'completed',
    description: 'Secuencia geografía - práctica',
    daysAgo: 2
  },
  {
    contextKey: 'colors-basic',
    mechanicName: 'sequence',
    difficulty: 'easy',
    config: { numberOfRounds: 4, timeLimit: 30, pointsPerCorrect: 15, penaltyPerError: -2 },
    sequenceConfig: { minSequenceLength: 3, maxSequenceLength: 4, displaySeconds: 4 },
    status: 'created',
    description: 'Secuencia colores - próxima sesión',
    daysAgo: 0
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
    const deck = findDeckByContext(teacherDecks, contexts, template.contextKey, template.deckName);

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
      name: template.description,
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
      // difficulty se calcula automaticamente por el pre-save hook del modelo,
      // pero permitimos override explícito en templates (Secuencia define easy/medium/hard).
      ...(template.difficulty ? { difficulty: template.difficulty } : {}),
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
      sessionData.boardLayout = generateBoardLayout(cardMappings);
    }

    // Generar sequencePlan + sequenceConfig para mecanica 'sequence'
    if (template.mechanicName === 'sequence') {
      const { generateSequencePlan } = require('../src/services/sequencePlanGenerator');
      const cfg = template.sequenceConfig || {
        minSequenceLength: 3,
        maxSequenceLength: 5,
        displaySeconds: 3
      };
      sessionData.sequenceConfig = cfg;
      sessionData.sequencePlan = generateSequencePlan(cardMappings, {
        numberOfRounds: template.config.numberOfRounds,
        minLength: cfg.minSequenceLength,
        maxLength: cfg.maxSequenceLength,
        seed: 1234 + template.daysAgo // determinista por template
      });
    }

    sessions.push(sessionData);
  });

  return sessions;
}

/**
 * Ejecuta el seeder de sesiones.
 * Idempotente: si ya existen sesiones, las devuelve sin recrearlas.
 *
 * @param {Object} users - Usuarios creados { teachers, students }
 * @param {Array} mechanics - Mecanicas creadas
 * @param {Array} contexts - Contextos creados
 * @param {Array} decks - Mazos creados
 * @returns {Promise<Array>} Array de sesiones creadas o preexistentes
 */
async function seedSessions(users, mechanics, contexts, decks) {
  try {
    const existing = await GameSession.find({});
    if (existing.length > 0) {
      logger.info(`Sesiones ya existen (${existing.length}), omitiendo creacion`);
      return existing;
    }

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
