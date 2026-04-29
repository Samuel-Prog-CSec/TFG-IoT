/**
 * @fileoverview Helper centralizado para invalidar todas las keys de cache
 * relacionadas con contextos de juego.
 *
 * Existen dos familias de keys bajo el namespace `cache:context`:
 *   - `byId:<mongoId>` y `byId:<slug>` (ver `gameContextController.getContextById`).
 *   - `list:<hash-de-query>` (ver `gameContextController.getContexts`).
 *
 * Las mutaciones (create/update/delete) deben invalidar ambas familias. Antes de
 * este helper cada controller lo hacía a mano con llamadas sueltas, lo que dejaba
 * la lista global desactualizada en el caso de update/delete.
 *
 * @module utils/cacheInvalidators/contextCacheInvalidator
 */

const redisService = require('../../services/redisService');
const { cacheInvalidate } = require('../cacheHelper');
const logger = require('../logger').child({ component: 'contextCacheInvalidator' });

const CONTEXT_NAMESPACE = 'cache:context';
const LIST_KEY_PREFIX = 'list:';

/**
 * Construye la key estable de un listado a partir de sus query params.
 * Se usa tanto en la lectura (`getContexts`) como en la invalidación.
 *
 * @param {Object} params
 * @returns {string}
 */
const buildListCacheKey = params => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const sortBy = params.sortBy || 'createdAt';
  const order = params.order || 'desc';
  const search = (params.search || '').trim().toLowerCase();
  const isActive = params.isActive === undefined ? '' : String(params.isActive);
  // Ej: list:p1:l20:sc:od:q:a
  return `${LIST_KEY_PREFIX}p${page}:l${limit}:s${sortBy}:o${order}:q${search}:a${isActive}`;
};

/**
 * Invalida ambas entradas byId de un contexto (mongoId + slug).
 * No toca las keys de lista.
 */
const invalidateContextEntityCaches = async (mongoId, slugId) => {
  if (mongoId) {
    await cacheInvalidate(CONTEXT_NAMESPACE, `byId:${mongoId}`);
  }
  if (slugId && slugId !== mongoId) {
    await cacheInvalidate(CONTEXT_NAMESPACE, `byId:${slugId}`);
  }
};

/**
 * Invalida todas las entradas de listados cacheadas.
 * Cubre cualquier combinación de filtros (página, sort, search, isActive...).
 *
 * @returns {Promise<number>} Número de keys invalidadas (puede ser 0 si no hay).
 */
const invalidateContextListCaches = async () => {
  const keys = await redisService.scanByNamespace(CONTEXT_NAMESPACE, `${LIST_KEY_PREFIX}*`);
  if (!keys || keys.length === 0) {
    return 0;
  }

  const namespacePrefix = `${CONTEXT_NAMESPACE}:`;
  const ids = keys
    .map(full => (full.startsWith(namespacePrefix) ? full.slice(namespacePrefix.length) : full))
    .filter(Boolean);

  if (ids.length === 0) {
    return 0;
  }

  await redisService.delMany(CONTEXT_NAMESPACE, ids);
  logger.debug('Context list caches invalidadas', { count: ids.length });
  return ids.length;
};

/**
 * Helper combinado: invalida la entidad concreta + todas las listas cacheadas.
 * Llamado desde create/update/delete del controller.
 *
 * @param {string|null} mongoId - ObjectId de MongoDB del contexto (null en create).
 * @param {string|null} slugId - Slug contextId del contexto (null si no existe todavía).
 * @returns {Promise<{entities:number, lists:number}>}
 */
const invalidateContextCaches = async (mongoId = null, slugId = null) => {
  await invalidateContextEntityCaches(mongoId, slugId);
  const listsInvalidated = await invalidateContextListCaches();
  return {
    entities: (mongoId ? 1 : 0) + (slugId && slugId !== mongoId ? 1 : 0),
    lists: listsInvalidated
  };
};

module.exports = {
  CONTEXT_NAMESPACE,
  LIST_KEY_PREFIX,
  buildListCacheKey,
  invalidateContextEntityCaches,
  invalidateContextListCaches,
  invalidateContextCaches
};
