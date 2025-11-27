/**
 * @fileoverview Seeder de sesiones de juego.
 * Crea 10 sesiones configuradas con diferentes mecánicas y contextos.
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
  return shuffled.slice(0, count);
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
      value: selectedAssets[index].value
    }
  }));
}

/**
 * Genera datos de sesiones de juego.
 * @param {Object} users - Objeto con teachers y students
 * @param {Array} mechanics - Mecánicas disponibles
 * @param {Array} contexts - Contextos disponibles
 * @param {Array} cards - Tarjetas disponibles
 * @returns {Array} Array de datos de sesiones
 */
function generateSessionsData(users, mechanics, contexts, cards) {
  const sessions = [];
  const difficulties = ['easy', 'medium', 'hard'];

  // Crear 2 sesiones por cada profesor (total: 10 sesiones)
  users.teachers.forEach((teacher, teacherIndex) => {
    for (let i = 0; i < 2; i++) {
      const mechanic = mechanics[Math.floor(Math.random() * mechanics.length)];
      const context = contexts[Math.floor(Math.random() * contexts.length)];
      const numberOfCards = Math.floor(Math.random() * 3) + 3; // 3-5 tarjetas
      const numberOfRounds = Math.floor(Math.random() * 5) + 3; // 3-7 rondas

      sessions.push({
        mechanicId: mechanic._id,
        contextId: context._id,
        config: {
          numberOfCards,
          numberOfRounds,
          timeLimit: 15,
          pointsPerCorrect: 10,
          penaltyPerError: -2
        },
        cardMappings: generateCardMappings(cards, context.assets, numberOfCards),
        difficulty: difficulties[i % difficulties.length],
        status: i === 0 ? 'active' : 'created',
        createdBy: teacher._id,
        startedAt: i === 0 ? new Date() : undefined
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

    logger.info('✅ Sesiones de juego seeded exitosamente');

    return sessions;
  } catch (error) {
    logger.error('❌ Error en seedSessions:', error);
    throw error;
  }
}

module.exports = seedSessions;
