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
      thumbnailUrl: asset.thumbnailUrl || null,
      dominantColor: asset.dominantColor || null
    }
  }));
}

/**
 * Genera cardMappings para un mazo de memoria con parejas.
 * Cada asset produce 2 tarjetas con UIDs distintos pero mismo assignedValue y displayData,
 * resultando en 2N tarjetas para N assets.
 *
 * Esquema de offsets: para N assets se ocupa el rango [baseOffset, baseOffset+2N).
 * La primera copia toma `baseOffset+i` y la segunda `baseOffset+N+i`, de forma que
 * los UIDs son únicos dentro del mazo (requisito del modelo CardDeck) y además
 * `currentOffset` en el caller puede avanzar +2N para el siguiente mazo sin
 * colisionar.
 *
 * @param {Array} contextAssets - Assets del contexto
 * @param {number} count - Número de assets (parejas) a usar
 * @param {number} baseOffset - Offset base para generar UIDs sintéticos
 * @returns {Array} Array de cardMappings (2 * count elementos)
 */
function generateMemoryCardMappings(contextAssets, count, baseOffset) {
  const selectedAssets = contextAssets.slice(0, count);
  const mappings = [];

  selectedAssets.forEach((asset, index) => {
    const displayData = {
      key: asset.key,
      display: asset.display,
      value: asset.value,
      audioUrl: asset.audioUrl || null,
      imageUrl: asset.imageUrl || null,
      thumbnailUrl: asset.thumbnailUrl || null,
      dominantColor: asset.dominantColor || null
    };

    // Primera copia: offset normal
    mappings.push({
      uid: (baseOffset + index).toString(16).toUpperCase().padStart(8, '0'),
      assignedValue: asset.value,
      displayData
    });

    // Segunda copia: desplazada por `count` para garantizar unicidad de UID
    mappings.push({
      uid: (baseOffset + count + index).toString(16).toUpperCase().padStart(8, '0'),
      assignedValue: asset.value,
      displayData
    });
  });

  return mappings;
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
    description: 'Mazo para aprender países de Europa',
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
    name: 'Colores Básicos',
    description: 'Mazo para aprender colores básicos',
    contextKey: 'colors-basic',
    cardCount: 6
  },
  {
    name: 'Números del 1 al 6',
    description: 'Mazo para practicar números del 1 al 6',
    contextKey: 'numbers-1-6',
    cardCount: 6
  },
  {
    name: 'Formas Básicas',
    description: 'Mazo para aprender formas básicas',
    contextKey: 'shapes-basic',
    cardCount: 6
  },
  {
    name: 'Formas Memoria',
    description: 'Mazo con parejas de formas para juegos de memoria',
    contextKey: 'shapes-basic',
    cardCount: 6,
    memoryPairs: true
  }
];

/**
 * Calcula el numero total de tarjetas que genera un profesor,
 * considerando que los mazos de memoria producen 2x tarjetas.
 * @returns {number} Total de tarjetas por profesor
 */
function calculateCardsPerTeacher() {
  return deckTemplates.reduce((total, t) => {
    const multiplier = t.memoryPairs ? 2 : 1;
    return total + t.cardCount * multiplier;
  }, 0);
}

/**
 * Genera mazos para un profesor específico.
 * @param {Object} teacher - Documento del profesor
 * @param {Array} contexts - Contextos disponibles
 * @param {number} teacherIndex - Índice del profesor (para variar los UIDs)
 * @returns {Array} Array de datos de mazos
 */
function generateDecksForTeacher(teacher, contexts, teacherIndex) {
  const decks = [];
  const cardsPerTeacher = calculateCardsPerTeacher();
  const uidBaseOffset = teacherIndex * cardsPerTeacher;

  // Acumular offset real por mazo para evitar colisiones de UIDs
  let currentOffset = 0;

  deckTemplates.forEach(template => {
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

    const baseOffset = uidBaseOffset + currentOffset;

    let cardMappings;
    if (template.memoryPairs) {
      cardMappings = generateMemoryCardMappings(context.assets, template.cardCount, baseOffset);
      currentOffset += template.cardCount * 2;
    } else {
      cardMappings = generateCardMappings(context.assets, template.cardCount, baseOffset);
      currentOffset += template.cardCount;
    }

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
 * Idempotente: si ya existen mazos, los devuelve sin recrearlos (evita
 * duplicados y posibles violaciones del indice unique {createdBy, name}).
 *
 * @param {Object} users - Usuarios creados { teachers, students }
 * @param {Array} contexts - Contextos creados
 * @returns {Promise<Array>} Array de mazos creados o preexistentes
 */
async function seedCardDecks(users, contexts) {
  try {
    const existing = await CardDeck.find({});
    if (existing.length > 0) {
      logger.info(`Mazos ya existen (${existing.length}), omitiendo creacion`);
      return existing;
    }

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
