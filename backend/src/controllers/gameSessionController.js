/**
 * @fileoverview Controller para gestión CRUD de sesiones de juego.
 * Maneja la configuración de sesiones con mecánicas, contextos y mapeo de tarjetas.
 * Los helpers de validación y normalización se encuentran en helpers/sessionValidationHelpers.js.
 * @module controllers/gameSessionController
 */

const gameSessionRepository = require('../repositories/gameSessionRepository');
const gameMechanicRepository = require('../repositories/gameMechanicRepository');
const gamePlayRepository = require('../repositories/gamePlayRepository');
const gameSessionService = require('../services/gameSessionService');
const {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError
} = require('../utils/errors');
const logger = require('../utils/logger');
const { toGameSessionDetailDTOV1, toGameSessionListDTOV1 } = require('../utils/dtos');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/responseHelper');
const {
  normalizeMechanicName,
  isMechanicEnabledForSessionCreation,
  validateConfigAgainstMechanicRules,
  ensureMemoryBoardLayoutIsComplete,
  normalizeBoardLayout,
  validateBoardLayoutAgainstMappings,
  validateAssociationChallengePlanAgainstMappings,
  applyAssociationPlanOnUpdate,
  ensureAssociationPlanReadyForStart,
  applyCloneMechanicState,
  buildCloneSuccessMessage
} = require('./helpers/sessionValidationHelpers');

const isSessionReadLeanEnabled = () => process.env.SESSION_READ_LEAN_ENABLED !== 'false';

