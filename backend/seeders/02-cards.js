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
 * Tarjetas especiales con UIDs específicos para testing manual.
 * Estas tienen UIDs más fáciles de recordar.
 */
const specialCards = [
  {
    uid: 'AAAAAAAA',
    type: 'NTAG',
    status: 'active'
  },
  {
    uid: 'BBBBBBBB',
    type: 'NTAG',
    status: 'active'
  },
  {
    uid: 'CCCCCCCC',
    type: 'NTAG',
    status: 'active'
  },
  {
    uid: 'DDDDDDDD',
    type: 'NTAG',
    status: 'active'
  },
  {
    uid: 'EEEEEEEE',
    type: 'NTAG',
    status: 'active'
  },
  {
    uid: 'FFFFFFFF',
    type: 'NTAG',
    status: 'active'
  },
  {
    uid: '12345678',
    type: 'MIFARE_1KB',
    status: 'active'
  },
  {
    uid: '87654321',
    type: 'MIFARE_1KB',
    status: 'active'
  },
  // Tarjetas de 14 caracteres (NTAG)
  {
    uid: '04AABBCCDD1234',
    type: 'NTAG',
    status: 'active'
  },
  {
    uid: '04112233445566',
    type: 'NTAG',
    status: 'active'
  }
];

/**
 * Ejecuta el seeder de tarjetas.
 * @returns {Promise<Array>} Array de tarjetas creadas
 */
async function seedCards() {
  try {
    // Generar 40 tarjetas secuenciales + 10 especiales = 50 total
    const sequentialCards = generateCardsData(40);
    const allCardsData = [...sequentialCards, ...specialCards];

    const cards = await Card.insertMany(allCardsData);

    logger.info('✅ Tarjetas RFID seeded exitosamente');
    logger.info(`   - ${sequentialCards.length} tarjetas secuenciales (AA000001-AA000028)`);
    logger.info(`   - ${specialCards.length} tarjetas especiales (AAAAAAAA, BBBBBBBB, etc.)`);

    return cards;
  } catch (error) {
    logger.error('❌ Error en seedCards:', error);
    throw error;
  }
}

module.exports = seedCards;
