/**
 * @fileoverview Controller para gestión de partidas individuales (GamePlay).
 * Maneja las partidas de estudiantes, eventos y actualización de métricas.
 * @module controllers/gamePlayController
 */

const gamePlayRepository = require('../repositories/gamePlayRepository');
const gameSessionRepository = require('../repositories/gameSessionRepository');
const userRepository = require('../repositories/userRepository');
const gamePlayService = require('../services/gamePlayService');
const {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError
} = require('../utils/errors');
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

  // Reutilizamos el helper cacheado (TTL 300s, invalidado por gameSessionService
  // al crear/archivar/eliminar sesiones del profesor) en lugar de re-consultar
  // game_sessions en CADA GET /api/plays. Devuelve ObjectId, válidos para el $in.
  // Lazy require: evita acoplar el controller a analyticsService al cargar módulo.
  const { getTeacherSessionIds } = require('../services/analyticsService');
  filter.sessionId = { $in: await getTeacherSessionIds(user._id.toString()) };
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
    // Orden por defecto `_id` (no `createdAt`): en `gameplays` NINGÚN índice
    // cubre `createdAt`, así que ordenar por él fuerza un SORT bloqueante en
    // memoria (peligroso en Atlas M0 con RAM escasa y el límite de 32MB de sort).
    // `_id` es un ObjectId monotónico que embebe el timestamp de creación → mismo
    // orden visible (más reciente primero) pero recorriendo el índice `_id`
    // siempre presente, sin sort en memoria.
    limit = 20,
    sortBy = '_id',
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
      // El DTO de listado (toGamePlayDTOV1) no usa `events[]` (solo el detalle lo
      // incluye). Excluir el array — hasta 500 sub-docs por partida — evita arrastrar
      // miles de eventos Mongo→Node por página que el DTO descarta. Proyección negativa.
      select: '-events',
      populate: [
        { path: 'sessionId', select: 'mechanicId contextId config difficulty' },
        { path: 'playerId', select: 'name profile.age profile.classroom' }
      ],
      sort: sortOptions,
      // page/limit ya son number (paginationSchema); sin re-parse.
      limit,
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
    page,
    limit,
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
        // T-907 INT6: select acotado al subset que `toGamePlayDTOV1` consume
        // (mechanicId, contextId, config, difficulty) — el populate original
        // traía todos los campos de GameSession (cardMappings, audit, etc.)
        // que el DTO descarta. Reduce ~30% bytes en este endpoint.
        // Incluimos también `createdBy` (no se expone en el DTO) para resolver
        // la ownership con el documento ya poblado y evitar una 2ª query a
        // game_sessions por cada GET /api/plays/:id.
        path: 'sessionId',
        select: 'mechanicId contextId config difficulty createdBy',
        populate: [
          { path: 'mechanicId', select: 'name displayName icon' },
          // (G3) NO poblar `assets`: el DTO de GamePlay solo emite `contextId` como
          // _id (toId), nunca el array de assets — que podía traer hasta 30 entradas
          // con URLs/metadata Mongo→Node en CADA GET /api/plays/:id para descartarlas.
          { path: 'contextId', select: 'contextId name' }
        ]
      },
      { path: 'playerId', select: 'name profile' }
    ]
  });

  if (!play) {
    throw new NotFoundError('Partida');
  }

  // Ownership directo sobre la sesión ya poblada (incluye createdBy): sin
  // round-trip adicional. Si la sesión fue eliminada (partida huérfana),
  // play.sessionId es null y el helper rechaza con el error apropiado.
  ensureResourceOwnershipOrAdmin(play.sessionId, req.user, 'partida');

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
    creatorId: req.user._id,
    creatorRole: req.user.role
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

  // T-907 INT6: solo necesitamos `createdBy` para `ensureResourceOwnership`;
  // el populate antes traía toda la sesión incluyendo `cardMappings` (hasta
  // 50 entries con UID, display, sensorId…). Con el select acotado pasamos
  // de ~10 KB de payload Mongo a <100 B en el documento populated.
  const play = await gamePlayRepository.findById(id, {
    populate: { path: 'sessionId', select: 'createdBy' }
  });
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

  // Populate acotado: el handler solo necesita `createdBy` (ownership) y
  // `config` (re-armado del timer en el GameEngine). El populate sin select
  // traía la sesión completa (cardMappings[], boardLayout[], sequencePlan[]…),
  // inflando ~10-30× los bytes Mongo→Node en cada reanudación.
  const play = await gamePlayRepository.findById(id, {
    populate: { path: 'sessionId', select: 'createdBy config' }
  });
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

  // Guard de finalización ÚNICA: si el motor de juego gestiona esta partida en
  // vivo, la autoridad de cierre es `endPlay` (el flujo real por socket, que
  // aplica `updateStudentMetrics`). Finalizar también aquí en paralelo abriría un
  // TOCTOU con el `isInProgress()` del service → doble `updateStudentMetrics`
  // sobre un menor (media corrompida, irrecuperable). El frontend NO usa este
  // endpoint; es defensa del borde alcanzable. Dejamos que el motor la cierre.
  const gameEngine = req.app.get('gameEngine');
  if (gameEngine?.getPlayRuntimeContext?.(id)) {
    throw new ConflictError(
      'La partida está activa en el motor de juego; se cerrará automáticamente al finalizar.'
    );
  }

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

  // (I5) Ownership sobre la sesión ya poblada (paridad con completePlay): la lógica
  // de dominio (marcar abandonada + recalc) se delega en gamePlayService.abandonPlay.
  const owned = await gamePlayRepository.findById(id, {
    populate: [{ path: 'sessionId', select: 'createdBy' }]
  });

  if (!owned) {
    throw new NotFoundError('Partida');
  }

  ensureResourceOwnershipOrAdmin(owned.sessionId, req.user, 'partida');

  // Bug #1 / DB-9: UN SOLO camino de abandono, sin doble contabilización.
  //  - Si la partida sigue VIVA en el motor, es el motor quien la finaliza como
  //    abandonada: `endPlay({abandoned:true})` marca status, hace
  //    `recordAbandonedGame`, recalcula el estado de la sesión, libera timers/tarjetas
  //    y emite `game_over`. (Antes se llamaba a `service.abandonPlay` Y a
  //    `endPlay()` SIN `abandoned`: el segundo re-procesaba la partida como
  //    `complete()` → status 'completed' que SOBREESCRIBÍA el 'abandoned' y contaba la
  //    partida en `averageScore` a la vez que el service la contaba en
  //    `totalAbandonedGames`. Bug latente que el fix de salida del frontend activaría.)
  //  - Si NO está en el motor (huérfana ya limpiada, o entorno de test sin motor), el
  //    service hace el trabajo de dominio (status + recordAbandonedGame + recalc).
  const gameEngine = req.app.get('gameEngine');
  const inEngine = Boolean(gameEngine?.activePlays?.has?.(id));

  let play = null;
  if (inEngine) {
    try {
      await gameEngine.endPlay(id, { abandoned: true });
      play = await gamePlayRepository.findById(id, {
        populate: [{ path: 'sessionId', select: 'createdBy' }]
      });
    } catch (engineErr) {
      logger.warn('No se pudo abandonar la partida vía motor; degradando al service', {
        playId: id,
        error: engineErr.message
      });
    }
  }
  // Fallback: no estaba en el motor, o el motor no consiguió cambiar el status.
  // `service.abandonPlay` exige `in-progress`, así que solo lo invocamos si sigue así.
  if (!play || play.status === 'in-progress') {
    play = await gamePlayService.abandonPlay(id);
  }

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

  const data = await gamePlayService.getPlayerStats(playerId, sessionId || null);

  sendSuccess(res, toPlayerStatsDTOV1(data));
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
