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
  // Tipos válidos según el modelo (con espacio, no guion bajo)
  const types = ['MIFARE 1KB', 'MIFARE 4KB', 'NTAG'];

  // Colores y iconos para identificación visual
  const colors = [
    { color: 'rojo', emoji: '🔴' },
    { color: 'azul', emoji: '🔵' },
    { color: 'verde', emoji: '🟢' },
    { color: 'amarillo', emoji: '🟡' },
    { color: 'naranja', emoji: '🟠' },
    { color: 'morado', emoji: '🟣' },
    { color: 'rosa', emoji: '🩷' },
    { color: 'negro', emoji: '⚫' },
    { color: 'blanco', emoji: '⚪' },
    { color: 'marrón', emoji: '🟤' }
  ];

  const icons = ['⭐', '❤️', '🌟', '🎈', '🎨', '🎵', '🚀', '🌈', '🎯', '🏆'];

  const cards = [];

  for (let i = 0; i < count; i++) {
    // UID predecible: AA00 + número en hex (4 dígitos)
    // Ejemplos: AA000001, AA000002, ..., AA00000A, AA00000B, ...
    const hexNum = (i + 1).toString(16).toUpperCase().padStart(4, '0');
    const uid = `AA00${hexNum}`;

    const colorData = colors[i % colors.length];

    cards.push({
      uid,
      type: types[i % types.length],
      status: 'active',
      metadata: {
        color: colorData.emoji,
        icon: icons[i % icons.length],
        lastUsed: null
      }
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
    status: 'active',
    metadata: { color: '🔴', icon: '⭐' }
  },
  {
    uid: 'BBBBBBBB',
    type: 'NTAG',
    status: 'active',
    metadata: { color: '🔵', icon: '❤️' }
  },
  {
    uid: 'CCCCCCCC',
    type: 'NTAG',
    status: 'active',
    metadata: { color: '🟢', icon: '🌟' }
  },
  {
    uid: 'DDDDDDDD',
    type: 'NTAG',
    status: 'active',
    metadata: { color: '🟡', icon: '🎈' }
  },
  {
    uid: 'EEEEEEEE',
    type: 'NTAG',
    status: 'active',
    metadata: { color: '🟠', icon: '🎨' }
  },
  {
    uid: 'FFFFFFFF',
    type: 'NTAG',
    status: 'active',
    metadata: { color: '🟣', icon: '🎵' }
  },
  {
    uid: '12345678',
    type: 'MIFARE 1KB',
    status: 'active',
    metadata: { color: '⚫', icon: '🚀' }
  },
  {
    uid: '87654321',
    type: 'MIFARE 1KB',
    status: 'active',
    metadata: { color: '⚪', icon: '🌈' }
  },
  // Tarjetas de 14 caracteres (NTAG)
  {
    uid: '04AABBCCDD1234',
    type: 'NTAG',
    status: 'active',
    metadata: { color: '🩷', icon: '🎯' }
  },
  {
    uid: '04112233445566',
    type: 'NTAG',
    status: 'active',
    metadata: { color: '🟤', icon: '🏆' }
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
