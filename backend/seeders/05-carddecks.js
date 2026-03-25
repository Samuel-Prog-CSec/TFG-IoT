/**
 * @fileoverview Seeder de mazos de tarjetas (CardDeck).
 * Crea mazos preconfigurados que asocian tarjetas RFID con valores de contextos.
 * Los mazos se utilizan posteriormente para crear sesiones de juego.
 * @module seeders/05-carddecks
 */

const CardDeck = require('../src/models/CardDeck');
const logger = require('../src/utils/logger');

/**
 * Genera cardMappings para un mazo.
 * @param {Array} contextAssets - Assets del contexto
 * @param {number} count - Número de mapeos a crear
 * @param {number} baseOffset - Offset base para generar UIDs sintéticos
 * @returns {Array} Array de cardMappings
 */
function generateCardMappings(contextAssets, count, baseOffset) {
  const selectedAssets = contextAssets.slice(0, count);

  return selectedAssets.map((asset, index) => ({
    uid: (baseOffset + index).toString(16).toUpperCase().padStart(8, '0'),
    assignedValue: asset.value,
    displayData: {
      key: asset.key,
      display: asset.display,
      value: asset.value,
      audioUrl: asset.audioUrl || null,
      imageUrl: asset.imageUrl || null,
      thumbnailUrl: asset.thumbnailUrl || null
    }
  }));
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
 * Configuración de mazos predefinidos.
 * Cada profesor tendrá mazos similares pero con tarjetas diferentes.
 */
const deckTemplates = [
  {
    name: 'Banderas de Europa',
    description: 'Mazo para aprender paises de Europa',
    contextKey: 'geography-europe',
    cardCount: 6
  },
  {
    name: 'Animales de Granja',
    description: 'Mazo con animales domésticos de granja',
    contextKey: 'animals-farm',
    cardCount: 6
  },
  {
    name: 'Colores Basicos',
    description: 'Mazo para aprender colores basicos',
    contextKey: 'colors-basic',
    cardCount: 6
  },
  {
    name: 'Numeros del 1 al 6',
    description: 'Mazo para practicar numeros del 1 al 6',
    contextKey: 'numbers-1-15',
    cardCount: 6
  },
  {
    name: 'Formas Basicas',
    description: 'Mazo para aprender formas basicas',
    contextKey: 'shapes-basic',
    cardCount: 6
  }
];

/**
 * Genera mazos para un profesor específico.
 * @param {Object} teacher - Documento del profesor
 * @param {Array} contexts - Contextos disponibles
 * @param {number} teacherIndex - Índice del profesor (para variar los UIDs)
 * @returns {Array} Array de datos de mazos
 */
function generateDecksForTeacher(teacher, contexts, teacherIndex) {
  const decks = [];
  const cardsPerDeck = 6;
  const decksPerTeacher = deckTemplates.length;
  const cardsPerTeacher = decksPerTeacher * cardsPerDeck;
  const uidBaseOffset = teacherIndex * cardsPerTeacher;

  deckTemplates.forEach((template, templateIndex) => {
    const context = findContext(contexts, template.contextKey);

    if (!context) {
      logger.warn(
        `Contexto '${template.contextKey}' no encontrado, saltando mazo '${template.name}'`
      );
      return;
    }

    if (context.assets.length < template.cardCount) {
      logger.warn(
        `Contexto '${template.contextKey}' tiene ${context.assets.length} assets, pero el mazo necesita ${template.cardCount}.`
      );
      return;
    }

    const baseOffset = uidBaseOffset + templateIndex * cardsPerDeck;
    const cardMappings = generateCardMappings(context.assets, template.cardCount, baseOffset);

    decks.push({
      name: template.name,
      description: template.description,
      contextId: context._id,
      cardMappings,
      status: 'active',
      createdBy: teacher._id
    });
  });

  return decks;
}

/**
 * Ejecuta el seeder de mazos de tarjetas.
 * @param {Object} users - Usuarios creados { teachers, students }
 * @param {Array} contexts - Contextos creados
 * @returns {Promise<Array>} Array de mazos creados
 */
async function seedCardDecks(users, contexts) {
  try {
    const { teachers } = users;
    const allDecks = [];

    // Generar mazos para cada profesor
    for (const [index, teacher] of teachers.entries()) {
      const teacherDecks = generateDecksForTeacher(teacher, contexts, index);
      allDecks.push(...teacherDecks);
    }

    // Insertar todos los mazos
    const createdDecks = await CardDeck.create(allDecks);

    // Estadísticas
    const decksByTeacher = {};
    createdDecks.forEach(deck => {
      const teacherId = deck.createdBy.toString();
      decksByTeacher[teacherId] = (decksByTeacher[teacherId] || 0) + 1;
    });

    logger.info('Mazos de tarjetas seeded exitosamente');
    logger.info(`- ${createdDecks.length} mazos totales`);

    const teacher = teachers.find(t => t._id.toString() === Object.keys(decksByTeacher)[0]);
    if (teacher) {
      logger.info(`- ${decksByTeacher[teacher._id.toString()]} mazos por profesor`);
    }

    return createdDecks;
  } catch (error) {
    logger.error('Error en seedCardDecks:', error);
    throw error;
  }
}

module.exports = seedCardDecks;
