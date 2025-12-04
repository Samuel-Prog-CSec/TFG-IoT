/**
 * @fileoverview Seeder de contextos de juego.
 * Crea contextos temáticos educativos adaptados para niños de 4-6 años.
 * @module seeders/04-contexts
 */

const GameContext = require('../src/models/GameContext');
const logger = require('../src/utils/logger');

/**
 * Contextos de juego con assets educativos.
 *
 * Cada contexto está diseñado para ser:
 * - Educativo y apropiado para niños de 4-6 años
 * - Visualmente atractivo con emojis
 * - Compatible con todas las mecánicas
 */
const contextsData = [
  // =============================================
  // GEOGRAFÍA
  // =============================================
  {
    contextId: 'geography-europe',
    name: 'Países de Europa',
    isActive: true,
    assets: [
      { key: 'spain', display: '🇪🇸', value: 'España' },
      { key: 'france', display: '🇫🇷', value: 'Francia' },
      { key: 'italy', display: '🇮🇹', value: 'Italia' },
      { key: 'germany', display: '🇩🇪', value: 'Alemania' },
      { key: 'uk', display: '🇬🇧', value: 'Reino Unido' },
      { key: 'portugal', display: '🇵🇹', value: 'Portugal' },
      { key: 'greece', display: '🇬🇷', value: 'Grecia' },
      { key: 'netherlands', display: '🇳🇱', value: 'Países Bajos' },
      { key: 'belgium', display: '🇧🇪', value: 'Bélgica' },
      { key: 'switzerland', display: '🇨🇭', value: 'Suiza' }
    ]
  },

  // =============================================
  // ANIMALES
  // =============================================
  {
    contextId: 'animals-farm',
    name: 'Animales de Granja',
    isActive: true,
    assets: [
      { key: 'cow', display: '🐄', value: 'Vaca' },
      { key: 'pig', display: '🐷', value: 'Cerdo' },
      { key: 'chicken', display: '🐔', value: 'Gallina' },
      { key: 'sheep', display: '🐑', value: 'Oveja' },
      { key: 'horse', display: '🐴', value: 'Caballo' },
      { key: 'duck', display: '🦆', value: 'Pato' },
      { key: 'goat', display: '🐐', value: 'Cabra' },
      { key: 'rooster', display: '🐓', value: 'Gallo' },
      { key: 'rabbit', display: '🐰', value: 'Conejo' },
      { key: 'donkey', display: '🫏', value: 'Burro' }
    ]
  },
  {
    contextId: 'animals-wild',
    name: 'Animales Salvajes',
    isActive: true,
    assets: [
      { key: 'lion', display: '🦁', value: 'León' },
      { key: 'elephant', display: '🐘', value: 'Elefante' },
      { key: 'giraffe', display: '🦒', value: 'Jirafa' },
      { key: 'monkey', display: '🐵', value: 'Mono' },
      { key: 'tiger', display: '🐯', value: 'Tigre' },
      { key: 'zebra', display: '🦓', value: 'Cebra' },
      { key: 'hippo', display: '🦛', value: 'Hipopótamo' },
      { key: 'rhino', display: '🦏', value: 'Rinoceronte' },
      { key: 'bear', display: '🐻', value: 'Oso' },
      { key: 'crocodile', display: '🐊', value: 'Cocodrilo' }
    ]
  },
  {
    contextId: 'animals-sea',
    name: 'Animales Marinos',
    isActive: true,
    assets: [
      { key: 'fish', display: '🐟', value: 'Pez' },
      { key: 'dolphin', display: '🐬', value: 'Delfín' },
      { key: 'whale', display: '🐳', value: 'Ballena' },
      { key: 'octopus', display: '🐙', value: 'Pulpo' },
      { key: 'shark', display: '🦈', value: 'Tiburón' },
      { key: 'turtle', display: '🐢', value: 'Tortuga' },
      { key: 'crab', display: '🦀', value: 'Cangrejo' },
      { key: 'starfish', display: '⭐', value: 'Estrella de Mar' },
      { key: 'jellyfish', display: '🪼', value: 'Medusa' },
      { key: 'seahorse', display: '🐴', value: 'Caballito de Mar' }
    ]
  },

  // =============================================
  // COLORES
  // =============================================
  {
    contextId: 'colors-basic',
    name: 'Colores Básicos',
    isActive: true,
    assets: [
      { key: 'red', display: '🔴', value: 'Rojo' },
      { key: 'blue', display: '🔵', value: 'Azul' },
      { key: 'green', display: '🟢', value: 'Verde' },
      { key: 'yellow', display: '🟡', value: 'Amarillo' },
      { key: 'orange', display: '🟠', value: 'Naranja' },
      { key: 'purple', display: '🟣', value: 'Morado' },
      { key: 'pink', display: '🩷', value: 'Rosa' },
      { key: 'brown', display: '🟤', value: 'Marrón' },
      { key: 'black', display: '⚫', value: 'Negro' },
      { key: 'white', display: '⚪', value: 'Blanco' }
    ]
  },

  // =============================================
  // NÚMEROS
  // =============================================
  {
    contextId: 'numbers-1-10',
    name: 'Números del 1 al 10',
    isActive: true,
    assets: [
      { key: 'one', display: '1️⃣', value: 'Uno' },
      { key: 'two', display: '2️⃣', value: 'Dos' },
      { key: 'three', display: '3️⃣', value: 'Tres' },
      { key: 'four', display: '4️⃣', value: 'Cuatro' },
      { key: 'five', display: '5️⃣', value: 'Cinco' },
      { key: 'six', display: '6️⃣', value: 'Seis' },
      { key: 'seven', display: '7️⃣', value: 'Siete' },
      { key: 'eight', display: '8️⃣', value: 'Ocho' },
      { key: 'nine', display: '9️⃣', value: 'Nueve' },
      { key: 'ten', display: '🔟', value: 'Diez' }
    ]
  },

  // =============================================
  // LETRAS Y ABECEDARIO
  // =============================================
  {
    contextId: 'alphabet-vowels',
    name: 'Las Vocales',
    isActive: true,
    assets: [
      { key: 'a', display: '🅰️', value: 'A' },
      { key: 'e', display: '📧', value: 'E' },
      { key: 'i', display: 'ℹ️', value: 'I' },
      { key: 'o', display: '⭕', value: 'O' },
      { key: 'u', display: '⛎', value: 'U' }
    ]
  },
  {
    contextId: 'alphabet-basic',
    name: 'Primeras Letras',
    isActive: true,
    assets: [
      { key: 'a', display: '🅰️', value: 'A - Abeja' },
      { key: 'b', display: '🅱️', value: 'B - Barco' },
      { key: 'c', display: '©️', value: 'C - Casa' },
      { key: 'd', display: '🇩', value: 'D - Dado' },
      { key: 'e', display: '📧', value: 'E - Elefante' },
      { key: 'f', display: '🇫', value: 'F - Foca' },
      { key: 'g', display: '🇬', value: 'G - Gato' },
      { key: 'h', display: '🇭', value: 'H - Huevo' }
    ]
  },

  // =============================================
  // FRUTAS Y ALIMENTOS
  // =============================================
  {
    contextId: 'fruits',
    name: 'Frutas',
    isActive: true,
    assets: [
      { key: 'apple', display: '🍎', value: 'Manzana' },
      { key: 'banana', display: '🍌', value: 'Plátano' },
      { key: 'orange', display: '🍊', value: 'Naranja' },
      { key: 'grape', display: '🍇', value: 'Uvas' },
      { key: 'strawberry', display: '🍓', value: 'Fresa' },
      { key: 'watermelon', display: '🍉', value: 'Sandía' },
      { key: 'pineapple', display: '🍍', value: 'Piña' },
      { key: 'cherry', display: '🍒', value: 'Cereza' },
      { key: 'peach', display: '🍑', value: 'Melocotón' },
      { key: 'pear', display: '🍐', value: 'Pera' }
    ]
  },
  {
    contextId: 'vegetables',
    name: 'Verduras',
    isActive: true,
    assets: [
      { key: 'carrot', display: '🥕', value: 'Zanahoria' },
      { key: 'broccoli', display: '🥦', value: 'Brócoli' },
      { key: 'corn', display: '🌽', value: 'Maíz' },
      { key: 'tomato', display: '🍅', value: 'Tomate' },
      { key: 'potato', display: '🥔', value: 'Patata' },
      { key: 'cucumber', display: '🥒', value: 'Pepino' },
      { key: 'pepper', display: '🫑', value: 'Pimiento' },
      { key: 'lettuce', display: '🥬', value: 'Lechuga' },
      { key: 'onion', display: '🧅', value: 'Cebolla' },
      { key: 'garlic', display: '🧄', value: 'Ajo' }
    ]
  },

  // =============================================
  // FORMAS GEOMÉTRICAS
  // =============================================
  {
    contextId: 'shapes',
    name: 'Formas Geométricas',
    isActive: true,
    assets: [
      { key: 'circle', display: '⚫', value: 'Círculo' },
      { key: 'square', display: '⬛', value: 'Cuadrado' },
      { key: 'triangle', display: '🔺', value: 'Triángulo' },
      { key: 'star', display: '⭐', value: 'Estrella' },
      { key: 'heart', display: '❤️', value: 'Corazón' },
      { key: 'diamond', display: '💎', value: 'Rombo' },
      { key: 'rectangle', display: '▬', value: 'Rectángulo' },
      { key: 'oval', display: '🥚', value: 'Óvalo' }
    ]
  },

  // =============================================
  // DÍAS Y TIEMPO
  // =============================================
  {
    contextId: 'weekdays',
    name: 'Días de la Semana',
    isActive: true,
    assets: [
      { key: 'monday', display: '1️⃣', value: 'Lunes' },
      { key: 'tuesday', display: '2️⃣', value: 'Martes' },
      { key: 'wednesday', display: '3️⃣', value: 'Miércoles' },
      { key: 'thursday', display: '4️⃣', value: 'Jueves' },
      { key: 'friday', display: '5️⃣', value: 'Viernes' },
      { key: 'saturday', display: '6️⃣', value: 'Sábado' },
      { key: 'sunday', display: '7️⃣', value: 'Domingo' }
    ]
  },
  {
    contextId: 'seasons',
    name: 'Estaciones del Año',
    isActive: true,
    assets: [
      { key: 'spring', display: '🌸', value: 'Primavera' },
      { key: 'summer', display: '☀️', value: 'Verano' },
      { key: 'autumn', display: '🍂', value: 'Otoño' },
      { key: 'winter', display: '❄️', value: 'Invierno' }
    ]
  },

  // =============================================
  // TRANSPORTES
  // =============================================
  {
    contextId: 'transport',
    name: 'Medios de Transporte',
    isActive: true,
    assets: [
      { key: 'car', display: '🚗', value: 'Coche' },
      { key: 'bus', display: '🚌', value: 'Autobús' },
      { key: 'train', display: '🚂', value: 'Tren' },
      { key: 'plane', display: '✈️', value: 'Avión' },
      { key: 'boat', display: '🚢', value: 'Barco' },
      { key: 'bicycle', display: '🚲', value: 'Bicicleta' },
      { key: 'helicopter', display: '🚁', value: 'Helicóptero' },
      { key: 'motorcycle', display: '🏍️', value: 'Moto' },
      { key: 'ambulance', display: '🚑', value: 'Ambulancia' },
      { key: 'firetruck', display: '🚒', value: 'Camión de Bomberos' }
    ]
  },

  // =============================================
  // EMOCIONES (para desarrollo emocional)
  // =============================================
  {
    contextId: 'emotions',
    name: 'Emociones',
    isActive: true,
    assets: [
      { key: 'happy', display: '😊', value: 'Feliz' },
      { key: 'sad', display: '😢', value: 'Triste' },
      { key: 'angry', display: '😠', value: 'Enfadado' },
      { key: 'surprised', display: '😮', value: 'Sorprendido' },
      { key: 'scared', display: '😨', value: 'Asustado' },
      { key: 'sleepy', display: '😴', value: 'Dormido' },
      { key: 'love', display: '🥰', value: 'Enamorado' },
      { key: 'thinking', display: '🤔', value: 'Pensativo' }
    ]
  }
];

/**
 * Ejecuta el seeder de contextos.
 * @returns {Promise<Array>} Array de contextos creados
 */
async function seedContexts() {
  try {
    const contexts = await GameContext.insertMany(contextsData);

    // Contar assets totales
    const totalAssets = contextsData.reduce((sum, ctx) => sum + ctx.assets.length, 0);

    logger.info('✅ Contextos de juego seeded exitosamente');
    logger.info(`   - ${contexts.length} contextos creados`);
    logger.info(`   - ${totalAssets} assets totales`);

    return contexts;
  } catch (error) {
    logger.error('❌ Error en seedContexts:', error);
    throw error;
  }
}

module.exports = seedContexts;
