/**
 * @fileoverview Servicio de lógica de negocio para GameSession.
 * Maneja validaciones complejas de sesiones, mecánicas, contextos y tarjetas.
 * Principio Single Responsibility: Lógica exclusiva de sesiones de juego.
 * @module services/gameSessionService
 */

const gameSessionRepository = require('../repositories/gameSessionRepository');
const gameMechanicRepository = require('../repositories/gameMechanicRepository');
const gameContextRepository = require('../repositories/gameContextRepository');
const cardDeckRepository = require('../repositories/cardDeckRepository');
const gamePlayRepository = require('../repositories/gamePlayRepository');
const { toMechanicType } = require('./gamePlayScoring');
const mongoose = require('mongoose');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { cacheInvalidatePattern } = require('../utils/cacheHelper');
const { assertAssignedValuesInContext } = require('../utils/cardMappingValidation');

/**
 * A.3 (pre-v1.0.0): invalida el cache `teacherSessions:<teacherId>:*` tras
 * crear / archivar / eliminar sesiones del profesor. Sin esto, las
 * aggregations analytics que usan `getTeacherSessionIds` no verían la
 * sesión recién creada hasta que expire el TTL (300s con jitter).
 *
 * Fire-and-forget: no bloquea la operación principal.
 *
 * @param {string|import('mongoose').Types.ObjectId} teacherId
 */
function invalidateTeacherSessionsCache(teacherId) {
  if (!teacherId) {
    return;
  }
  const id = typeof teacherId === 'string' ? teacherId : teacherId.toString();
  cacheInvalidatePattern('cache:analytics', `teacherSessions:${id}:*`).catch(() => {});
}
const {
  normalizeMechanicName,
  isMechanicEnabledForSessionCreation,
  validateConfigAgainstMechanicRules,
  normalizeBoardLayout,
  validateBoardLayoutAgainstMappings,
  validateAssociationChallengePlanAgainstMappings,
  applySequenceConfigForCreate,
  applySequencePlanForCreate
} = require('./helpers/sessionValidationHelpers');
const logger = require('../utils/logger').child({ component: 'gameSessionService' });

const MIN_DECK_CARDS = 2;

function normalizeSessionMappingsFromDeck(deck) {
  const mappings = Array.isArray(deck.cardMappings) ? deck.cardMappings : [];

  return mappings.map(m => ({
    uid: (m.uid || '').toString().trim().toUpperCase(),
    assignedValue: (m.assignedValue || '').toString().trim(),
    displayData: m.displayData
  }));
}

async function syncSessionFromDeck(session, { deckId, userId }) {
  // Read-only: se leen campos del mazo para construir la sesión (el doc que se
  // guarda es `session`, no `deck`) → lean.
  const deck = await cardDeckRepository.findById(deckId, { lean: true });
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

  const context = await gameContextRepository.findById(deck.contextId, { lean: true });
  if (!context) {
    throw new NotFoundError('Contexto de juego');
  }

  assertAssignedValuesInContext(cardMappings, context);

  session.deckId = deck._id;
  session.contextId = deck.contextId;
  session.cardMappings = cardMappings;
  session.config = {
    ...session.config,
    numberOfCards: cardMappings.length
  };

  if (Array.isArray(session.boardLayout) && session.boardLayout.length > 0) {
    const mappingUids = new Set(cardMappings.map(mapping => mapping.uid));
    session.boardLayout = session.boardLayout.filter(slot => mappingUids.has(slot.uid));
  }

  return { deck, context, cardMappings };
}

const normalizeSessionConfig = config => {
  if (!config) {
    return {};
  }

  if (typeof config.toObject === 'function') {
    return config.toObject();
  }

  return { ...config };
};

