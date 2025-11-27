/**
 * @fileoverview Seeder de tarjetas RFID.
 * Crea 50 tarjetas con UIDs válidos y metadata variada.
 * @module seeders/02-cards
 */

const Card = require('../src/models/Card');
const logger = require('../src/utils/logger');

/**
 * Genera un UID hexadecimal aleatorio de 8 caracteres.
 * @returns {string} UID en formato hexadecimal uppercase
 */
function generateUID() {
  return Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16).toUpperCase()
  ).join('');
}

/**
 * Genera datos de tarjetas RFID.
 * @param {number} count - Número de tarjetas a generar
 * @returns {Array} Array de datos de tarjetas
 */
function generateCardsData(count) {
  const types = ['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN'];
  const colors = ['🔴', '🟢', '🔵', '🟡', '🟠', '🟣', '🟤', '⚫', '⚪'];
  const icons = ['⭐', '❤️', '🌟', '🎈', '🎨', '🎵', '🚀', '🌈', '🎯', '🏆'];

  const cards = [];
  const usedUIDs = new Set();

  for (let i = 0; i < count; i++) {
    let uid;
    do {
      uid = generateUID();
    } while (usedUIDs.has(uid));

    usedUIDs.add(uid);

    cards.push({
      uid,
      type: types[i % types.length],
      status: 'active',
      metadata: {
        color: colors[i % colors.length],
        icon: icons[i % icons.length],
        lastUsed: null
      }
    });
  }

  return cards;
}

/**
 * Ejecuta el seeder de tarjetas.
 * @returns {Promise<Array>} Array de tarjetas creadas
 */
async function seedCards() {
  try {
    const cardsData = generateCardsData(50);
    const cards = await Card.insertMany(cardsData);

    logger.info('✅ Tarjetas RFID seeded exitosamente');

    return cards;
  } catch (error) {
    logger.error('❌ Error en seedCards:', error);
    throw error;
  }
}

module.exports = seedCards;
