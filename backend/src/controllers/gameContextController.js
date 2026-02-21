/**
 * @fileoverview Controller para gestión CRUD de contextos de juego.
 * Maneja contextos temáticos con sus assets (geografía, animales, colores, etc.).
 * @module controllers/gameContextController
 */

const gameContextRepository = require('../repositories/gameContextRepository');
const gameSessionRepository = require('../repositories/gameSessionRepository');
const gamePlayRepository = require('../repositories/gamePlayRepository');
const cardDeckRepository = require('../repositories/cardDeckRepository');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');
const {
  toGameContextDetailDTOV1,
  toGameContextListDTOV1,
  toPaginatedDTOV1
} = require('../utils/dtos');
const { escapeRegex } = require('../utils/escapeRegex');

const ACTIVE_SESSION_STATUSES = ['created', 'active'];
const ACTIVE_PLAY_STATUSES = ['in-progress', 'paused'];

const getActiveContextDependencies = async contextId => {
  const [activeDecks, activeSessions] = await Promise.all([
    cardDeckRepository.count({ contextId, status: 'active' }),
    gameSessionRepository.find(
      {
        contextId,
        status: { $in: ACTIVE_SESSION_STATUSES }
      },
      {
        select: '_id',
        lean: true
      }
    )
  ]);

  let activePlays = 0;
  if (activeSessions.length > 0) {
    activePlays = await gamePlayRepository.count({
      sessionId: { $in: activeSessions.map(session => session._id) },
      status: { $in: ACTIVE_PLAY_STATUSES }
    });
  }

  return {
    activeDecks,
    activeSessions: activeSessions.length,
    activePlays
  };
};

