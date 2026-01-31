/**
 * @fileoverview Seeder de mazos de tarjetas (CardDeck).
 * Crea mazos preconfigurados que asocian tarjetas RFID con valores de contextos.
 * Los mazos se utilizan posteriormente para crear sesiones de juego.
 * @module seeders/05-carddecks
 */

const CardDeck = require('../src/models/CardDeck');
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
 * Genera cardMappings para un mazo.
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
  // =============================================
  // MAZOS DE GEOGRAFÍA
  // =============================================
  {
    name: 'Banderas de Europa',
    description: 'Mazo para aprender las banderas de países europeos',
    contextKey: 'geography-europe',
    cardCount: 6
  },
  {
    name: 'Capitales Europeas',
    description: 'Relaciona cada país con su capital',
    contextKey: 'geography-europe',
    cardCount: 5
  },

  // =============================================
  // MAZOS DE ANIMALES
  // =============================================
  {
    name: 'Animales de la Granja',
    description: 'Mazo con animales domésticos de granja',
    contextKey: 'animals-farm',
    cardCount: 8
  },
  {
    name: 'Safari Salvaje',
    description: 'Animales salvajes de la selva y sabana',
    contextKey: 'animals-wild',
    cardCount: 7
  },
  {
    name: 'Mundo Marino',
    description: 'Criaturas del océano y el mar',
    contextKey: 'animals-sea',
    cardCount: 6
  },

  // =============================================
  // MAZOS EDUCATIVOS BÁSICOS
  // =============================================
  {
    name: 'Colores del Arcoíris',
    description: 'Aprende los colores básicos de forma divertida',
    contextKey: 'colors-basic',
    cardCount: 6
  },
  {
    name: 'Números Mágicos',
    description: 'Mazo para aprender los números del 1 al 10',
    contextKey: 'numbers-1-10',
    cardCount: 5
  },
  {
    name: 'Las Vocales',
    description: 'Mazo para aprender las vocales A, E, I, O, U',
    contextKey: 'alphabet-vowels',
    cardCount: 5
  },
  {
    name: 'Primeras Letras',
    description: 'Introducción al abecedario',
    contextKey: 'alphabet-basic',
    cardCount: 6
  },

  // =============================================
  // MAZOS DE FRUTAS Y VERDURAS
  // =============================================
  {
    name: 'Frutas Tropicales',
    description: 'Descubre las frutas más deliciosas',
    contextKey: 'fruits',
    cardCount: 7
  },
  {
    name: 'Verduras del Huerto',
    description: 'Aprende sobre las verduras saludables',
    contextKey: 'vegetables',
    cardCount: 6
  },

  // =============================================
  // MAZOS DE FORMAS Y CONCEPTOS
  // =============================================
  {
    name: 'Formas Geométricas',
    description: 'Círculos, cuadrados, triángulos y más',
    contextKey: 'shapes',
    cardCount: 6
  },
  {
    name: 'Días de la Semana',
    description: 'Aprende el orden de los días',
    contextKey: 'weekdays',
    cardCount: 7
  },
  {
    name: 'Las Estaciones',
    description: 'Primavera, Verano, Otoño e Invierno',
    contextKey: 'seasons',
    cardCount: 4
  },

  // =============================================
  // MAZOS DE TRANSPORTES Y EMOCIONES
  // =============================================
  {
    name: 'Medios de Transporte',
    description: 'Coches, aviones, barcos y más',
    contextKey: 'transport',
    cardCount: 8
  },
  {
    name: 'Mis Emociones',
    description: 'Aprende a identificar las emociones',
    contextKey: 'emotions',
    cardCount: 6
  }
];

/**
 * Genera mazos para un profesor específico.
 * @param {Object} teacher - Documento del profesor
 * @param {Array} contexts - Contextos disponibles
 * @param {Array} cards - Tarjetas disponibles
 * @param {number} teacherIndex - Índice del profesor (para variar las tarjetas)
 * @returns {Array} Array de datos de mazos
 */
function generateDecksForTeacher(teacher, contexts, cards, teacherIndex) {
  const decks = [];

  // Offset de tarjetas para que cada profesor use tarjetas diferentes
  const cardOffset = teacherIndex * 15;

  deckTemplates.forEach((template, templateIndex) => {
    const context = findContext(contexts, template.contextKey);

    if (!context) {
      logger.warn(
        `Contexto '${template.contextKey}' no encontrado, saltando mazo '${template.name}'`
      );
      return;
    }

    // Verificar que hay suficientes assets en el contexto
    if (context.assets.length < template.cardCount) {
      logger.warn(
        `Contexto '${template.contextKey}' tiene ${context.assets.length} assets, pero el mazo necesita ${template.cardCount}. Ajustando.`
      );
      template.cardCount = Math.min(template.cardCount, context.assets.length);
    }

    // Seleccionar tarjetas con offset para variedad entre profesores
    const startCardIndex =
      (cardOffset + templateIndex * 8) % Math.max(1, cards.length - template.cardCount);
    const availableCards = cards.slice(startCardIndex);

    if (availableCards.length < template.cardCount) {
      logger.warn(
        `No hay suficientes tarjetas para el mazo '${template.name}' del profesor ${teacher.name}`
      );
      return;
    }

    const cardMappings = generateCardMappings(availableCards, context.assets, template.cardCount);

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
 * @param {Array} cards - Tarjetas creadas
 * @returns {Promise<Array>} Array de mazos creados
 */
async function seedCardDecks(users, contexts, cards) {
  try {
    const { teachers } = users;
    const allDecks = [];

    // Generar mazos para cada profesor
    for (const [index, teacher] of teachers.entries()) {
      const teacherDecks = generateDecksForTeacher(teacher, contexts, cards, index);
      allDecks.push(...teacherDecks);
    }

    // Insertar todos los mazos
    const createdDecks = await CardDeck.insertMany(allDecks);

    // Estadísticas
    const decksByTeacher = {};
    createdDecks.forEach(deck => {
      const teacherId = deck.createdBy.toString();
      decksByTeacher[teacherId] = (decksByTeacher[teacherId] || 0) + 1;
    });

    logger.info('✅ Mazos de tarjetas seeded exitosamente');
    logger.info(`   - ${createdDecks.length} mazos totales`);

    const teacher = teachers.find(t => t._id.toString() === Object.keys(decksByTeacher)[0]);
    if (teacher) {
      logger.info(`   - ${decksByTeacher[teacher._id.toString()]} mazos por profesor (aprox.)`);
    }

    return createdDecks;
  } catch (error) {
    logger.error('❌ Error en seedCardDecks:', error);
    throw error;
  }
}

module.exports = seedCardDecks;