/**
 * Obtener lista de sesiones con paginación y filtros.
 *
 * GET /api/sessions?page=1&status=active&mechanicId=...&contextId=...
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getSessions = async (req, res) => {
  const {
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    order = 'desc',
    mechanicId,
    contextId,
    status,
    difficulty,
    createdBy
  } = req.query;

  // Construir filtro
  const filter = {};

  if (mechanicId) {
    filter.mechanicId = mechanicId;
  }
  if (contextId) {
    filter.contextId = contextId;
  }
  if (status) {
    filter.status = status;
  }
  if (difficulty) {
    filter.difficulty = difficulty;
  }
  if (createdBy) {
    filter.createdBy = createdBy;
  }

  // Los profesores ven todas sus sesiones, los alumnos no deberían acceder
  if (req.user.role === 'student') {
    throw new ForbiddenError('Los alumnos no pueden acceder a sesiones directamente');
  }

  // Filtrar SIEMPRE por sesiones del profesor actual.
  // Evita que un teacher fuerce createdBy en query para consultar sesiones ajenas.
  if (req.user.role === 'teacher') {
    filter.createdBy = req.user._id;
  }

  // Paginación
  const skip = (page - 1) * limit;
  const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

  // Ejecutar query con populate
  const [sessions, total] = await Promise.all([
    gameSessionRepository.find(filter, {
      select:
        'mechanicId deckId contextId createdBy config status difficulty startedAt endedAt createdAt updatedAt',
      populate: [
        { path: 'mechanicId', select: 'name displayName icon' },
        { path: 'deckId', select: 'name status contextId' },
        { path: 'contextId', select: 'contextId name' },
        { path: 'createdBy', select: 'name email' }
      ],
      sort: sortOptions,
      limit: Number.parseInt(limit, 10),
      skip,
      lean: isSessionReadLeanEnabled()
    }),
    gameSessionRepository.count(filter)
  ]);

  logger.info('Lista de sesiones obtenida', {
    requestedBy: req.user._id,
    filters: filter,
    resultsCount: sessions.length
  });

  sendPaginated(res, toGameSessionListDTOV1(sessions), {
    page: Number.parseInt(page, 10),
    limit: Number.parseInt(limit, 10),
    total
  });
};

/**
 * Obtener una sesión específica por ID.
 *
 * GET /api/sessions/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getSessionById = async (req, res) => {
  const { id } = req.params;

  const session = await gameSessionRepository.findById(id, {
    select:
      'mechanicId deckId contextId createdBy config cardMappings boardLayout associationChallengePlan requiresAssociationPlanConfiguration status difficulty startedAt endedAt createdAt updatedAt',
    populate: [
      { path: 'mechanicId', select: 'name displayName icon' },
      { path: 'deckId', select: 'name status contextId' },
      { path: 'contextId', select: 'contextId name' },
      { path: 'createdBy', select: 'name email' }
    ],
    lean: isSessionReadLeanEnabled()
  });

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  const ownerId = session?.createdBy?._id || session?.createdBy;

  // Verificar permisos: solo el creador o super admin
  if (ownerId?.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
    throw new ForbiddenError('No tienes permiso para ver esta sesión');
  }

  sendSuccess(res, toGameSessionDetailDTOV1(session));
};

/**
 * Crear una nueva sesión de juego.
 *
 * POST /api/sessions
 * Headers: Authorization: Bearer <token>
 * Body: { mechanicId, contextId, config, cardMappings }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createSession = async (req, res) => {
  const {
    mechanicId,
    contextId,
    deckId,
    sensorId,
    config = {},
    cardMappings,
    boardLayout,
    associationChallengePlan
  } = req.body;

  // NUEVA REGLA: el mapping de la sesión SIEMPRE depende del mazo asignado.
  // Por tanto, no aceptamos cardMappings manuales al crear la sesión.
  if (cardMappings) {
    throw new ValidationError(
      'cardMappings no se acepta: la sesión toma el mapping desde el mazo (deckId)'
    );
  }

  if (!deckId) {
    throw new ValidationError('deckId es requerido para crear una sesión');
  }

  // Verificar que la mecánica existe y está activa
  const mechanic = await gameMechanicRepository.findById(mechanicId);
  if (!mechanic) {
    throw new NotFoundError('Mecánica de juego');
  }
  if (!mechanic.isActive) {
    throw new ValidationError('La mecánica seleccionada no está activa');
  }

  const mechanicName = normalizeMechanicName(mechanic.name);
  if (!isMechanicEnabledForSessionCreation(mechanic)) {
    throw new ValidationError(
      'La mecánica seleccionada no está habilitada para creación de sesiones en el entorno actual.'
    );
  }

  validateConfigAgainstMechanicRules({ mechanic, config });

  // La sesión se construye a partir del mazo
  const session = gameSessionRepository.build({
    mechanicId,
    deckId,
    // contextId / cardMappings / numberOfCards se rellenan al sincronizar
    contextId: contextId || undefined,
    sensorId,
    config: {
      ...config
    },
    status: 'created',
    createdBy: req.user._id
  });

  const {
    deck,
    context,
    cardMappings: syncedMappings
  } = await gameSessionService.syncSessionFromDeck(session, {
    deckId,
    userId: req.user._id
  });

  if (boardLayout !== undefined) {
    validateBoardLayoutAgainstMappings(boardLayout, syncedMappings);
    session.boardLayout = normalizeBoardLayout(boardLayout);
  }

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

  ensureMemoryBoardLayoutIsComplete({
    mechanic,
    boardLayout: session.boardLayout,
    cardMappings: syncedMappings
  });

  // Si el cliente envía contextId explícito, debe coincidir con el del mazo
  if (contextId && deck.contextId.toString() !== contextId.toString()) {
    throw new ValidationError('contextId no coincide con el contexto del mazo');
  }

  // Si el cliente envía numberOfCards, debe coincidir con el del mazo
  if (config.numberOfCards !== undefined && config.numberOfCards !== syncedMappings.length) {
    throw new ValidationError(
      `config.numberOfCards (${config.numberOfCards}) no coincide con el número de cardMappings del mazo (${syncedMappings.length})`
    );
  }

  // Crear la sesión
  // NOTA: La dificultad se auto-calcula en el modelo basándose en numberOfCards
  await session.save();

  // Populate para respuesta completa
  await session.populate([
    { path: 'mechanicId', select: 'name displayName icon' },
    { path: 'contextId', select: 'contextId name' },
    { path: 'createdBy', select: 'name email' }
  ]);

  logger.info('Sesión creada', {
    sessionId: session._id,
    mechanicId: mechanicName,
    contextId: context.contextId,
    cardsCount: syncedMappings.length,
    deckId,
    sensorId,
    createdBy: req.user._id
  });

  sendCreated(res, toGameSessionDetailDTOV1(session), 'Sesión creada exitosamente');
};

/**
 * Actualizar una sesión existente.
 * Solo se puede actualizar si no ha iniciado.
 *
 * PUT /api/sessions/:id
 * Headers: Authorization: Bearer <token>
 * Body: { config? }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const updateSession = async (req, res) => {
  const { id } = req.params;
  const { deckId, sensorId, config, boardLayout, associationChallengePlan } = req.body;

  const session = await gameSessionRepository.findById(id);

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  // Verificar permisos
  if (session.createdBy.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('No tienes permiso para actualizar esta sesión');
  }

  // Solo se puede actualizar si NO está activa
  if (session.status === 'active') {
    throw new ValidationError('No se puede actualizar una sesión activa');
  }

  // Si se proporciona deckId, se cambia el mazo. Si no, se mantiene.
  if (deckId !== undefined) {
    session.deckId = deckId;
  }

  if (sensorId !== undefined) {
    session.sensorId = sensorId;
  }

  if (!session.deckId) {
    throw new ValidationError('La sesión no tiene mazo asignado (deckId)');
  }

  // Regla: SIEMPRE sincronizar mapping con el mazo actual (aunque no haya cambiado).
  await gameSessionService.syncSessionFromDeck(session, {
    deckId: session.deckId,
    userId: req.user._id
  });

  const mechanic = await gameMechanicRepository.findById(session.mechanicId);
  if (!mechanic) {
    throw new NotFoundError('Mecánica de juego');
  }

  // Actualizar campos (excepto numberOfCards, que depende del mazo)
  if (config) {
    if (config.numberOfCards !== undefined) {
      throw new ValidationError('config.numberOfCards no se puede modificar: depende del mazo');
    }

    const nextConfig = { ...session.config, ...config };
    validateConfigAgainstMechanicRules({ mechanic, config: nextConfig });

    session.config = { ...session.config, ...config };
  }

  if (boardLayout !== undefined) {
    validateBoardLayoutAgainstMappings(boardLayout, session.cardMappings);
    session.boardLayout = normalizeBoardLayout(boardLayout);
  }

  const mechanicName = normalizeMechanicName(mechanic?.name);
  applyAssociationPlanOnUpdate({
    session,
    associationChallengePlan,
    mechanicName
  });

  ensureMemoryBoardLayoutIsComplete({
    mechanic,
    boardLayout: session.boardLayout,
    cardMappings: session.cardMappings
  });

  await session.save();

  logger.info('Sesión actualizada', {
    sessionId: session._id,
    updatedBy: req.user._id
  });

  sendSuccess(res, toGameSessionDetailDTOV1(session), 'Sesión actualizada exitosamente');
};

/**
 * Eliminar una sesión.
 * Solo se puede eliminar si no ha iniciado.
 *
 * DELETE /api/sessions/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const deleteSession = async (req, res) => {
  const { id } = req.params;

  const session = await gameSessionRepository.findById(id);

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  // Verificar permisos
  if (session.createdBy.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('No tienes permiso para eliminar esta sesión');
  }

  // Solo se puede eliminar si no ha iniciado
  if (session.status !== 'created') {
    throw new ValidationError('Solo se pueden eliminar sesiones que no han iniciado');
  }

  await session.deleteOne();

  logger.info('Sesión eliminada', {
    sessionId: session._id,
    deletedBy: req.user._id
  });

  sendSuccess(res, null, 'Sesión eliminada exitosamente');
};

/**
 * Iniciar una sesión de juego.
 * Cambia el status a 'active' y registra startedAt.
 *
 * POST /api/sessions/:id/start
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const startSession = async (req, res) => {
  const { id } = req.params;

  const session = await gameSessionRepository.findById(id);

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  // Verificar permisos
  if (session.createdBy.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('No tienes permiso para iniciar esta sesión');
  }

  // Permitir iniciar si es una sesión nueva o una sesión ya jugada (repetición)
  if (!['created', 'completed'].includes(session.status)) {
    throw new ValidationError('Solo se puede iniciar una sesión en estado created o completed');
  }

  if (!session.deckId) {
    throw new ValidationError('La sesión no tiene mazo asignado (deckId)');
  }

  // SIEMPRE sincronizar mapping antes de iniciar
  await gameSessionService.syncSessionFromDeck(session, {
    deckId: session.deckId,
    userId: req.user._id
  });

  const mechanic = await gameMechanicRepository.findById(session.mechanicId);
  if (!mechanic) {
    throw new NotFoundError('Mecánica de juego');
  }

  const mechanicName = normalizeMechanicName(mechanic?.name);

  if (mechanicName === 'association') {
    await ensureAssociationPlanReadyForStart(session);
  }

  ensureMemoryBoardLayoutIsComplete({
    mechanic,
    boardLayout: session.boardLayout,
    cardMappings: session.cardMappings
  });

  // Si era una sesión completada, limpiar endedAt al reiniciar
  if (session.status === 'completed') {
    session.endedAt = undefined;
    await session.save();
  }

  // Usar el método del modelo
  await session.start();

  logger.info('Sesión iniciada', {
    sessionId: session._id,
    startedBy: req.user._id
  });

  sendSuccess(res, toGameSessionDetailDTOV1(session), 'Sesión iniciada exitosamente');
};

/**
 * Finalizar una sesión.
 *
 * POST /api/sessions/:id/end
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const endSession = async (req, res) => {
  const { id } = req.params;

  const session = await gameSessionRepository.findById(id);

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  // Verificar permisos
  if (session.createdBy.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('No tienes permiso para finalizar esta sesión');
  }

  // Verificar que no haya partidas activas
  const activePlays = await gamePlayRepository.count({
    sessionId: session._id,
    status: { $in: ['in-progress', 'paused'] }
  });

  if (activePlays > 0) {
    throw new ConflictError(
      `No se puede finalizar la sesión: hay ${activePlays} partida(s) activa(s)`
    );
  }

  // Usar el método del modelo
  await session.end();

  logger.info('Sesión finalizada', {
    sessionId: session._id,
    endedBy: req.user._id
  });

  sendSuccess(res, toGameSessionDetailDTOV1(session), 'Sesión finalizada exitosamente');
};

/**
 * Clonar una sesión existente resincronizando contra el mazo actual.
 *
 * POST /api/sessions/:id/clone
 * Headers: Authorization: Bearer <token>
 * Body: {}
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const cloneSession = async (req, res) => {
  const { id } = req.params;

  const sourceSession = await gameSessionRepository.findById(id);
  if (!sourceSession) {
    throw new NotFoundError('Sesión de juego');
  }

  if (sourceSession.createdBy.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('No tienes permiso para clonar esta sesión');
  }

  const { clonedSession, mechanic, cardMappings } =
    await gameSessionService.cloneSessionFromExisting({
      sourceSession,
      userId: req.user._id
    });

  if (!isMechanicEnabledForSessionCreation(mechanic)) {
    throw new ValidationError(
      'La mecánica de la sesión original no está habilitada para creación de sesiones en el entorno actual.'
    );
  }

  validateConfigAgainstMechanicRules({
    mechanic,
    config: clonedSession.config
  });

  const mechanicName = normalizeMechanicName(mechanic?.name);

  applyCloneMechanicState({
    clonedSession,
    sourceSession,
    cardMappings,
    userId: req.user._id,
    mechanicName
  });

  clonedSession.status = 'created';
  clonedSession.startedAt = undefined;
  clonedSession.endedAt = undefined;

  await clonedSession.save();

  await clonedSession.populate([
    { path: 'mechanicId', select: 'name displayName icon' },
    { path: 'deckId', select: 'name status contextId' },
    { path: 'contextId', select: 'contextId name' },
    { path: 'createdBy', select: 'name email' }
  ]);

  logger.info('Sesión clonada', {
    sourceSessionId: sourceSession._id,
    clonedSessionId: clonedSession._id,
    mechanic: mechanic.name,
    cardMappingsCount: cardMappings.length,
    clonedBy: req.user._id
  });

  sendCreated(res, toGameSessionDetailDTOV1(clonedSession), buildCloneSuccessMessage(mechanicName));
};

module.exports = {
  getSessions,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
  startSession,
  endSession,
  cloneSession
};
