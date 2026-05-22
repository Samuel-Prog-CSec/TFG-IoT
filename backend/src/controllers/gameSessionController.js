/**
 * @fileoverview Controller para gestión CRUD de sesiones de juego.
 * Maneja la configuración de sesiones con mecánicas, contextos y mapeo de tarjetas.
 * Los helpers de validación y normalización se encuentran en helpers/sessionValidationHelpers.js.
 * @module controllers/gameSessionController
 */

const gameSessionRepository = require('../repositories/gameSessionRepository');
const gameMechanicRepository = require('../repositories/gameMechanicRepository');
const gameSessionService = require('../services/gameSessionService');
const gamePlayService = require('../services/gamePlayService');
const {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError
} = require('../utils/errors');
const { ensureResourceOwnership } = require('../utils/ownershipHelpers');
const logger = require('../utils/logger');
const { toGameSessionDetailDTOV1, toGameSessionListDTOV1 } = require('../utils/dtos');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/responseHelper');
const { buildFilter } = require('../utils/filterBuilder');
const {
  normalizeMechanicName,
  isMechanicEnabledForSessionCreation,
  validateConfigAgainstMechanicRules,
  ensureMemoryBoardLayoutIsComplete,
  normalizeBoardLayout,
  validateBoardLayoutAgainstMappings,
  applyAssociationPlanOnUpdate,
  applySequencePlanOnUpdate,
  ensureAssociationPlanReadyForStart,
  applyCloneMechanicState,
  buildCloneSuccessMessage
} = require('./helpers/sessionValidationHelpers');

const sessionFilterMappings = {
  mechanicId: { field: 'mechanicId', type: 'exact' },
  contextId: { field: 'contextId', type: 'exact' },
  status: { field: 'status', type: 'exact' },
  difficulty: { field: 'difficulty', type: 'exact' },
  createdBy: { field: 'createdBy', type: 'exact' }
};

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

  // Los profesores ven todas sus sesiones, los alumnos no deberían acceder
  if (req.user.role === 'student') {
    throw new ForbiddenError('Los alumnos no pueden acceder a sesiones directamente');
  }

  // Construir filtro
  const filter = buildFilter(
    { mechanicId, contextId, status, difficulty, createdBy },
    sessionFilterMappings
  );

  // Teachers can only see their own sessions — override any createdBy from query
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
        'name mechanicId deckId contextId createdBy config status difficulty startedAt endedAt createdAt updatedAt',
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

  // Aggregate play stats per session (count + average score)
  const sessionIds = sessions.map(s => s._id || s.id);
  const playStatsMap = await gamePlayService.getPlayStatsBySessionIds(sessionIds);

  // Attach playStats to each session before DTO conversion
  for (const s of sessions) {
    const sid = (s._id || s.id).toString();
    s.playStats = playStatsMap[sid] || null;
  }

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
      'name mechanicId deckId contextId createdBy config cardMappings boardLayout associationChallengePlan requiresAssociationPlanConfiguration status difficulty startedAt endedAt createdAt updatedAt',
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
    name,
    config,
    difficulty,
    cardMappings,
    boardLayout,
    associationChallengePlan,
    sequencePlan,
    sequenceConfig
  } = req.body;

  if (cardMappings) {
    throw new ValidationError(
      'cardMappings no se acepta: la sesión toma el mapping desde el mazo (deckId)'
    );
  }
  if (!deckId) {
    throw new ValidationError('deckId es requerido para crear una sesión');
  }

  const session = await gameSessionService.createSessionFromDeck({
    mechanicId,
    deckId,
    sensorId,
    name,
    config,
    contextId,
    boardLayout,
    associationChallengePlan,
    sequencePlan,
    sequenceConfig,
    createdBy: req.user._id
  });

  // Si el profesor seleccionó una dificultad, sobrescribir el valor auto-calculado por el pre-save hook
  if (difficulty) {
    session.difficulty = difficulty;
    await session.save({ validateBeforeSave: false });
  }

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
  const {
    deckId,
    sensorId,
    name,
    config,
    difficulty,
    boardLayout,
    associationChallengePlan,
    sequencePlan,
    sequenceConfig
  } = req.body;

  const session = await gameSessionRepository.findById(id);

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  ensureResourceOwnership(session, req.user._id, 'sesión');

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

  if (name !== undefined) {
    session.name = name;
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

  applySequencePlanOnUpdate({
    session,
    mechanicName,
    sequencePlan,
    sequenceConfig
  });

  ensureMemoryBoardLayoutIsComplete({
    mechanic,
    boardLayout: session.boardLayout,
    cardMappings: session.cardMappings
  });

  await session.save();

  // Si se proporcionó dificultad explícita, sobrescribir el valor auto-calculado por el pre-save hook
  if (difficulty !== undefined) {
    session.difficulty = difficulty;
    await session.save({ validateBeforeSave: false });
  }

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

  ensureResourceOwnership(session, req.user._id, 'sesión');

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

  const session = await gameSessionRepository.findById(id, {
    populate: [{ path: 'mechanicId', select: 'name displayName icon rules' }]
  });

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  ensureResourceOwnership(session, req.user._id, 'sesión');

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

  ensureResourceOwnership(session, req.user._id, 'sesión');

  // Verificar que no haya partidas activas
  const activePlays = await gamePlayService.countActivePlays(session._id);

  if (activePlays > 0) {
    // Concordancia singular/plural (QA 2026-05-21).
    const isSingular = activePlays === 1;
    const playWord = isSingular ? 'partida' : 'partidas';
    const adjWord = isSingular ? 'activa' : 'activas';
    throw new ConflictError(
      `No se puede finalizar la sesión: hay ${activePlays} ${playWord} ${adjWord}`
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

  ensureResourceOwnership(sourceSession, req.user._id, 'sesión');

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
