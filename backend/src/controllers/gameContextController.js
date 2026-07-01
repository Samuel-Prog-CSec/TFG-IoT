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
const { buildFilter } = require('../utils/filterBuilder');
const { cacheGet } = require('../utils/cacheHelper');
const {
  buildListCacheKey,
  invalidateContextCaches
} = require('../utils/cacheInvalidators/contextCacheInvalidator');

const contextFilterMappings = {
  search: { type: 'search', fields: ['contextId', 'name'] },
  isActive: { field: 'isActive', type: 'exact' }
};

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
  const filter = buildFilter({ search, isActive }, contextFilterMappings);

  // Paginación
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);
  const skip = (parsedPage - 1) * parsedLimit;
  const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

  // Cache de la lista: la key depende de los query params. Las mutaciones
  // create/update/delete invalidan todas las keys `list:*` del namespace vía
  // contextCacheInvalidator.invalidateContextCaches.
  const listCacheKey = buildListCacheKey({
    page: parsedPage,
    limit: parsedLimit,
    sortBy,
    order,
    search,
    isActive
  });

  const cachedList = await cacheGet(
    'cache:context',
    listCacheKey,
    async () => {
      const [contexts, total] = await Promise.all([
        gameContextRepository.find(filter, {
          sort: sortOptions,
          limit: parsedLimit,
          skip,
          lean: true
        }),
        gameContextRepository.count(filter)
      ]);
      return { contexts, total };
    },
    1800
  );

  logger.info('Lista de contextos obtenida', {
    requestedBy: req.user._id,
    filters: filter,
    resultsCount: cachedList.contexts.length
  });

  sendPaginated(res, toGameContextListDTOV1(cachedList.contexts), {
    page: parsedPage,
    limit: parsedLimit,
    total: cachedList.total
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

  // Intentar buscar por ID de MongoDB o por contextId (con cache)
  const context = await cacheGet(
    'cache:context',
    `byId:${id}`,
    async () => {
      let result;
      const populateOpts = { populate: { path: 'assets.uploadedBy', select: 'name email' } };
      if (id.match(/^[0-9a-f]{24}$/i)) {
        result = await gameContextRepository.findById(id, populateOpts);
      } else {
        // Buscar por contextId (ej: 'geography', 'animals')
        result = await gameContextRepository.findOne({ contextId: id.toLowerCase() }, populateOpts);
      }
      return result;
    },
    1800
  );

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
 * Body: { contextId, name } — el contexto se crea vacío; los assets se añaden
 * después por los endpoints dedicados de upload (ADR-197)
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createContext = async (req, res) => {
  const { contextId, name } = req.body;

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
    assets: []
  });

  // Invalidar las listas cacheadas para que el nuevo contexto aparezca inmediatamente.
  await invalidateContextCaches(context._id.toString(), context.contextId);

  logger.info('Contexto creado', {
    contextId: context.contextId,
    name: context.name,
    assetsCount: context.assets.length,
    createdBy: req.user._id,
    role: req.user.role
  });

  // Notificar a todos los docentes del centro (T-955 trigger: context_shared).
  // Fire-and-forget; los errores los silencia notify() internamente.
  notifyTeachersContextShared(context).catch(() => {
    // notify() ya hace logging. Aquí solo evitamos unhandled rejection.
  });

  sendCreated(res, toGameContextDetailDTOV1(context), 'Contexto creado exitosamente');
};

/**
 * Notifica a todos los docentes activos del centro que hay un nuevo
 * contexto compartido disponible. T-955 / context_shared.
 *
 * @param {object} context - Documento GameContext recién creado.
 */
async function notifyTeachersContextShared(context) {
  const userRepository = require('../repositories/userRepository');
  const notificationService = require('../services/notificationService');
  const teachers = await userRepository.find(
    { role: 'teacher', status: 'active', accountStatus: 'approved' },
    { select: '_id', lean: true }
  );
  if (!Array.isArray(teachers) || teachers.length === 0) {
    return;
  }
  await Promise.all(
    teachers.map(t =>
      notificationService.notify({
        userId: t._id.toString(),
        type: 'context_shared',
        priority: 'info',
        title: 'Nuevo contexto disponible',
        body: `Ya puedes usar **${context.name}** para crear mazos y sesiones en tu aula.`,
        link: `/contexts/${context._id}`,
        metadata: {
          contextId: context._id.toString(),
          contextSlug: context.contextId
        }
      })
    )
  );
}

/**
 * Actualizar un contexto existente.
 *
 * PUT /api/contexts/:id
 * Headers: Authorization: Bearer <token>
 * Body: { contextId?, name? } — los assets se gestionan por endpoints dedicados (ADR-197)
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const updateContext = async (req, res) => {
  const { id } = req.params;
  const { contextId, name } = req.body;

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
  // `assets` se gestiona solo por los endpoints dedicados (upload/delete con WebP +
  // ownership por uploadedBy); ya no se acepta su reemplazo masivo aquí (ADR-197).

  await context.save();

  await invalidateContextCaches(id, context.contextId);

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

  await invalidateContextCaches(id, context.contextId);

  // (H2) Borrar PRIMERO el documento Mongo (fuente de verdad) y DESPUÉS los
  // archivos de Storage. Antes se borraba Storage primero con "hard-fail": si el
  // delete de Mongo fallaba después (o Storage se borraba parcialmente), el
  // contexto SOBREVIVÍA en Mongo con URLs de imagen/audio muertas para TODOS los
  // profesores que lo usan — el fallo más visible. Con este orden, un fallo de
  // Storage solo deja archivos huérfanos (invisibles y purgables por el job de
  // retención), nunca un contexto con enlaces rotos.
  await context.deleteOne();

  // Limpieza de Storage best-effort tras confirmar el borrado en Mongo. Si falla
  // (o Storage está deshabilitado en dev sin SUPABASE_SERVICE_KEY), se registra
  // como huérfano pero NO se revierte el borrado ni se falla la petición.
  try {
    await storageService.deleteFolder(context.contextId);
  } catch (storageErr) {
    logger.warn(
      'deleteContext: fallo al limpiar Storage tras borrar el contexto (quedan archivos huérfanos)',
      {
        contextId: context.contextId,
        error: storageErr.message
      }
    );
  }

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
  const baseOpts = {
    select: 'contextId name assets',
    populate: { path: 'assets.uploadedBy', select: 'name email' }
  };

  if (id.match(/^[0-9a-f]{24}$/i)) {
    context = await gameContextRepository.findById(id, baseOpts);
  } else {
    context = await gameContextRepository.findOne({ contextId: id.toLowerCase() }, baseOpts);
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