/**
 * Obtener lista de contextos con paginación y filtros.
 *
 * GET /api/contexts?page=1&limit=20&sortBy=name&search=geo
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getContexts = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc',
      search,
      isActive
    } = req.query;

    // Construir filtro
    const filter = {};

    // Búsqueda por contextId o nombre
    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { contextId: { $regex: safeSearch, $options: 'i' } },
        { name: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    if (typeof isActive === 'boolean') {
      filter.isActive = isActive;
    }

    // Paginación
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

    // Ejecutar query
    const [contexts, total] = await Promise.all([
      gameContextRepository.find(filter, {
        sort: sortOptions,
        limit: parseInt(limit, 10),
        skip
      }),
      gameContextRepository.count(filter)
    ]);

    logger.info('Lista de contextos obtenida', {
      requestedBy: req.user._id,
      filters: filter,
      resultsCount: contexts.length
    });

    res.json({
      success: true,
      ...toPaginatedDTOV1(toGameContextListDTOV1(contexts), {
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
 * Obtener un contexto específico por ID o contextId.
 *
 * GET /api/contexts/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getContextById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Intentar buscar por ID de MongoDB o por contextId
    let context;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      context = await gameContextRepository.findById(id);
    } else {
      // Buscar por contextId (ej: 'geography', 'animals')
      context = await gameContextRepository.findOne({ contextId: id.toLowerCase() });
    }

    if (!context) {
      throw new NotFoundError('Contexto de juego');
    }

    res.json({
      success: true,
      data: toGameContextDetailDTOV1(context)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Crear un nuevo contexto de juego.
 * Solo profesores pueden crear contextos.
 *
 * POST /api/contexts
 * Headers: Authorization: Bearer <token>
 * Body: { contextId, name, assets }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createContext = async (req, res, next) => {
  try {
    const { contextId, name, assets } = req.body;

    // Verificar si el contextId ya existe
    const existingContext = await gameContextRepository.findOne({
      contextId: contextId.toLowerCase()
    });

    if (existingContext) {
      throw new ConflictError('Un contexto con este ID ya existe');
    }

    // Crear contexto
    const context = await gameContextRepository.create({
      contextId: contextId.toLowerCase(),
      name,
      assets
    });

    logger.info('Contexto creado', {
      contextId: context.contextId,
      name: context.name,
      assetsCount: context.assets.length,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Contexto creado exitosamente',
      data: toGameContextDetailDTOV1(context)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Actualizar un contexto existente.
 *
 * PUT /api/contexts/:id
 * Headers: Authorization: Bearer <token>
 * Body: { contextId?, name?, assets? }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const updateContext = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { contextId, name, assets } = req.body;

    const context = await gameContextRepository.findById(id);

    if (!context) {
      throw new NotFoundError('Contexto de juego');
    }

    // Actualizar campos
    if (contextId) {
      context.contextId = contextId.toLowerCase();
    }
    if (name) {
      context.name = name;
    }
    if (assets) {
      context.assets = assets;
    }

    await context.save();

    logger.info('Contexto actualizado', {
      contextId: context.contextId,
      name: context.name,
      updatedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Contexto actualizado exitosamente',
      data: toGameContextDetailDTOV1(context)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Eliminar un contexto.
 * Hard delete ya que no se usa si no hay sesiones asociadas.
 *
 * DELETE /api/contexts/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const deleteContext = async (req, res, next) => {
  try {
    const { id } = req.params;

    const context = await gameContextRepository.findById(id);

    if (!context) {
      throw new NotFoundError('Contexto de juego');
    }

    const dependencies = await getActiveContextDependencies(context._id);
    const hasActiveDependencies =
      dependencies.activeDecks > 0 ||
      dependencies.activeSessions > 0 ||
      dependencies.activePlays > 0;

    if (hasActiveDependencies) {
      throw new ConflictError(
        'No se puede eliminar el contexto porque tiene dependencias activas (sessions/decks/plays)'
      );
    }

    await context.deleteOne();

    logger.info('Contexto eliminado', {
      contextId: context.contextId,
      name: context.name,
      deletedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Contexto eliminado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Añadir un asset a un contexto existente.
 *
 * POST /api/contexts/:id/assets
 * Headers: Authorization: Bearer <token>
 * Body: { key, display, value, audioUrl?, imageUrl? }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const addAsset = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { key, display, value, audioUrl, imageUrl } = req.body;

    const context = await gameContextRepository.findById(id);

    if (!context) {
      throw new NotFoundError('Contexto de juego');
    }

    // Verificar que la key no exista ya
    const existingAsset = context.assets.find(asset => asset.key === key.toLowerCase());

    if (existingAsset) {
      throw new ConflictError('Un asset con esta key ya existe en este contexto');
    }

    // Añadir asset
    context.assets.push({
      key: key.toLowerCase(),
      display,
      value,
      audioUrl,
      imageUrl
    });

    await context.save();

    logger.info('Asset añadido al contexto', {
      contextId: context.contextId,
      assetKey: key,
      addedBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Asset añadido exitosamente',
      data: toGameContextDetailDTOV1(context)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Eliminar un asset de un contexto.
 *
 * DELETE /api/contexts/:id/assets/:assetKey
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const removeAsset = async (req, res, next) => {
  try {
    const { id, assetKey } = req.params;

    const context = await gameContextRepository.findById(id);

    if (!context) {
      throw new NotFoundError('Contexto de juego');
    }

    // Verificar que el asset exista
    const assetIndex = context.assets.findIndex(asset => asset.key === assetKey.toLowerCase());

    if (assetIndex === -1) {
      throw new NotFoundError('Asset');
    }

    // Verificar que queden al menos 2 assets después de eliminar
    if (context.assets.length <= 2) {
      throw new ValidationError('El contexto debe tener al menos 2 assets');
    }

    // Eliminar asset
    context.assets.splice(assetIndex, 1);
    await context.save();

    logger.info('Asset eliminado del contexto', {
      contextId: context.contextId,
      assetKey,
      deletedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Asset eliminado exitosamente',
      data: toGameContextDetailDTOV1(context)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener assets de un contexto específico.
 *
 * GET /api/contexts/:id/assets
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getContextAssets = async (req, res, next) => {
  try {
    const { id } = req.params;

    let context;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      context = await gameContextRepository.findById(id, {
        select: 'contextId name assets'
      });
    } else {
      context = await gameContextRepository.findOne(
        { contextId: id.toLowerCase() },
        { select: 'contextId name assets' }
      );
    }

    if (!context) {
      throw new NotFoundError('Contexto de juego');
    }

    const payload = toGameContextDetailDTOV1(context);

    res.json({
      success: true,
      data: {
        ...payload,
        count: payload.assetsCount
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getContexts,
  getContextById,
  createContext,
  updateContext,
  deleteContext,
  addAsset,
  removeAsset,
  getContextAssets
};
