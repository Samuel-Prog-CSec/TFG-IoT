/**
 * @fileoverview Controller para gestión CRUD de sesiones de juego.
 * Maneja la configuración de sesiones con mecánicas, contextos y mapeo de tarjetas.
 * @module controllers/gameSessionController
 */

const GameSession = require('../models/GameSession');
const GameMechanic = require('../models/GameMechanic');
const GameContext = require('../models/GameContext');
const Card = require('../models/Card');
const CardDeck = require('../models/CardDeck');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');
const {
  toGameSessionDetailDTOV1,
  toGameSessionListDTOV1,
  toPaginatedDTOV1
} = require('../utils/dtos');

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
  const deck = await CardDeck.findById(deckId);
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

  const context = await GameContext.findById(deck.contextId);
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

    // Filtrar por sesiones del profesor actual (super_admin puede ver todas)
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
        .populate('deckId', 'name status contextId')
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
      ...toPaginatedDTOV1(toGameSessionListDTOV1(sessions), {
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

    // 1) Cargar sesión sin populate para poder sincronizar si aplica
    const session = await GameSession.findById(id);

    if (!session) {
      throw new NotFoundError('Sesión de juego');
    }

    // Verificar permisos: solo el creador o super admin
    if (
      session.createdBy.toString() !== req.user._id.toString() &&
      req.user.role !== 'super_admin'
    ) {
      throw new ForbiddenError('No tienes permiso para ver esta sesión');
    }

    // 2) Al "seleccionar" una sesión (ver detalle), sincronizar SIEMPRE desde el mazo
    // para evitar que se quede con mapeos antiguos.
    if (session.deckId) {
      await syncSessionFromDeck(session, { deckId: session.deckId, userId: session.createdBy });
      await session.save();
    }

    // 3) Populate final para respuesta completa
    await session.populate([
      { path: 'mechanicId', select: 'name displayName icon rules' },
      { path: 'deckId', select: 'name status contextId' },
      { path: 'contextId', select: 'contextId name assets' },
      { path: 'createdBy', select: 'name email' },
      { path: 'cardMappings.cardId', select: 'uid type status' }
    ]);

    res.json({
      success: true,
      data: toGameSessionDetailDTOV1(session)
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
 * Body: { mechanicId, contextId, config, cardMappings }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createSession = async (req, res, next) => {
  try {
    const { mechanicId, contextId, deckId, config = {}, cardMappings } = req.body;

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
    const mechanic = await GameMechanic.findById(mechanicId);
    if (!mechanic) {
      throw new NotFoundError('Mecánica de juego');
    }
    if (!mechanic.isActive) {
      throw new ValidationError('La mecánica seleccionada no está activa');
    }

    // La sesión se construye a partir del mazo
    const session = new GameSession({
      mechanicId,
      deckId,
      // contextId / cardMappings / numberOfCards se rellenan al sincronizar
      contextId: contextId || undefined,
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
    } = await syncSessionFromDeck(session, {
      deckId,
      userId: req.user._id
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
      mechanicId: mechanic.name,
      contextId: context.contextId,
      cardsCount: syncedMappings.length,
      deckId,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Sesión creada exitosamente',
      data: toGameSessionDetailDTOV1(session)
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
 * Body: { config? }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const updateSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { deckId, config } = req.body;

    const session = await GameSession.findById(id);

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

    if (!session.deckId) {
      throw new ValidationError('La sesión no tiene mazo asignado (deckId)');
    }

    // Regla: SIEMPRE sincronizar mapping con el mazo actual (aunque no haya cambiado).
    await syncSessionFromDeck(session, { deckId: session.deckId, userId: req.user._id });

    // Actualizar campos (excepto numberOfCards, que depende del mazo)
    if (config) {
      if (config.numberOfCards !== undefined) {
        throw new ValidationError('config.numberOfCards no se puede modificar: depende del mazo');
      }

      session.config = { ...session.config, ...config };
    }

    await session.save();

    logger.info('Sesión actualizada', {
      sessionId: session._id,
      updatedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Sesión actualizada exitosamente',
      data: toGameSessionDetailDTOV1(session)
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

    // Permitir iniciar si es una sesión nueva o una sesión ya jugada (repetición)
    if (!['created', 'completed'].includes(session.status)) {
      throw new ValidationError('Solo se puede iniciar una sesión en estado created o completed');
    }

    if (!session.deckId) {
      throw new ValidationError('La sesión no tiene mazo asignado (deckId)');
    }

    // SIEMPRE sincronizar mapping antes de iniciar
    await syncSessionFromDeck(session, { deckId: session.deckId, userId: req.user._id });

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

    res.json({
      success: true,
      message: 'Sesión iniciada exitosamente',
      data: toGameSessionDetailDTOV1(session)
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
      data: toGameSessionDetailDTOV1(session)
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
      data: toGameSessionDetailDTOV1(session)
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
