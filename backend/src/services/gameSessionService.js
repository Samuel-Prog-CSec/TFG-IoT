/**
 * @fileoverview Servicio de lógica de negocio para GameSession.
 * Maneja validaciones complejas de sesiones, mecánicas, contextos y tarjetas.
 * Principio Single Responsibility: Lógica exclusiva de sesiones de juego.
 * @module services/gameSessionService
 */

const GameSession = require('../models/GameSession');
const GameMechanic = require('../models/GameMechanic');
const GameContext = require('../models/GameContext');
const Card = require('../models/Card');
const { NotFoundError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Valida que una mecánica exista y esté activa.
 *
 * @param {string} mechanicId - ID de la mecánica
 * @returns {Promise<Object>} Mecánica validada
 * @throws {NotFoundError} Si la mecánica no existe
 * @throws {ValidationError} Si la mecánica no está activa
 */
async function validateMechanic(mechanicId) {
  const mechanic = await GameMechanic.findById(mechanicId);

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
  const context = await GameContext.findById(contextId);

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
  const cards = await Card.find({ _id: { $in: cardIds } });

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
  const session = await GameSession.create({
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
  const session = await GameSession.findById(sessionId);

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
  const session = await GameSession.findById(sessionId);

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  if (session.status !== 'created') {
    throw new ValidationError('Solo se pueden eliminar sesiones que no han iniciado');
  }

  // TODO: Verificar si hay GamePlays asociadas
  // const plays = await GamePlay.countDocuments({ sessionId });
  // if (plays > 0) {
  //   throw new ValidationError('No se puede eliminar una sesión con partidas asociadas');
  // }

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
  const GamePlay = require('../models/GamePlay'); // Import dinámico para evitar dependencia circular

  const stats = await GamePlay.aggregate([
    { $match: { sessionId: sessionId, status: 'completed' } },
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

  return stats[0] || {
    totalPlays: 0,
    averageScore: 0,
    bestScore: 0,
    worstScore: 0,
    averageCompletionTime: 0
  };
}

module.exports = {
  createSession,
  updateSession,
  validateSessionDeletion,
  getSessionStats,
  validateMechanic,
  validateContext,
  validateCards,
  validateCardMappings
};
