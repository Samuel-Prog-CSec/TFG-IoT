/**
 * @fileoverview Controller para gestión de partidas individuales (GamePlay).
 * Maneja las partidas de estudiantes, eventos y actualización de métricas.
 * @module controllers/gamePlayController
 */

const GamePlay = require('../models/GamePlay');
const GameSession = require('../models/GameSession');
const User = require('../models/User');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');
const {
  toGamePlayDetailDTOV1,
  toGamePlayListDTOV1,
  toPaginatedDTOV1,
  toPlayerStatsDTOV1
} = require('../utils/dtos');

/**
 * Obtener lista de partidas con paginación y filtros.
 *
 * GET /api/plays?page=1&sessionId=...&playerId=...&status=completed
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getPlays = async (req, res, next) => {
  try {
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

    // Construir filtro
    const filter = {};

    if (sessionId) {
      filter.sessionId = sessionId;
    }
    if (playerId) {
      filter.playerId = playerId;
    }
    if (status) {
      filter.status = status;
    }

    // Filtro de score range
    if (minScore !== undefined || maxScore !== undefined) {
      filter.score = {};
      if (minScore !== undefined) {
        filter.score.$gte = Number.parseInt(minScore, 10);
      }
      if (maxScore !== undefined) {
        filter.score.$lte = Number.parseInt(maxScore, 10);
      }
    }

    if (req.user.role === 'teacher') {
      if (sessionId) {
        const session = await GameSession.findById(sessionId).select('createdBy');
        if (!session || session.createdBy.toString() !== req.user._id.toString()) {
          throw new ForbiddenError('No tienes permiso para ver partidas de esta sesión');
        }
      } else {
        const sessions = await GameSession.find({ createdBy: req.user._id }).select('_id');
        filter.sessionId = { $in: sessions.map(s => s._id) };
      }
    }

    // Paginación
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

    // Ejecutar query con populate
    const [plays, total] = await Promise.all([
      GamePlay.find(filter)
        .populate('sessionId', 'mechanicId contextId config difficulty')
        .populate('playerId', 'name profile.age profile.classroom')
        .sort(sortOptions)
        .limit(Number.parseInt(limit, 10))
        .skip(skip),
      GamePlay.countDocuments(filter)
    ]);

    logger.info('Lista de partidas obtenida', {
      requestedBy: req.user._id,
      filters: filter,
      resultsCount: plays.length
    });

    res.json({
      success: true,
      ...toPaginatedDTOV1(toGamePlayListDTOV1(plays), {
        page: Number.parseInt(page, 10),
        limit: Number.parseInt(limit, 10),
        total
      })
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener una partida específica por ID.
 *
 * GET /api/plays/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getPlayById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const play = await GamePlay.findById(id)
      .populate({
        path: 'sessionId',
        populate: [
          { path: 'mechanicId', select: 'name displayName icon' },
          { path: 'contextId', select: 'contextId name assets' }
        ]
      })
      .populate('playerId', 'name profile');

    if (!play) {
      throw new NotFoundError('Partida');
    }

    const session = await GameSession.findById(play.sessionId._id).select('createdBy');
    const isCreator = session?.createdBy?.toString() === req.user._id.toString();

    if (!isCreator && req.user.role !== 'super_admin') {
      throw new ForbiddenError('No tienes permiso para ver esta partida');
    }

    res.json({
      success: true,
      data: toGamePlayDetailDTOV1(play)
    });
  } catch (error) {
    next(error);
  }
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
 * @param {import('express').NextFunction} next
 */
