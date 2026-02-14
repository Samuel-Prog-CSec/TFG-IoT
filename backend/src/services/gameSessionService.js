/**
 * @fileoverview Servicio de lógica de negocio para GameSession.
 * Maneja validaciones complejas de sesiones, mecánicas, contextos y tarjetas.
 * Principio Single Responsibility: Lógica exclusiva de sesiones de juego.
 * @module services/gameSessionService
 */

const gameSessionRepository = require('../repositories/gameSessionRepository');
const gameMechanicRepository = require('../repositories/gameMechanicRepository');
const gameContextRepository = require('../repositories/gameContextRepository');
const cardRepository = require('../repositories/cardRepository');
const cardDeckRepository = require('../repositories/cardDeckRepository');
const gamePlayRepository = require('../repositories/gamePlayRepository');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger').child({ component: 'gameSessionService' });

const MIN_DECK_CARDS = 2;

function normalizeSessionMappingsFromDeck(deck) {
  const mappings = Array.isArray(deck.cardMappings) ? deck.cardMappings : [];

  return mappings.map(m => ({
    cardId: m.cardId,
    uid: (m.uid || '').toString().trim().toUpperCase(),
    assignedValue: (m.assignedValue || '').toString().trim(),
    displayData: m.displayData
  }));
}

async function syncSessionFromDeck(session, { deckId, userId }) {
  const deck = await cardDeckRepository.findById(deckId);
  if (!deck) {
    throw new NotFoundError('Mazo');
  }

  if (deck.createdBy.toString() !== userId.toString()) {
    throw new ForbiddenError('No tienes permiso para usar este mazo');
  }

  if (deck.status && deck.status !== 'active') {
    throw new ValidationError('El mazo seleccionado no está activo');
  }

  const cardMappings = normalizeSessionMappingsFromDeck(deck);
  if (cardMappings.length < MIN_DECK_CARDS) {
    throw new ValidationError(`El mazo debe tener al menos ${MIN_DECK_CARDS} cardMappings`);
  }

  const context = await gameContextRepository.findById(deck.contextId);
  if (!context) {
    throw new NotFoundError('Contexto de juego');
  }

  const allowedValues = new Set((context.assets || []).map(a => a.value));
  const invalidValues = cardMappings.map(m => m.assignedValue).filter(v => !allowedValues.has(v));
  if (invalidValues.length > 0) {
    throw new ValidationError(
      `assignedValue no existe en los assets del contexto: ${[...new Set(invalidValues)].join(', ')}`
    );
  }

  const cardIds = cardMappings.map(m => m.cardId);
  const cards = await cardRepository.find({ _id: { $in: cardIds } });
  if (cards.length !== cardIds.length) {
    throw new ValidationError('Una o más tarjetas no existen');
  }

  const inactiveCards = cards.filter(card => card.status !== 'active');
  if (inactiveCards.length > 0) {
    throw new ValidationError(
      `Las siguientes tarjetas no están activas: ${inactiveCards.map(c => c.uid).join(', ')}`
    );
  }

  const cardById = new Map(cards.map(c => [c._id.toString(), c]));
  const mismatch = cardMappings.filter(m => {
    const card = cardById.get(m.cardId.toString());
    return !card || card.uid !== m.uid;
  });
  if (mismatch.length > 0) {
    throw new ValidationError(
      `UID no coincide con la tarjeta para: ${mismatch.map(m => m.uid).join(', ')}`
    );
  }

  session.deckId = deck._id;
  session.contextId = deck.contextId;
  session.cardMappings = cardMappings;
  session.config = {
    ...session.config,
    numberOfCards: cardMappings.length
  };

  return { deck, context, cardMappings };
}

/**
 * Valida que una mecánica exista y esté activa.
 *
 * @param {string} mechanicId - ID de la mecánica
 * @returns {Promise<Object>} Mecánica validada
 * @throws {NotFoundError} Si la mecánica no existe
 * @throws {ValidationError} Si la mecánica no está activa
 */
