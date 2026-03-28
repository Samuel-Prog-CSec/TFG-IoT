/**
 * @fileoverview Controller para gestión de partidas individuales (GamePlay).
 * Maneja las partidas de estudiantes, eventos y actualización de métricas.
 * @module controllers/gamePlayController
 */

const gamePlayRepository = require('../repositories/gamePlayRepository');
const gameSessionRepository = require('../repositories/gameSessionRepository');
const userRepository = require('../repositories/userRepository');
const gamePlayService = require('../services/gamePlayService');
const { recalculateSessionStatusFromPlays } = require('../services/sessionStatusService');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const {
  ensureResourceOwnership,
  ensureResourceOwnershipOrAdmin,
  ensureStudentBelongsToTeacher
} = require('../utils/ownershipHelpers');
const logger = require('../utils/logger');
const { toGamePlayDetailDTOV1, toGamePlayListDTOV1, toPlayerStatsDTOV1 } = require('../utils/dtos');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/responseHelper');
const { buildFilter } = require('../utils/filterBuilder');

const playFilterMappings = {
  sessionId: { field: 'sessionId', type: 'exact' },
  playerId: { field: 'playerId', type: 'exact' },
  status: { field: 'status', type: 'exact' },
  score: {
    field: 'score',
    type: 'range',
    minParam: 'minScore',
    maxParam: 'maxScore',
    transform: v => Number.parseInt(v, 10)
  }
};

const applyTeacherScopeToPlayFilter = async ({ user, sessionId, filter }) => {
  if (user.role !== 'teacher') {
    return;
  }

  if (sessionId) {
    const session = await gameSessionRepository.findById(sessionId, {
      select: 'createdBy'
    });
    if (!session || session.createdBy.toString() !== user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para ver partidas de esta sesión');
    }
    return;
  }

  const sessions = await gameSessionRepository.find({ createdBy: user._id }, { select: '_id' });
  filter.sessionId = { $in: sessions.map(s => s._id) };
};

const buildSortOptions = (sortBy, order) => ({
  [sortBy]: order === 'asc' ? 1 : -1
});

