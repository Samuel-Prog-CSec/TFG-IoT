/**
 * @fileoverview Helpers para generar fixtures de test sin dependencia del modelo Card.
 * Las tarjetas RFID son tokens fungibles identificados únicamente por UID (ADR-012).
 * @module tests/helpers/testFixtures
 */

/**
 * Genera un array de cardMappings para tests.
 * Cada mapping tiene uid, assignedValue y displayData — sin cardId.
 *
 * @param {number} count - Número de mappings a generar (default 2)
 * @param {Object} [options] - Opciones de personalización
 * @param {string} [options.uidPrefix='AA00'] - Prefijo hex para UIDs generados
 * @param {string[]} [options.values] - Valores asignados custom (por índice)
 * @param {Object[]} [options.displayData] - Display data custom (por índice)
 * @returns {Object[]} Array de cardMappings listos para usar en CardDeck/GameSession
 *
 * @example
 * // Generar 3 mappings con valores custom
 * createTestCardMappings(3, { values: ['España', 'Francia', 'Italia'] });
 *
 * @example
 * // Generar 2 mappings con prefijo distinto
 * createTestCardMappings(2, { uidPrefix: 'BB00' });
 */
function createTestCardMappings(count = 2, options = {}) {
  const prefix = options.uidPrefix || 'AA00';

  return Array.from({ length: count }, (_, i) => ({
    uid: `${prefix}${(i + 1).toString(16).toUpperCase().padStart(4, '0')}`,
    assignedValue: options.values?.[i] || `Value${i + 1}`,
    displayData: options.displayData?.[i] || {
      value: options.values?.[i] || `Value${i + 1}`,
      key: `key${i + 1}`,
      display: ''
    }
  }));
}

module.exports = { createTestCardMappings };