async function validateMechanic(mechanicId) {
  const mechanic = await gameMechanicRepository.findById(mechanicId);

  if (!mechanic) {
    throw new NotFoundError('Mecánica de juego');
  }

  if (!mechanic.isActive) {
    throw new ValidationError('La mecánica seleccionada no está activa');
  }

  return mechanic;
}

/**
 * Valida que un contexto exista y tenga suficientes assets.
 *
 * @param {string} contextId - ID del contexto
 * @param {number} requiredAssets - Número de assets requeridos
 * @returns {Promise<Object>} Contexto validado
 * @throws {NotFoundError} Si el contexto no existe
 * @throws {ValidationError} Si no hay suficientes assets
 */
async function validateContext(contextId, requiredAssets) {
  const context = await gameContextRepository.findById(contextId);

  if (!context) {
    throw new NotFoundError('Contexto de juego');
  }

  if (context.assets.length < requiredAssets) {
    throw new ValidationError(
      `El contexto solo tiene ${context.assets.length} assets, pero se requieren ${requiredAssets}`
    );
  }

  return context;
}

/**
 * Valida que las tarjetas existan y estén activas.
 *
 * @param {Array<string>} cardIds - Array de IDs de tarjetas
 * @returns {Promise<Array>} Tarjetas validadas
 * @throws {ValidationError} Si alguna tarjeta no existe o no está activa
 */
async function validateCards(cardIds) {
  const cards = await cardRepository.find({ _id: { $in: cardIds } });

  if (cards.length !== cardIds.length) {
    throw new ValidationError('Una o más tarjetas no existen');
  }

  const inactiveCards = cards.filter(card => card.status !== 'active');

  if (inactiveCards.length > 0) {
    throw new ValidationError(
      `Las siguientes tarjetas no están activas: ${inactiveCards.map(c => c.uid).join(', ')}`
    );
  }

  return cards;
}

/**
 * Valida la estructura de cardMappings.
 * Verifica que no haya duplicados de cardId o assignedValue.
 *
 * @param {Array} cardMappings - Array de mapeos de tarjetas
 * @param {number} numberOfCards - Número esperado de tarjetas
 * @throws {ValidationError} Si hay inconsistencias en los mapeos
 */
function validateCardMappings(cardMappings, numberOfCards) {
  if (cardMappings.length !== numberOfCards) {
    throw new ValidationError(
      `cardMappings debe tener exactamente ${numberOfCards} elementos (recibido: ${cardMappings.length})`
    );
  }

  // Verificar duplicados en cardId
  const cardIds = cardMappings.map(m => m.cardId.toString());
  const uniqueCardIds = [...new Set(cardIds)];

  if (cardIds.length !== uniqueCardIds.length) {
    throw new ValidationError('No puede haber tarjetas duplicadas en cardMappings');
  }

  // Verificar que todos los assignedValue sean únicos
  const assignedValues = cardMappings.map(m => m.assignedValue);
  const uniqueValues = [...new Set(assignedValues)];

  if (assignedValues.length !== uniqueValues.length) {
    throw new ValidationError('No puede haber valores asignados duplicados en cardMappings');
  }
}

/**
 * Crea una nueva sesión de juego con validaciones completas.
 *
 * @param {Object} params - Parámetros de la sesión
 * @param {string} params.mechanicId - ID de la mecánica
 * @param {string} params.contextId - ID del contexto
 * @param {Object} params.config - Configuración de la sesión
 * @param {Array} params.cardMappings - Mapeo de tarjetas a valores
 * @param {string} [params.difficulty='medium'] - Dificultad
 * @param {string} params.createdBy - ID del profesor creador
 * @returns {Promise<Object>} Sesión creada con populate
 */