/**
 * Obtener lista de partidas con paginación y filtros.
 *
 * GET /api/plays?page=1&sessionId=...&playerId=...&status=completed
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getPlays = async (req, res) => {
  const {
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    order = 'desc',
    sessionId,
    playerId,
    status,
    minScore,
    maxScore
  } = req.query;

  const filter = buildFilter(
    { sessionId, playerId, status, minScore, maxScore },
    playFilterMappings
  );

  await applyTeacherScopeToPlayFilter({
    user: req.user,
    sessionId,
    filter
  });

  // Paginación
  const skip = (page - 1) * limit;
  const sortOptions = buildSortOptions(sortBy, order);

  // Ejecutar query con populate
  const [plays, total] = await Promise.all([
    gamePlayRepository.find(filter, {
      populate: [
        { path: 'sessionId', select: 'mechanicId contextId config difficulty' },
        { path: 'playerId', select: 'name profile.age profile.classroom' }
      ],
      sort: sortOptions,
      limit: Number.parseInt(limit, 10),
      skip
    }),
    gamePlayRepository.count(filter)
  ]);

  logger.info('Lista de partidas obtenida', {
    requestedBy: req.user._id,
    filters: filter,
    resultsCount: plays.length
  });

  sendPaginated(res, toGamePlayListDTOV1(plays), {
    page: Number.parseInt(page, 10),
    limit: Number.parseInt(limit, 10),
    total
  });
};

/**
 * Obtener una partida específica por ID.
 *
 * GET /api/plays/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getPlayById = async (req, res) => {
  const { id } = req.params;

  const play = await gamePlayRepository.findById(id, {
    populate: [
      {
        path: 'sessionId',
        populate: [
          { path: 'mechanicId', select: 'name displayName icon' },
          { path: 'contextId', select: 'contextId name assets' }
        ]
      },
      { path: 'playerId', select: 'name profile' }
    ]
  });

  if (!play) {
    throw new NotFoundError('Partida');
  }

  const session = await gameSessionRepository.findById(play.sessionId._id, {
    select: 'createdBy'
  });
  ensureResourceOwnershipOrAdmin(session, req.user, 'partida');

  sendSuccess(res, toGamePlayDetailDTOV1(play));
};

/**
 * Crear una nueva partida.
 * El profesor crea partidas para sus alumnos.
 *
 * POST /api/plays
 * Headers: Authorization: Bearer <token>
 * Body: { sessionId, playerId }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createPlay = async (req, res) => {
  const { sessionId, playerId } = req.body;

  const play = await gamePlayService.createPlay({
    sessionId,
    playerId,
    creatorId: req.user._id
  });

  sendCreated(res, toGamePlayDetailDTOV1(play), 'Partida creada exitosamente');
};

/**
 * Pausar una partida en curso.
 * Congela el timer de la ronda actual (vía GameEngine) y persiste pausedAt/remainingTime.
 *
 * POST /api/plays/:id/pause
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const pausePlay = async (req, res) => {
  const { id } = req.params;

  const play = await gamePlayRepository.findById(id, { populate: 'sessionId' });
  if (!play) {
    throw new NotFoundError('Partida');
  }

  const session = play.sessionId;
  if (!session) {
    throw new ValidationError('La partida no tiene sesión asociada');
  }

  // Solo el creador de la sesión puede pausar/reanudar
  ensureResourceOwnership(session, req.user._id, 'partida');

  if (play.status !== 'in-progress') {
    throw new ValidationError('La partida no está en progreso');
  }

  const gameEngine = req.app.get('gameEngine');
  if (!gameEngine) {
    throw new ValidationError('Motor de juego no disponible');
  }

  // Pausar en el motor (con control de permisos)
  const result = await gameEngine.pausePlayInternal(id, { requestedBy: req.user._id.toString() });
  if (result.remainingTimeMs === null && play.status !== 'paused') {
    // Si no estaba activa en memoria, no podemos congelar el timer.
    throw new ValidationError('La partida no está activa en el motor de juego');
  }

  const updated = await gamePlayRepository.findById(id);

  sendSuccess(res, toGamePlayDetailDTOV1(updated), 'Partida pausada');
};

/**
 * Reanudar una partida pausada.
 * Rearma el timer con el tiempo restante (vía GameEngine) y limpia pausedAt/remainingTime.
 *
 * POST /api/plays/:id/resume
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const resumePlay = async (req, res) => {
  const { id } = req.params;

  const play = await gamePlayRepository.findById(id, { populate: 'sessionId' });
  if (!play) {
    throw new NotFoundError('Partida');
  }

  const session = play.sessionId;
  if (!session) {
    throw new ValidationError('La partida no tiene sesión asociada');
  }

  ensureResourceOwnership(session, req.user._id, 'partida');

  if (play.status !== 'paused') {
    throw new ValidationError('La partida no está pausada');
  }

  const gameEngine = req.app.get('gameEngine');
  if (!gameEngine) {
    throw new ValidationError('Motor de juego no disponible');
  }

  const result = await gameEngine.resumePlayInternal(id, {
    requestedBy: req.user._id.toString()
  });
  if (result.remainingTimeMs === null && play.status === 'paused') {
    throw new ValidationError('La partida no está activa en el motor de juego');
  }

  const updated = await gamePlayRepository.findById(id);

  sendSuccess(res, toGamePlayDetailDTOV1(updated), 'Partida reanudada');
};

/**
 * Añadir un evento a una partida.
 * Usado por el GameEngine cuando el alumno escanea una tarjeta.
 *
 * POST /api/plays/:id/events
 * Body: { eventType, cardUid?, expectedValue?, actualValue?, pointsAwarded?, timeElapsed?, roundNumber? }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const addEvent = async (req, res) => {
  const { id } = req.params;
  const eventData = req.body;

  const play = await gamePlayRepository.findById(id);

  if (!play) {
    throw new NotFoundError('Partida');
  }

  if (!play.isInProgress()) {
    throw new ValidationError('La partida no está en progreso');
  }

  const session = await gameSessionRepository.findById(play.sessionId, {
    select: 'createdBy'
  });
  ensureResourceOwnershipOrAdmin(session, req.user, 'partida');

  // Usar el método del modelo para añadir evento
  await play.addEvent(eventData);

  logger.info('Evento añadido a partida', {
    playId: play._id,
    eventType: eventData.eventType,
    roundNumber: eventData.roundNumber
  });

  sendSuccess(
    res,
    { ...toGamePlayDetailDTOV1(play), event: eventData },
    'Evento registrado exitosamente'
  );
};

/**
 * Completar una partida.
 * Calcula métricas finales y actualiza User.studentMetrics.
 *
 * POST /api/plays/:id/complete
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const completePlay = async (req, res) => {
  const { id } = req.params;

  const play = await gamePlayRepository.findById(id, {
    populate: [{ path: 'sessionId', select: 'createdBy' }]
  });

  if (!play) {
    throw new NotFoundError('Partida');
  }

  ensureResourceOwnershipOrAdmin(play.sessionId, req.user, 'partida');

  const result = await gamePlayService.completePlay(id);

  sendSuccess(
    res,
    { ...toGamePlayDetailDTOV1(result.play), rating: result.rating },
    'Partida completada exitosamente'
  );
};

/**
 * Abandonar una partida.
 *
 * POST /api/plays/:id/abandon
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const abandonPlay = async (req, res) => {
  const { id } = req.params;

  const play = await gamePlayRepository.findById(id);

  if (!play) {
    throw new NotFoundError('Partida');
  }

  if (!play.isInProgress()) {
    throw new ValidationError('La partida ya no está en progreso');
  }

  const session = await gameSessionRepository.findById(play.sessionId, {
    select: 'createdBy'
  });
  ensureResourceOwnershipOrAdmin(session, req.user, 'partida');

  // Cambiar status a abandoned
  play.status = 'abandoned';
  play.completedAt = new Date();
  await play.save();
  await recalculateSessionStatusFromPlays(play.sessionId);

  // Limpiar estado del motor si la partida está activa (timers, Redis, cards)
  const gameEngine = req.app.get('gameEngine');
  if (gameEngine) {
    // Limpieza graceful del engine — fallo no crítico no debe propagarse
    try {
      await gameEngine.endPlay(id);
    } catch (engineErr) {
      logger.warn('No se pudo limpiar la partida del motor al abandonar', {
        playId: id,
        error: engineErr.message
      });
    }
  }

  logger.info('Partida abandonada', {
    playId: play._id,
    playerId: play.playerId,
    abandonedAt: play.completedAt
  });

  sendSuccess(res, toGamePlayDetailDTOV1(play), 'Partida abandonada');
};

/**
 * Obtener estadísticas de un jugador.
 *
 * GET /api/plays/stats/:playerId
 * Query: ?sessionId=... (opcional para filtrar por sesión)
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getPlayerStats = async (req, res) => {
  const { playerId } = req.params;
  const { sessionId } = req.query;

  await ensureStudentBelongsToTeacher(playerId, req.user, userRepository);

  const filter = { playerId, status: 'completed' };
  if (sessionId) {
    filter.sessionId = sessionId;
  }

  // Calcular estadísticas agregadas
  const stats = await gamePlayRepository.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalPlays: { $sum: 1 },
        totalScore: { $sum: '$score' },
        averageScore: { $avg: '$score' },
        bestScore: { $max: '$score' },
        worstScore: { $min: '$score' },
        totalCorrect: { $sum: '$metrics.correctAttempts' },
        totalErrors: { $sum: '$metrics.errorAttempts' },
        averageResponseTime: { $avg: '$metrics.averageResponseTime' },
        totalCompletionTime: { $sum: '$metrics.completionTime' }
      }
    }
  ]);

  const result = stats[0] || {
    totalPlays: 0,
    totalScore: 0,
    averageScore: 0,
    bestScore: 0,
    worstScore: 0,
    totalCorrect: 0,
    totalErrors: 0,
    averageResponseTime: 0,
    totalCompletionTime: 0
  };

  delete result._id;

  // Calcular tasa de acierto
  const accuracyRate =
    result.totalCorrect + result.totalErrors > 0
      ? ((result.totalCorrect / (result.totalCorrect + result.totalErrors)) * 100).toFixed(2)
      : 0;

  sendSuccess(
    res,
    toPlayerStatsDTOV1({
      playerId,
      sessionId: sessionId || 'all',
      stats: result,
      accuracyRate: Number.parseFloat(accuracyRate)
    })
  );
};

module.exports = {
  getPlays,
  getPlayById,
  createPlay,
  addEvent,
  completePlay,
  abandonPlay,
  pausePlay,
  resumePlay,
  getPlayerStats
};
