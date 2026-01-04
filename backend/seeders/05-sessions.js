/**
 * @fileoverview Seeder de sesiones de juego.
 * Crea sesiones preconfiguradas para testing con diferentes estados.
 * @module seeders/05-sessions
 */

const GameSession = require('../src/models/GameSession');
const logger = require('../src/utils/logger');

/**
 * Selecciona N elementos aleatorios de un array.
 * @param {Array} array - Array fuente
 * @param {number} count - Número de elementos a seleccionar
 * @returns {Array} Elementos seleccionados
 */
function randomSample(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Genera cardMappings para una sesión.
 * @param {Array} cards - Tarjetas disponibles
 * @param {Array} contextAssets - Assets del contexto
 * @param {number} count - Número de mapeos a crear
 * @returns {Array} Array de cardMappings
 */
function generateCardMappings(cards, contextAssets, count) {
  const selectedCards = randomSample(cards, count);
  const selectedAssets = randomSample(contextAssets, count);

  return selectedCards.map((card, index) => ({
    cardId: card._id,
    uid: card.uid,
    assignedValue: selectedAssets[index].value,
    displayData: {
      key: selectedAssets[index].key,
      display: selectedAssets[index].display,
      value: selectedAssets[index].value,
      audioUrl: selectedAssets[index].audioUrl || null,
      imageUrl: selectedAssets[index].imageUrl || null
    }
  }));
}

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
 * Genera sesiones predefinidas con configuraciones variadas.
 * @param {Object} users - Usuarios creados
 * @param {Array} mechanics - Mecánicas creadas
 * @param {Array} contexts - Contextos creados
 * @param {Array} cards - Tarjetas creadas
 * @returns {Array} Array de datos de sesiones
 */
function generateSessionsData(users, mechanics, contexts, cards) {
  const sessions = [];
  const teachers = users.teachers;

  // =============================================
  // Sesiones predefinidas para cada profesor
  // =============================================

  teachers.forEach((teacher, teacherIndex) => {
    // --- SESIÓN 1: Asociación con Colores (ACTIVA) ---
    const associationMechanic = findMechanic(mechanics, 'association');
    const colorsContext = findContext(contexts, 'colors-basic');

    if (associationMechanic && colorsContext) {
      sessions.push({
        mechanicId: associationMechanic._id,
        contextId: colorsContext._id,
        config: {
          numberOfCards: 5,
          numberOfRounds: 5,
          timeLimit: 15,
          pointsPerCorrect: 10,
          penaltyPerError: -2
        },
        cardMappings: generateCardMappings(cards, colorsContext.assets, 5),
        difficulty: 'easy',
        status: 'active',
        createdBy: teacher._id,
        startedAt: new Date()
      });
    }

    // --- SESIÓN 2: Secuencia con Números (CREADA) ---
    const sequenceMechanic = findMechanic(mechanics, 'sequence');
    const numbersContext = findContext(contexts, 'numbers-1-10');

    if (sequenceMechanic && numbersContext) {
      sessions.push({
        mechanicId: sequenceMechanic._id,
        contextId: numbersContext._id,
        config: {
          numberOfCards: 5,
          numberOfRounds: 3,
          timeLimit: 30,
          pointsPerCorrect: 15,
          penaltyPerError: -5
        },
        cardMappings: generateCardMappings(cards, numbersContext.assets, 5),
        difficulty: 'easy',
        status: 'created',
        createdBy: teacher._id
      });
    }

    // --- SESIÓN 3: Asociación con Animales de Granja (ACTIVA) ---
    const farmContext = findContext(contexts, 'animals-farm');

    if (associationMechanic && farmContext) {
      sessions.push({
        mechanicId: associationMechanic._id,
        contextId: farmContext._id,
        config: {
          numberOfCards: 6,
          numberOfRounds: 6,
          timeLimit: 12,
          pointsPerCorrect: 10,
          penaltyPerError: -3
        },
        cardMappings: generateCardMappings(cards, farmContext.assets, 6),
        difficulty: 'medium',
        status: 'active',
        createdBy: teacher._id,
        startedAt: new Date()
      });
    }

    // --- SESIÓN 4: Memoria con Formas (CREADA) ---
    const memoryMechanic = findMechanic(mechanics, 'memory');
    const shapesContext = findContext(contexts, 'shapes');

    if (memoryMechanic && shapesContext) {
      sessions.push({
        mechanicId: memoryMechanic._id,
        contextId: shapesContext._id,
        config: {
          numberOfCards: 4,
          numberOfRounds: 5,
          timeLimit: 20,
          pointsPerCorrect: 20,
          penaltyPerError: -3
        },
        cardMappings: generateCardMappings(cards, shapesContext.assets, 4),
        difficulty: 'medium',
        status: 'created',
        createdBy: teacher._id
      });
    }

    // --- SESIÓN 5: Asociación con Frutas (COMPLETADA) ---
    const fruitsContext = findContext(contexts, 'fruits');

    if (associationMechanic && fruitsContext) {
      const startDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // Hace 2 días
      const endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // 30 min después

      sessions.push({
        mechanicId: associationMechanic._id,
        contextId: fruitsContext._id,
        config: {
          numberOfCards: 5,
          numberOfRounds: 5,
          timeLimit: 15,
          pointsPerCorrect: 10,
          penaltyPerError: -2
        },
        cardMappings: generateCardMappings(cards, fruitsContext.assets, 5),
        difficulty: 'easy',
        status: 'completed',
        createdBy: teacher._id,
        startedAt: startDate,
        endedAt: endDate
      });
    }

    // --- SESIÓN 6: Clasificación con Emociones (CREADA, dificultad HARD) ---
    const classificationMechanic = findMechanic(mechanics, 'classification');
    const emotionsContext = findContext(contexts, 'emotions');

    if (classificationMechanic && emotionsContext) {
      sessions.push({
        mechanicId: classificationMechanic._id,
        contextId: emotionsContext._id,
        config: {
          numberOfCards: 6,
          numberOfRounds: 5,
          timeLimit: 20,
          pointsPerCorrect: 10,
          penaltyPerError: -2
        },
        cardMappings: generateCardMappings(cards, emotionsContext.assets, 6),
        difficulty: 'hard',
        status: 'created',
        createdBy: teacher._id
      });
    }
  });

  return sessions;
}

/**
 * Ejecuta el seeder de sesiones.
 * @param {Object} users - Usuarios creados
 * @param {Array} mechanics - Mecánicas creadas
 * @param {Array} contexts - Contextos creados
 * @param {Array} cards - Tarjetas creadas
 * @returns {Promise<Array>} Array de sesiones creadas
 */
async function seedSessions(users, mechanics, contexts, cards) {
  try {
    const sessionsData = generateSessionsData(users, mechanics, contexts, cards);
    const sessions = await GameSession.insertMany(sessionsData);

    // Contar por estado
    const byStatus = sessions.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});

    logger.info('✅ Sesiones de juego seeded exitosamente');
    logger.info(`   - ${sessions.length} sesiones totales`);
    Object.entries(byStatus).forEach(([status, count]) => {
      logger.info(`   - ${count} sesiones en estado "${status}"`);
    });

    return sessions;
  } catch (error) {
    logger.error('❌ Error en seedSessions:', error);
    throw error;
  }
}

module.exports = seedSessions;
