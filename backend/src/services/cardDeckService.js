/**
 * @fileoverview Servicio de lógica de negocio para CardDeck.
 * Maneja la unicidad cross-deck de tarjetas RFID por profesor (ADR-022).
 * Principio Single Responsibility: Lógica de conflictos y movimiento de tarjetas entre mazos.
 * @module services/cardDeckService
 */

const cardDeckRepository = require('../repositories/cardDeckRepository');
const logger = require('../utils/logger').child({ component: 'cardDeckService' });

const MIN_DECK_CARDS = 2;

/**
 * Busca mazos activos del profesor que contengan alguno de los UIDs proporcionados.
 * Función interna — no exportada.
 *
 * @param {string[]} uids - Array de UIDs a buscar
 * @param {string} teacherId - ID del profesor
 * @param {string} [excludeDeckId] - ID de mazo a excluir (para edición)
 * @param {Object} [session] - Sesión de transacción MongoDB
 * @returns {Promise<Array>} Documentos Mongoose de mazos afectados (no lean)
 */
async function findDecksContainingUids(uids, teacherId, excludeDeckId, session) {
  const filter = {
    createdBy: teacherId,
    status: 'active',
    'cardMappings.uid': { $in: uids }
  };

  if (excludeDeckId) {
    filter._id = { $ne: excludeDeckId };
  }

  // lean: false para poder hacer .save() con transacción
  return cardDeckRepository.find(filter, { session, lean: false });
}

/**
 * Verifica si un UID de tarjeta RFID existe en otros mazos activos del profesor.
 * Operación read-only para feedback inmediato durante el escaneo.
 *
 * @param {string} uid - UID de la tarjeta RFID
 * @param {string} teacherId - ID del profesor
 * @param {string} [excludeDeckId] - ID de mazo a excluir (para edición)
 * @returns {Promise<{found: boolean, deck?: {id: string, name: string, cardsCount: number}}>}
 */
async function checkCardInOtherDecks(uid, teacherId, excludeDeckId) {
  const decks = await findDecksContainingUids([uid], teacherId, excludeDeckId);

  if (decks.length === 0) {
    return { found: false };
  }

  const deck = decks[0];
  return {
    found: true,
    deck: {
      id: deck._id.toString(),
      name: deck.name,
      cardsCount: deck.cardMappings.length
    }
  };
}

/**
 * Resuelve conflictos de tarjetas duplicadas cross-deck dentro de una transacción.
 * Para cada UID que exista en otro mazo activo del profesor:
 * - Elimina el cardMapping del mazo antiguo
 * - Si el mazo queda con menos de MIN_DECK_CARDS, lo archiva automáticamente
 *
 * NOTA: Esta función NO maneja la transacción. El caller (controller) orquesta
 * withTransaction y pasa el session como parámetro.
 *
 * @param {string[]} uids - UIDs de las tarjetas del nuevo mazo
 * @param {string} teacherId - ID del profesor
 * @param {Object} session - Sesión de transacción MongoDB (obligatoria)
 * @param {string} [excludeDeckId] - ID de mazo a excluir (para edición)
 * @returns {Promise<{movedCards: Array, archivedDecks: Array}>}
 */
async function resolveCardConflicts(uids, teacherId, session, excludeDeckId) {
  const uidSet = new Set(uids);
  const conflictingDecks = await findDecksContainingUids(uids, teacherId, excludeDeckId, session);

  const movedCards = [];
  const archivedDecks = [];

  for (const deck of conflictingDecks) {
    const removedUids = [];

    // Filtrar los cardMappings conflictivos
    const originalLength = deck.cardMappings.length;
    deck.cardMappings = deck.cardMappings.filter(m => {
      if (uidSet.has(m.uid)) {
        removedUids.push(m.uid);
        return false;
      }
      return true;
    });

    if (removedUids.length === 0) {
      continue;
    }

    // Registrar las tarjetas movidas
    for (const uid of removedUids) {
      movedCards.push({
        uid,
        fromDeck: { id: deck._id.toString(), name: deck.name }
      });
    }

    // Si queda con menos del mínimo, archivar automáticamente
    if (deck.cardMappings.length < MIN_DECK_CARDS) {
      deck.status = 'archived';
      archivedDecks.push({ id: deck._id.toString(), name: deck.name });
    }

    await deck.save(session ? { session } : {});

    logger.info('Tarjetas removidas de mazo por conflicto cross-deck', {
      deckId: deck._id,
      deckName: deck.name,
      removedUids,
      remainingCards: deck.cardMappings.length,
      originalCards: originalLength,
      archived: deck.status === 'archived'
    });
  }

  if (movedCards.length > 0) {
    logger.info('Conflictos de tarjetas cross-deck resueltos', {
      teacherId,
      movedCardsCount: movedCards.length,
      archivedDecksCount: archivedDecks.length
    });
  }

  return { movedCards, archivedDecks };
}

module.exports = {
  checkCardInOtherDecks,
  resolveCardConflicts
};
