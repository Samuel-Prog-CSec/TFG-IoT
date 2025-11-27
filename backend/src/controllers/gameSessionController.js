/**
 * @fileoverview Controller para gestión CRUD de sesiones de juego.
 * Maneja la configuración de sesiones con mecánicas, contextos y mapeo de tarjetas.
 * @module controllers/gameSessionController
 */

const GameSession = require('../models/GameSession');
const GameMechanic = require('../models/GameMechanic');
const GameContext = require('../models/GameContext');
const Card = require('../models/Card');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');
const { gameSessionDTO, gameSessionListDTO, paginationDTO } = require('../utils/dtos');

/**
 * Obtener lista de sesiones con paginación y filtros.
 *
 * GET /api/sessions?page=1&status=active&mechanicId=...&contextId=...
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getSessions = async (req, res, next) => {
  try {
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

    if (mechanicId) filter.mechanicId = mechanicId;
    if (contextId) filter.contextId = contextId;
    if (status) filter.status = status;
    if (difficulty) filter.difficulty = difficulty;
    if (createdBy) filter.createdBy = createdBy;

    // Los profesores ven todas sus sesiones, los alumnos no deberían acceder
    if (req.user.role === 'student') {
      throw new ForbiddenError('Los alumnos no pueden acceder a sesiones directamente');
    }

    // Filtrar por sesiones del profesor actual si no es admin
    if (req.user.role === 'teacher' && !createdBy) {
      filter.createdBy = req.user._id;
    }

    // Paginación
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

    // Ejecutar query con populate
    const [sessions, total] = await Promise.all([
      GameSession.find(filter)
        .populate('mechanicId', 'name displayName icon')
        .populate('contextId', 'contextId name')
        .populate('createdBy', 'name email')
        .sort(sortOptions)
        .limit(parseInt(limit))
        .skip(skip),
      GameSession.countDocuments(filter)
    ]);

    logger.info('Lista de sesiones obtenida', {
      requestedBy: req.user._id,
      filters: filter,
      resultsCount: sessions.length
    });

    res.json({
      success: true,
      data: paginationDTO(gameSessionListDTO(sessions), {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      })
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener una sesión específica por ID.
 *
 * GET /api/sessions/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getSessionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await GameSession.findById(id)
      .populate('mechanicId', 'name displayName icon rules')
      .populate('contextId', 'contextId name assets')
      .populate('createdBy', 'name email')
      .populate('cardMappings.cardId', 'uid type status metadata');

    if (!session) {
      throw new NotFoundError('Sesión de juego');
    }

    // Verificar permisos: solo el creador o admin
    if (session.createdBy._id.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin') {
      throw new ForbiddenError('No tienes permiso para ver esta sesión');
    }

    res.json({
      success: true,
      data: gameSessionDTO(session)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Crear una nueva sesión de juego.
 *
 * POST /api/sessions
 * Headers: Authorization: Bearer <token>
 * Body: { mechanicId, contextId, config, cardMappings, difficulty? }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createSession = async (req, res, next) => {
  try {
    const { mechanicId, contextId, config, cardMappings, difficulty } = req.body;

    // Verificar que la mecánica existe y está activa
    const mechanic = await GameMechanic.findById(mechanicId);
    if (!mechanic) {
      throw new NotFoundError('Mecánica de juego');
    }
    if (!mechanic.isActive) {
      throw new ValidationError('La mecánica seleccionada no está activa');
    }

    // Verificar que el contexto existe
    const context = await GameContext.findById(contextId);
    if (!context) {
      throw new NotFoundError('Contexto de juego');
    }

    // Verificar que hay suficientes assets en el contexto
    if (context.assets.length < config.numberOfCards) {
      throw new ValidationError(
        `El contexto solo tiene ${context.assets.length} assets, ` +
        `pero se requieren ${config.numberOfCards}`
      );
    }

    // Verificar que todas las tarjetas existen y están activas
    const cardIds = cardMappings.map(mapping => mapping.cardId);
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

    // Crear la sesión
    const session = await GameSession.create({
      mechanicId,
      contextId,
      config,
      cardMappings,
      difficulty: difficulty || 'medium',
      status: 'created',
      createdBy: req.user._id
    });

    // Populate para respuesta completa
    await session.populate([
      { path: 'mechanicId', select: 'name displayName icon' },
      { path: 'contextId', select: 'contextId name' },
      { path: 'createdBy', select: 'name email' }
    ]);

    logger.info('Sesión creada', {
      sessionId: session._id,
      mechanicId: mechanic.name,
      contextId: context.contextId,
      cardsCount: cardMappings.length,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Sesión creada exitosamente',
      data: gameSessionDTO(session)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Actualizar una sesión existente.
 * Solo se puede actualizar si no ha iniciado.
 *
 * PUT /api/sessions/:id
 * Headers: Authorization: Bearer <token>
 * Body: { config?, difficulty? }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const updateSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { config, difficulty } = req.body;

    const session = await GameSession.findById(id);

    if (!session) {
      throw new NotFoundError('Sesión de juego');
    }

    // Verificar permisos
    if (session.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para actualizar esta sesión');
    }

    // Solo se puede actualizar si no ha iniciado
    if (session.status !== 'created') {
      throw new ValidationError('Solo se pueden actualizar sesiones que no han iniciado');
    }

    // Actualizar campos
    if (config) {
      session.config = { ...session.config, ...config };
    }
    if (difficulty) {
      session.difficulty = difficulty;
    }

    await session.save();

    logger.info('Sesión actualizada', {
      sessionId: session._id,
      updatedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Sesión actualizada exitosamente',
      data: gameSessionDTO(session)
    });
  } catch (error) {
    next(error);
  }
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
 * @param {import('express').NextFunction} next
 */
const deleteSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await GameSession.findById(id);

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

    res.json({
      success: true,
      message: 'Sesión eliminada exitosamente'
    });
  } catch (error) {
    next(error);
  }
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
 * @param {import('express').NextFunction} next
 */
const startSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await GameSession.findById(id);

    if (!session) {
      throw new NotFoundError('Sesión de juego');
    }

    // Verificar permisos
    if (session.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para iniciar esta sesión');
    }

    // Usar el método del modelo
    await session.start();

    logger.info('Sesión iniciada', {
      sessionId: session._id,
      startedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Sesión iniciada exitosamente',
      data: gameSessionDTO(session)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Pausar una sesión activa.
 *
 * POST /api/sessions/:id/pause
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const pauseSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await GameSession.findById(id);

    if (!session) {
      throw new NotFoundError('Sesión de juego');
    }

    // Verificar permisos
    if (session.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para pausar esta sesión');
    }

    // Usar el método del modelo
    await session.pause();

    logger.info('Sesión pausada', {
      sessionId: session._id,
      pausedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Sesión pausada exitosamente',
      data: gameSessionDTO(session)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Finalizar una sesión.
 *
 * POST /api/sessions/:id/end
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const endSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await GameSession.findById(id);

    if (!session) {
      throw new NotFoundError('Sesión de juego');
    }

    // Verificar permisos
    if (session.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para finalizar esta sesión');
    }

    // Usar el método del modelo
    await session.end();

    logger.info('Sesión finalizada', {
      sessionId: session._id,
      endedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Sesión finalizada exitosamente',
      data: gameSessionDTO(session)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSessions,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
  startSession,
  pauseSession,
  endSession
};
