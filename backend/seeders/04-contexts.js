/**
 * @fileoverview Seeder de contextos de juego.
 * Crea contextos temáticos: geografía, animales, colores, números.
 * @module seeders/04-contexts
 */

const GameContext = require('../src/models/GameContext');
const logger = require('../src/utils/logger');

/**
 * Datos de contextos de juego con assets.
 */
const contextsData = [
  {
    contextId: 'geography',
    name: 'Geografía Mundial',
    assets: [
      { key: 'spain', display: '🇪🇸', value: 'España' },
      { key: 'france', display: '🇫🇷', value: 'Francia' },
      { key: 'italy', display: '🇮🇹', value: 'Italia' },
      { key: 'germany', display: '🇩🇪', value: 'Alemania' },
      { key: 'uk', display: '🇬🇧', value: 'Reino Unido' },
      { key: 'portugal', display: '🇵🇹', value: 'Portugal' },
      { key: 'greece', display: '🇬🇷', value: 'Grecia' },
      { key: 'usa', display: '🇺🇸', value: 'Estados Unidos' },
      { key: 'mexico', display: '🇲🇽', value: 'México' },
      { key: 'brazil', display: '🇧🇷', value: 'Brasil' }
    ]
  },
  {
    contextId: 'animals',
    name: 'Animales',
    assets: [
      { key: 'dog', display: '🐶', value: 'Perro' },
      { key: 'cat', display: '🐱', value: 'Gato' },
      { key: 'lion', display: '🦁', value: 'León' },
      { key: 'elephant', display: '🐘', value: 'Elefante' },
      { key: 'monkey', display: '🐵', value: 'Mono' },
      { key: 'bird', display: '🐦', value: 'Pájaro' },
      { key: 'fish', display: '🐟', value: 'Pez' },
      { key: 'butterfly', display: '🦋', value: 'Mariposa' },
      { key: 'bee', display: '🐝', value: 'Abeja' },
      { key: 'frog', display: '🐸', value: 'Rana' }
    ]
  },
  {
    contextId: 'colors',
    name: 'Colores',
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
  {
    contextId: 'numbers',
    name: 'Números',
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
  {
    contextId: 'fruits',
    name: 'Frutas',
    assets: [
      { key: 'apple', display: '🍎', value: 'Manzana' },
      { key: 'banana', display: '🍌', value: 'Plátano' },
      { key: 'orange', display: '🍊', value: 'Naranja' },
      { key: 'grape', display: '🍇', value: 'Uva' },
      { key: 'strawberry', display: '🍓', value: 'Fresa' },
      { key: 'watermelon', display: '🍉', value: 'Sandía' },
      { key: 'pineapple', display: '🍍', value: 'Piña' },
      { key: 'cherry', display: '🍒', value: 'Cereza' },
      { key: 'peach', display: '🍑', value: 'Melocotón' },
      { key: 'pear', display: '🍐', value: 'Pera' }
    ]
  },
  {
    contextId: 'shapes',
    name: 'Formas Geométricas',
    assets: [
      { key: 'circle', display: '⚫', value: 'Círculo' },
      { key: 'square', display: '◼️', value: 'Cuadrado' },
      { key: 'triangle', display: '▲', value: 'Triángulo' },
      { key: 'star', display: '⭐', value: 'Estrella' },
      { key: 'heart', display: '❤️', value: 'Corazón' },
      { key: 'diamond', display: '💎', value: 'Diamante' },
      { key: 'rectangle', display: '▬', value: 'Rectángulo' },
      { key: 'oval', display: '🥚', value: 'Óvalo' },
      { key: 'hexagon', display: '⬡', value: 'Hexágono' },
      { key: 'pentagon', display: '⬠', value: 'Pentágono' }
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

    logger.info('✅ Contextos de juego seeded exitosamente');

    return contexts;
  } catch (error) {
    logger.error('❌ Error en seedContexts:', error);
    throw error;
  }
}

module.exports = seedContexts;
