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

/**
 * Genera un boardLayout a partir de cardMappings.
 * Cada slot recibe slotIndex secuencial y uid/assignedValue/displayData del mapping.
 *
 * @param {Object[]} cardMappings - Mappings generados con createTestCardMappings
 * @returns {Object[]} Array de boardLayout items
 */
function createTestBoardLayout(cardMappings) {
  return (cardMappings || []).map((m, i) => ({
    slotIndex: i,
    uid: m.uid,
    assignedValue: m.assignedValue,
    displayData: m.displayData || {}
  }));
}

/**
 * Genera un associationChallengePlan a partir de cardMappings.
 * Cicla round-robin sobre los mappings para cubrir numberOfRounds.
 *
 * @param {Object[]} cardMappings - Mappings generados con createTestCardMappings
 * @param {number} numberOfRounds - Número de rondas del plan
 * @returns {Object[]} Array de challenge items
 */
function createTestAssociationPlan(cardMappings, numberOfRounds) {
  const mappings = cardMappings || [];
  if (mappings.length === 0 || numberOfRounds < 1) {
    return [];
  }

  return Array.from({ length: numberOfRounds }, (_, i) => {
    const m = mappings[i % mappings.length];
    return {
      roundNumber: i + 1,
      uid: m.uid,
      assignedValue: m.assignedValue,
      displayData: m.displayData || {}
    };
  });
}

module.exports = { createTestCardMappings, createTestBoardLayout, createTestAssociationPlan };
