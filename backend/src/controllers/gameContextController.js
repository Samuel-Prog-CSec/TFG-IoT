/**
 * @fileoverview Controller para gestión CRUD de contextos de juego.
 * Maneja contextos temáticos con sus assets (geografía, animales, colores, etc.).
 * @module controllers/gameContextController
 */

const gameContextRepository = require('../repositories/gameContextRepository');
const gameSessionRepository = require('../repositories/gameSessionRepository');
const gamePlayRepository = require('../repositories/gamePlayRepository');
const cardDeckRepository = require('../repositories/cardDeckRepository');
const userRepository = require('../repositories/userRepository');
const storageService = require('../services/storageService');
const { withTransaction } = require('../utils/withTransaction');
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

const ACTIVE_PLAY_STATUSES = ['in-progress', 'paused'];

/**
 * Calcula el inventario de impacto del borrado en cascada de un contexto
 * (ADR-231): qué mazos se archivarán, qué sesiones borrador se eliminarán,
 * qué sesiones jugadas pasarán a completadas y cuántas partidas (historial)
 * se conservan. `activePlays` es el ÚNICO bloqueante: no se puede borrar el
 * contexto mientras un alumno tiene una partida en curso o pausada.
 *
 * Se usa tanto para el endpoint de pre-chequeo (modal del admin) como para
 * planificar la cascada real en deleteContext.
 *
 * @param {import('mongoose').Types.ObjectId} contextMongoId
 * @returns {Promise<Object>} impacto + listas de IDs para ejecutar la cascada
 */
const collectContextDeletionImpact = async contextMongoId => {
  const [sessions, decks] = await Promise.all([
    gameSessionRepository.find(
      { contextId: contextMongoId },
      { select: '_id status createdBy', lean: true }
    ),
    cardDeckRepository.find(
      { contextId: contextMongoId },
      { select: '_id status createdBy', lean: true }
    )
  ]);

  const sessionIds = sessions.map(session => session._id);

  let activePlays = 0;
  let playsPreserved = 0;
  let playedSessionIds = [];
  if (sessionIds.length > 0) {
    [activePlays, playsPreserved, playedSessionIds] = await Promise.all([
      gamePlayRepository.count({
        sessionId: { $in: sessionIds },
        status: { $in: ACTIVE_PLAY_STATUSES }
      }),
      gamePlayRepository.count({ sessionId: { $in: sessionIds } }),
      gamePlayRepository.distinct('sessionId', { sessionId: { $in: sessionIds } })
    ]);
  }

  const playedSet = new Set(playedSessionIds.map(String));

  // Borradores: nunca iniciados y sin partidas → se eliminan (no tienen historia).
  // El chequeo de partidas es defensivo: por invariante una sesión 'created'
  // no puede tener partidas, pero si existieran se conserva como historial.
  const draftSessionIds = sessions
    .filter(session => session.status === 'created' && !playedSet.has(String(session._id)))
    .map(session => session._id);

  // Jugadas o en curso docente: pasan a 'completed' y degradan a solo-historial.
  const sessionIdsToComplete = sessions
    .filter(
      session =>
        session.status === 'active' ||
        (session.status === 'created' && playedSet.has(String(session._id)))
    )
    .map(session => session._id);

  const decksToArchiveIds = decks.filter(deck => deck.status === 'active').map(deck => deck._id);

  // Docentes cuyo material se ve afectado (para el modal del admin).
  const teacherIds = [
    ...new Set(
      [...sessions, ...decks].map(item => item.createdBy && String(item.createdBy)).filter(Boolean)
    )
  ];
  const teachersAffected = teacherIds.length
    ? await userRepository.find({ _id: { $in: teacherIds } }, { select: 'name', lean: true })
    : [];

  return {
    activePlays,
    playsPreserved,
    decksToArchive: decksToArchiveIds.length,
    decksAlreadyArchived: decks.length - decksToArchiveIds.length,
    draftSessionsToDelete: draftSessionIds.length,
    sessionsToComplete: sessionIdsToComplete.length,
    sessionsAlreadyCompleted: sessions.filter(s => s.status === 'completed').length,
    teachersAffected: teachersAffected.map(t => ({ id: String(t._id), name: t.name })),
    // Listas internas para ejecutar la cascada (no se exponen en el endpoint).
    _plan: {
      draftSessionIds,
      sessionIdsToComplete,
      decksToArchiveIds,
      teacherIds
    }
  };
};

/**
 * Serializa el impacto para la respuesta HTTP (sin el plan interno).
 *
 * @param {Object} impact - Resultado de collectContextDeletionImpact
 * @returns {Object} DTO del impacto
 */