async function cloneSessionFromExisting({ sourceSession, userId }) {
  if (!sourceSession) {
    throw new NotFoundError('Sesión de juego');
  }

  if (!sourceSession.deckId) {
    throw new ValidationError('La sesión original no tiene mazo asignado (deckId)');
  }

  const mechanic = await validateMechanic(sourceSession.mechanicId);

  const clonedSession = gameSessionRepository.build({
    mechanicId: sourceSession.mechanicId,
    mechanicType: toMechanicType(mechanic.name),
    deckId: sourceSession.deckId,
    sensorId: sourceSession.sensorId,
    name: sourceSession.name || undefined,
    config: normalizeSessionConfig(sourceSession.config),
    status: 'created',
    createdBy: userId
  });

  const { cardMappings } = await syncSessionFromDeck(clonedSession, {
    deckId: sourceSession.deckId,
    userId
  });

  // Para Secuencia preservamos también el `sequenceConfig` aquí: el helper
  // `applyCloneMechanicState` usará ese config para validar el plan o
  // regenerarlo. Sin esto, el config queda con los defaults del schema y
  // un plan compatible se descarta innecesariamente.
  if ((mechanic?.name || '').toLowerCase() === 'sequence' && sourceSession.sequenceConfig) {
    const sourceCfg =
      typeof sourceSession.sequenceConfig.toObject === 'function'
        ? sourceSession.sequenceConfig.toObject()
        : sourceSession.sequenceConfig;
    clonedSession.sequenceConfig = {
      minSequenceLength: sourceCfg.minSequenceLength,
      maxSequenceLength: sourceCfg.maxSequenceLength,
      displaySeconds: sourceCfg.displaySeconds
    };
  }

  return {
    clonedSession,
    mechanic,
    cardMappings
  };
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
  // Read-only (solo se lee isActive/name; no se hace .save()) → lean.
  const mechanic = await gameMechanicRepository.findById(mechanicId, { lean: true });

  if (!mechanic) {
    throw new NotFoundError('Mecánica de juego');
  }

  if (!mechanic.isActive) {
    throw new ValidationError('La mecánica seleccionada no está activa');
  }

  return mechanic;
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

  const objectId = new mongoose.Types.ObjectId(sessionId);
  const stats = await gamePlayRepository.aggregate([
    { $match: { sessionId: objectId, status: 'completed' } },
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

/**
 * Crea una sesión de juego a partir de un mazo (flujo actual).
 * Consolida toda la lógica de negocio: validación de mecánica, config,
 * sincronización con mazo, boardLayout y associationChallengePlan.
 *
 * @param {Object} params - Parámetros de creación
 * @param {string} params.mechanicId - ID de la mecánica
 * @param {string} params.deckId - ID del mazo
 * @param {string} [params.sensorId] - ID del sensor RFID
 * @param {Object} [params.config={}] - Configuración de la sesión
 * @param {string} [params.contextId] - ID explícito del contexto (debe coincidir con el del mazo)
 * @param {Array} [params.boardLayout] - Layout del tablero (mecánica memory)
 * @param {Array} [params.associationChallengePlan] - Plan de retos (mecánica association)
 * @param {string} params.createdBy - ID del profesor creador
 * @returns {Promise<Object>} Sesión creada y populada
 */
async function createSessionFromDeck({
  mechanicId,
  deckId,
  sensorId,
  name,
  config = {},
  contextId,
  boardLayout,
  associationChallengePlan,
  sequencePlan,
  sequenceConfig,
  createdBy
}) {
  // Validar mecánica
  const mechanic = await validateMechanic(mechanicId);
  const mechanicName = normalizeMechanicName(mechanic.name);

  if (!isMechanicEnabledForSessionCreation(mechanic)) {
    throw new ValidationError(
      'La mecánica seleccionada no está habilitada para creación de sesiones en el entorno actual.'
    );
  }

  validateConfigAgainstMechanicRules({ mechanic, config });

  // Construir sesión a partir del mazo
  const session = gameSessionRepository.build({
    mechanicId,
    mechanicType: toMechanicType(mechanicName),
    deckId,
    contextId: contextId || undefined,
    sensorId,
    name: name || undefined,
    config: { ...config },
    status: 'created',
    createdBy
  });

  const {
    deck,
    context,
    cardMappings: syncedMappings
  } = await syncSessionFromDeck(session, { deckId, userId: createdBy });

  // BoardLayout (mecánica memory)
  if (boardLayout !== undefined) {
    validateBoardLayoutAgainstMappings(boardLayout, syncedMappings);
    session.boardLayout = normalizeBoardLayout(boardLayout);
  }

  // AssociationChallengePlan (mecánica association)
  if (mechanicName === 'association') {
    const normalizedPlan = validateAssociationChallengePlanAgainstMappings({
      associationChallengePlan,
      cardMappings: syncedMappings,
      numberOfRounds: Number(session.config?.numberOfRounds)
    });
    session.associationChallengePlan = normalizedPlan;
    session.requiresAssociationPlanConfiguration = false;
  } else {
    session.associationChallengePlan = [];
    session.requiresAssociationPlanConfiguration = false;
  }

  // SequencePlan + SequenceConfig (mecánica sequence)
  if (mechanicName === 'sequence') {
    applySequenceConfigForCreate({ session, sequenceConfig });
    applySequencePlanForCreate({
      session,
      sequencePlan,
      cardMappings: syncedMappings,
      numberOfRounds: Number(session.config?.numberOfRounds)
    });
  } else {
    session.sequencePlan = [];
    session.sequenceConfig = undefined;
  }

  // Verificar consistencia de contextId explícito
  if (contextId && deck.contextId.toString() !== contextId.toString()) {
    throw new ValidationError('contextId no coincide con el contexto del mazo');
  }

  // Verificar consistencia de numberOfCards explícito
  if (config.numberOfCards !== undefined && config.numberOfCards !== syncedMappings.length) {
    throw new ValidationError(
      `config.numberOfCards (${config.numberOfCards}) no coincide con el número de cardMappings del mazo (${syncedMappings.length})`
    );
  }

  // Persistir (la dificultad se auto-calcula en el modelo)
  await session.save();

  await session.populate([
    { path: 'mechanicId', select: 'name displayName icon' },
    { path: 'contextId', select: 'contextId name' },
    { path: 'createdBy', select: 'name email' }
  ]);

  invalidateTeacherSessionsCache(createdBy);

  logger.info('Sesión creada desde mazo', {
    sessionId: session._id,
    mechanicId: mechanicName,
    contextId: context.contextId,
    cardsCount: syncedMappings.length,
    deckId,
    sensorId,
    createdBy
  });

  return session;
}

module.exports = {
  syncSessionFromDeck,
  cloneSessionFromExisting,
  createSessionFromDeck,
  updateSession,
  validateSessionDeletion,
  getSessionStats,
  validateMechanic
};