async function createSession({
  mechanicId,
  contextId,
  config,
  cardMappings,
  difficulty = 'medium',
  createdBy
}) {
  // Validar mecánica
  const mechanic = await validateMechanic(mechanicId);

  // Validar contexto
  const context = await validateContext(contextId, config.numberOfCards);

  // Validar estructura de cardMappings
  validateCardMappings(cardMappings, config.numberOfCards);

  // Validar tarjetas
  const cardIds = cardMappings.map(mapping => mapping.cardId);
  await validateCards(cardIds);

  // Crear sesión
  const session = await gameSessionRepository.create({
    mechanicId,
    contextId,
    config,
    cardMappings,
    difficulty,
    status: 'created',
    createdBy
  });

  // Populate para respuesta completa
  await session.populate([
    { path: 'mechanicId', select: 'name displayName icon' },
    { path: 'contextId', select: 'contextId name' },
    { path: 'createdBy', select: 'name email' }
  ]);

  logger.info('Sesión creada via service', {
    sessionId: session._id,
    mechanicName: mechanic.name,
    contextId: context.contextId,
    cardsCount: cardMappings.length,
    createdBy
  });

  return session;
}

/**
 * Actualiza una sesión existente (solo si no ha iniciado).
 *
 * @param {string} sessionId - ID de la sesión
 * @param {Object} updates - Campos a actualizar
 * @param {Object} [updates.config] - Nueva configuración
 * @param {string} [updates.difficulty] - Nueva dificultad
 * @param {string} userId - ID del usuario que actualiza
 * @returns {Promise<Object>} Sesión actualizada
 * @throws {NotFoundError} Si la sesión no existe
 * @throws {ValidationError} Si la sesión ya inició
 */
async function updateSession(sessionId, updates, userId) {
  const session = await gameSessionRepository.findById(sessionId);

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  if (session.status !== 'created') {
    throw new ValidationError('Solo se pueden actualizar sesiones que no han iniciado');
  }

  // Actualizar campos permitidos
  if (updates.config) {
    session.config = { ...session.config, ...updates.config };
  }

  if (updates.difficulty) {
    session.difficulty = updates.difficulty;
  }

  await session.save();

  logger.info('Sesión actualizada via service', {
    sessionId: session._id,
    updatedBy: userId
  });

  return session;
}

/**
 * Valida si una sesión puede ser eliminada.
 * Una sesión solo puede eliminarse si no ha iniciado y no tiene partidas asociadas.
 *
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<Object>} Sesión validada para eliminación
 * @throws {NotFoundError} Si la sesión no existe
 * @throws {ValidationError} Si la sesión ya inició o tiene partidas
 */
async function validateSessionDeletion(sessionId) {
  const session = await gameSessionRepository.findById(sessionId);

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  if (session.status !== 'created') {
    throw new ValidationError('Solo se pueden eliminar sesiones que no han iniciado');
  }

  const plays = await gamePlayRepository.count({ sessionId });
  if (plays > 0) {
    throw new ValidationError('No se puede eliminar una sesión con partidas asociadas');
  }

  return session;
}

/**
 * Obtiene estadísticas de una sesión de juego.
 * Incluye número de partidas, puntuación media, etc.
 *
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<Object>} Estadísticas de la sesión
 */
async function getSessionStats(sessionId) {
  // Import eliminado: usamos repositorio para evitar dependencias circulares.

  const stats = await gamePlayRepository.aggregate([
    { $match: { sessionId, status: 'completed' } },
    {
      $group: {
        _id: null,
        totalPlays: { $sum: 1 },
        averageScore: { $avg: '$score' },
        bestScore: { $max: '$score' },
        worstScore: { $min: '$score' },
        averageCompletionTime: { $avg: '$metrics.completionTime' }
      }
    }
  ]);

  return (
    stats[0] || {
      totalPlays: 0,
      averageScore: 0,
      bestScore: 0,
      worstScore: 0,
      averageCompletionTime: 0
    }
  );
}

module.exports = {
  syncSessionFromDeck,
  createSession,
  updateSession,
  validateSessionDeletion,
  getSessionStats,
  validateMechanic,
  validateContext,
  validateCards,
  validateCardMappings
};
