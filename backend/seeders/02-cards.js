/**
 * @fileoverview Seeder de tarjetas RFID.
 * Crea tarjetas con UIDs predecibles para facilitar testing sin hardware.
 * @module seeders/02-cards
 */

const Card = require('../src/models/Card');
const logger = require('../src/utils/logger');

/**
 * Genera tarjetas RFID con UIDs predecibles y secuenciales.
 * Formato: AA00XXXX donde XXXX es un número secuencial en hex.
 *
 * @param {number} count - Número de tarjetas a generar
 * @returns {Array} Array de datos de tarjetas
 */
function generateCardsData(count) {
  // Tipos válidos según el modelo
  const types = ['MIFARE_1KB', 'MIFARE_4KB', 'NTAG'];

  const cards = [];

  for (let i = 0; i < count; i++) {
    // UID predecible: AA00 + número en hex (4 dígitos)
    // Ejemplos: AA000001, AA000002, ..., AA00000A, AA00000B, ...
    const hexNum = (i + 1).toString(16).toUpperCase().padStart(4, '0');
    const uid = `AA00${hexNum}`;

    cards.push({
      uid,
      type: types[i % types.length],
      status: 'active'
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
    const totalCards = 150;
    const sequentialCards = generateCardsData(totalCards);

    const cards = await Card.insertMany(sequentialCards);

    logger.info('Tarjetas RFID seeded exitosamente');
    logger.info(`- ${sequentialCards.length} tarjetas secuenciales`);

    return cards;
  } catch (error) {
    logger.error('Error en seedCards:', error);
    throw error;
  }
}

module.exports = seedCards;