const createPlay = async (req, res, next) => {
  try {
    const { sessionId, playerId } = req.body;

    // Verificar que la sesión existe y está activa
    const session = await GameSession.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Sesión de juego');
    }

    if (!session.isActive()) {
      throw new ValidationError('La sesión no está activa');
    }

    // Verificar permisos: solo el creador de la sesión puede crear partidas
    if (session.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para crear partidas en esta sesión');
    }

    // Verificar que el jugador existe y es un estudiante
    const player = await User.findById(playerId);
    if (!player) {
      throw new NotFoundError('Jugador');
    }

    if (player.role !== 'student') {
      throw new ValidationError('Solo los estudiantes pueden jugar partidas');
    }

    // Verificar que no existe ya una partida activa para este jugador en esta sesión
    const existingPlay = await GamePlay.findOne({
      sessionId,
      playerId,
      status: { $in: ['in-progress', 'paused'] }
    });

    if (existingPlay) {
      throw new ValidationError('El jugador ya tiene una partida activa en esta sesión');
    }

    // Crear la partida
    const play = await GamePlay.create({
      sessionId,
      playerId,
      status: 'in-progress',
      score: 0,
      currentRound: 1
    });

    // Populate para respuesta
    await play.populate([
      { path: 'sessionId', select: 'mechanicId contextId config difficulty' },
      { path: 'playerId', select: 'name profile' }
    ]);

    logger.info('Partida creada', {
      playId: play._id,
      sessionId,
      playerId,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Partida creada exitosamente',
      data: toGamePlayDetailDTOV1(play)
    });
  } catch (error) {
    next(error);
  }
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
 * @param {import('express').NextFunction} next
 */
