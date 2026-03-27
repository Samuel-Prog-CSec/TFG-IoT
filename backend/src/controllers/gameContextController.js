/**
 * @fileoverview Controller para gestión CRUD de contextos de juego.
 * Maneja contextos temáticos con sus assets (geografía, animales, colores, etc.).
 * @module controllers/gameContextController
 */

const gameContextRepository = require('../repositories/gameContextRepository');
const gameSessionRepository = require('../repositories/gameSessionRepository');
const gamePlayRepository = require('../repositories/gamePlayRepository');
const cardDeckRepository = require('../repositories/cardDeckRepository');
const storageService = require('../services/storageService');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');
const { toGameContextDetailDTOV1, toGameContextListDTOV1 } = require('../utils/dtos');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/responseHelper');
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
const getContexts = async (req, res) => {
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
      limit: Number.parseInt(limit, 10),
      skip
    }),
    gameContextRepository.count(filter)
  ]);

  logger.info('Lista de contextos obtenida', {
    requestedBy: req.user._id,
    filters: filter,
    resultsCount: contexts.length
  });

  sendPaginated(res, toGameContextListDTOV1(contexts), {
    page: Number.parseInt(page, 10),
    limit: Number.parseInt(limit, 10),
    total
  });
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
const getContextById = async (req, res) => {
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

  sendSuccess(res, toGameContextDetailDTOV1(context));
};

/**
 * Crear un nuevo contexto de juego.
 * Solo super_admin puede crear contextos.
 *
 * POST /api/contexts
 * Headers: Authorization: Bearer <token>
 * Body: { contextId, name, assets }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createContext = async (req, res) => {
  const { contextId, name, assets } = req.body;

  // Verificar si el contextId ya existe
  const existingContext = await gameContextRepository.findOne({
    contextId: contextId.toLowerCase()
  });

  if (existingContext) {
    throw new ConflictError('Un contexto con este ID ya existe');
  }

  // Crear contexto (assets puede ser [] — los profesores los añaden después via upload)
  const context = await gameContextRepository.create({
    contextId: contextId.toLowerCase(),
    name,
    assets: assets || []
  });

  logger.info('Contexto creado', {
    contextId: context.contextId,
    name: context.name,
    assetsCount: context.assets.length,
    createdBy: req.user._id,
    role: req.user.role
  });

  sendCreated(res, toGameContextDetailDTOV1(context), 'Contexto creado exitosamente');
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
const updateContext = async (req, res) => {
  const { id } = req.params;
  const { contextId, name, assets } = req.body;

  const context = await gameContextRepository.findById(id);

  if (!context) {
    throw new NotFoundError('Contexto de juego');
  }

  // Validar que no se renombra contextId si hay assets con archivos en Storage
  if (contextId && contextId.toLowerCase() !== context.contextId) {
    const hasStorageAssets = context.assets.some(a => a.imageUrl || a.audioUrl || a.thumbnailUrl);
    if (hasStorageAssets) {
      throw new ValidationError(
        'No se puede cambiar el contextId de un contexto con assets almacenados en Storage'
      );
    }
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

  sendSuccess(res, toGameContextDetailDTOV1(context), 'Contexto actualizado exitosamente');
};

/**
 * Eliminar un contexto (solo super_admin).
 * Hard delete con limpieza de archivos en Supabase Storage.
 * Bloqueado si existen decks/sesiones/plays activos que referencian el contexto.
 *
 * DELETE /api/contexts/:id
 * Headers: Authorization: Bearer <token> (super_admin)
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const deleteContext = async (req, res) => {
  const { id } = req.params;

  const context = await gameContextRepository.findById(id);

  if (!context) {
    throw new NotFoundError('Contexto de juego');
  }

  const dependencies = await getActiveContextDependencies(context._id);
  const hasActiveDependencies =
    dependencies.activeDecks > 0 || dependencies.activeSessions > 0 || dependencies.activePlays > 0;

  if (hasActiveDependencies) {
    throw new ConflictError(
      'No se puede eliminar el contexto porque tiene dependencias activas (sessions/decks/plays)'
    );
  }

  // Limpiar archivos del contexto en Supabase Storage.
  // Hard-fail: si Supabase falla, se lanza excepción y el contexto NO se elimina de MongoDB.
  // Única excepción: si Storage está deshabilitado intencionalmente (SUPABASE_SERVICE_KEY no configurada),
  // se omite en silencio para compatibilidad con entornos de desarrollo locales sin Supabase.
  await storageService.deleteFolder(context.contextId);

  await context.deleteOne();

  logger.info('Contexto eliminado con limpieza de Storage', {
    contextId: context.contextId,
    name: context.name,
    deletedBy: req.user._id
  });

  sendSuccess(res, null, 'Contexto eliminado exitosamente');
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
const getContextAssets = async (req, res) => {
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

  sendSuccess(res, { ...payload, count: payload.assetsCount });
};

module.exports = {
  getContexts,
  getContextById,
  createContext,
  updateContext,
  deleteContext,
  getContextAssets
};