const toDeletionImpactDTO = impact => {
  const { _plan, ...publicImpact } = impact;
  return publicImpact;
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
 * Pre-chequeo del borrado de contexto (solo super_admin).
 * Devuelve el inventario de impacto para que el modal de confirmación
 * muestre exactamente qué se archivará, qué se eliminará y qué se conserva
 * ANTES de ejecutar la cascada (ADR-231).
 *
 * GET /api/contexts/:id/deletion-impact
 * Headers: Authorization: Bearer <token> (super_admin)
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getContextDeletionImpact = async (req, res) => {
  const { id } = req.params;

  const context = await gameContextRepository.findById(id, {
    select: '_id contextId name',
    lean: true
  });

  if (!context) {
    throw new NotFoundError('Contexto de juego');
  }

  const impact = await collectContextDeletionImpact(context._id);

  sendSuccess(res, toDeletionImpactDTO(impact));
};

/**
 * Eliminar un contexto (solo super_admin) con archivado en cascada (ADR-231).
 *
 * Política: el historial educativo se conserva degradado; los recursos se
 * borran de verdad. En una transacción: se eliminan las sesiones borrador
 * (nunca jugadas), las sesiones jugadas pasan a 'completed' (solo historial),
 * los mazos del contexto se archivan y el contexto se borra. Las partidas
 * (GamePlay) quedan intactas: no guardan URLs de assets y alimentan analytics.
 *
 * Único bloqueante (409): partidas in-progress/paused — no se puede retirar
 * el material mientras un alumno está jugando con él.
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

  const impact = await collectContextDeletionImpact(context._id);

  if (impact.activePlays > 0) {
    const playWord = impact.activePlays === 1 ? 'partida en curso' : 'partidas en curso';
    throw new ConflictError(
      `No se puede eliminar el contexto: hay ${impact.activePlays} ${playWord}. ` +
        'Espera a que terminen antes de retirar sus recursos.'
    );
  }

  const { draftSessionIds, sessionIdsToComplete, teacherIds } = impact._plan;
  const now = new Date();

  // Cascada atómica. Operaciones SECUENCIALES dentro de la transacción
  // (Promise.all intra-transacción está prohibido: una misma sesión Mongo no
  // soporta operaciones concurrentes). El orden va de hoja a raíz para que un
  // abort a mitad nunca deje el contexto borrado con dependencias vivas.
  await withTransaction(async txnSession => {
    if (draftSessionIds.length > 0) {
      await gameSessionRepository.deleteMany(
        { _id: { $in: draftSessionIds } },
        { session: txnSession }
      );
    }
    if (sessionIdsToComplete.length > 0) {
      await gameSessionRepository.updateMany(
        { _id: { $in: sessionIdsToComplete } },
        { $set: { status: 'completed', endedAt: now } },
        { session: txnSession }
      );
    }
    // Todos los mazos del contexto (también los ya archivados quedan cubiertos
    // por el filtro de estado): sin contexto no hay assets, así que ninguno
    // puede volver a estar activo. El guard de des-archivado en updateDeck
    // completa la protección.
    await cardDeckRepository.updateMany(
      { contextId: context._id, status: 'active' },
      { $set: { status: 'archived' } },
      { session: txnSession }
    );
    // Vía query (no doc.deleteOne) para garantizar que la operación participa
    // en la transacción con la sesión explícita.
    await gameContextRepository.deleteMany({ _id: context._id }, { session: txnSession });
  });

  // Invalidaciones post-commit, best-effort: caché de contextos y el set de
  // sesiones por docente que usan las aggregations de analytics (los borradores
  // eliminados ya no deben aparecer durante el TTL).
  try {
    await invalidateContextCaches(id, context.contextId);
    const { cacheInvalidatePattern } = require('../utils/cacheHelper');
    for (const teacherId of teacherIds) {
      await cacheInvalidatePattern('cache:analytics', `teacherSessions:${teacherId}:*`);
    }
  } catch (cacheErr) {
    logger.warn('deleteContext: fallo al invalidar cachés tras la cascada', {
      contextId: context.contextId,
      error: cacheErr.message
    });
  }

  // (H2) Storage se limpia DESPUÉS de confirmar el borrado en Mongo, best-effort.
  // Si falla (o Storage está deshabilitado en dev sin SUPABASE_SERVICE_KEY), solo
  // quedan archivos huérfanos invisibles — nunca un contexto con enlaces rotos.
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

  logger.info('Contexto eliminado con archivado en cascada', {
    contextId: context.contextId,
    name: context.name,
    deletedBy: req.user._id,
    decksArchived: impact.decksToArchive,
    draftSessionsDeleted: impact.draftSessionsToDelete,
    sessionsCompleted: impact.sessionsToComplete,
    playsPreserved: impact.playsPreserved
  });

  sendSuccess(res, toDeletionImpactDTO(impact), 'Contexto eliminado exitosamente');
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
  getContextDeletionImpact,
  deleteContext,
  getContextAssets
};