const pausePlay = async (req, res, next) => {
  try {
    const { id } = req.params;

    const play = await GamePlay.findById(id).populate('sessionId');
    if (!play) {
      throw new NotFoundError('Partida');
    }

    const session = play.sessionId;
    if (!session) {
      throw new ValidationError('La partida no tiene sesión asociada');
    }

    // Solo el creador de la sesión puede pausar/reanudar
    if (session.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para pausar esta partida');
    }

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

    const updated = await GamePlay.findById(id);

    res.json({
      success: true,
      message: 'Partida pausada',
      data: toGamePlayDetailDTOV1(updated)
    });
  } catch (error) {
    next(error);
  }
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
 * @param {import('express').NextFunction} next
 */
const resumePlay = async (req, res, next) => {
  try {
    const { id } = req.params;

    const play = await GamePlay.findById(id).populate('sessionId');
    if (!play) {
      throw new NotFoundError('Partida');
    }

    const session = play.sessionId;
    if (!session) {
      throw new ValidationError('La partida no tiene sesión asociada');
    }

    if (session.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para reanudar esta partida');
    }

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

    const updated = await GamePlay.findById(id);

    res.json({
      success: true,
      message: 'Partida reanudada',
      data: toGamePlayDetailDTOV1(updated)
    });
  } catch (error) {
    next(error);
  }
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
 * @param {import('express').NextFunction} next
 */
const addEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const eventData = req.body;

    const play = await GamePlay.findById(id);

    if (!play) {
      throw new NotFoundError('Partida');
    }

    if (!play.isInProgress()) {
      throw new ValidationError('La partida no está en progreso');
    }

    const session = await GameSession.findById(play.sessionId).select('createdBy');
    if (
      req.user.role !== 'super_admin' &&
      session?.createdBy?.toString() !== req.user._id.toString()
    ) {
      throw new ForbiddenError('No tienes permiso para registrar eventos en esta partida');
    }

    // Usar el método del modelo para añadir evento
    await play.addEvent(eventData);

    logger.info('Evento añadido a partida', {
      playId: play._id,
      eventType: eventData.eventType,
      roundNumber: eventData.roundNumber
    });

    res.json({
      success: true,
      message: 'Evento registrado exitosamente',
      data: {
        ...toGamePlayDetailDTOV1(play),
        event: eventData
      }
    });
  } catch (error) {
    next(error);
  }
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
 * @param {import('express').NextFunction} next
 */
const completePlay = async (req, res, next) => {
  try {
    const { id } = req.params;

    const play = await GamePlay.findById(id).populate('playerId').populate('sessionId');

    if (!play) {
      throw new NotFoundError('Partida');
    }

    if (!play.isInProgress()) {
      throw new ValidationError('La partida ya no está en progreso');
    }

    if (
      req.user.role !== 'super_admin' &&
      play.sessionId.createdBy.toString() !== req.user._id.toString()
    ) {
      throw new ForbiddenError('No tienes permiso para completar esta partida');
    }

    // Usar el método del modelo para completar
    await play.complete();

    // Actualizar métricas del estudiante
    const player = await User.findById(play.playerId._id);
    await player.updateStudentMetrics({
      score: play.score,
      correctAttempts: play.metrics.correctAttempts,
      errorAttempts: play.metrics.errorAttempts,
      averageResponseTime: play.metrics.averageResponseTime
    });

    logger.info('Partida completada', {
      playId: play._id,
      playerId: play.playerId._id,
      finalScore: play.score,
      completedAt: play.completedAt
    });

    res.json({
      success: true,
      message: 'Partida completada exitosamente',
      data: {
        ...toGamePlayDetailDTOV1(play),
        rating: calculateRating(play.score, play.sessionId.config.pointsPerCorrect)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Abandonar una partida.
 *
 * POST /api/plays/:id/abandon
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const abandonPlay = async (req, res, next) => {
  try {
    const { id } = req.params;

    const play = await GamePlay.findById(id);

    if (!play) {
      throw new NotFoundError('Partida');
    }

    if (!play.isInProgress()) {
      throw new ValidationError('La partida ya no está en progreso');
    }

    const session = await GameSession.findById(play.sessionId).select('createdBy');
    if (
      req.user.role !== 'super_admin' &&
      session?.createdBy?.toString() !== req.user._id.toString()
    ) {
      throw new ForbiddenError('No tienes permiso para abandonar esta partida');
    }

    // Cambiar status a abandoned
    play.status = 'abandoned';
    play.completedAt = new Date();
    await play.save();

    logger.info('Partida abandonada', {
      playId: play._id,
      playerId: play.playerId,
      abandonedAt: play.completedAt
    });

    res.json({
      success: true,
      message: 'Partida abandonada',
      data: toGamePlayDetailDTOV1(play)
    });
  } catch (error) {
    next(error);
  }
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
 * @param {import('express').NextFunction} next
 */
const getPlayerStats = async (req, res, next) => {
  try {
    const { playerId } = req.params;
    const { sessionId } = req.query;

    if (req.user.role === 'teacher') {
      const player = await User.findById(playerId).select('createdBy');
      if (!player || player.createdBy?.toString() !== req.user._id.toString()) {
        throw new ForbiddenError('No tienes permiso para ver estas estadísticas');
      }
    }

    const filter = { playerId, status: 'completed' };
    if (sessionId) {
      filter.sessionId = sessionId;
    }

    // Calcular estadísticas agregadas
    const stats = await GamePlay.aggregate([
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

    res.json({
      success: true,
      data: toPlayerStatsDTOV1({
        playerId,
        sessionId: sessionId || 'all',
        stats: result,
        accuracyRate: Number.parseFloat(accuracyRate)
      })
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper: Calcular rating basado en puntuación.
 *
 * @param {number} score - Puntuación final
 * @param {number} maxPointsPerRound - Puntos máximos por ronda
 * @param {number} rounds - Número total de rondas
 * @returns {string} Rating (⭐⭐⭐⭐⭐, ⭐⭐⭐⭐, etc.)
 */
function calculateRating(score, maxPointsPerRound, rounds) {
  const percentage = (score / (maxPointsPerRound * rounds)) * 100;

  if (percentage >= 90) {
    return '⭐⭐⭐⭐⭐';
  }
  if (percentage >= 75) {
    return '⭐⭐⭐⭐';
  }
  if (percentage >= 60) {
    return '⭐⭐⭐';
  }
  if (percentage >= 40) {
    return '⭐⭐';
  }
  return '⭐';
}

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
