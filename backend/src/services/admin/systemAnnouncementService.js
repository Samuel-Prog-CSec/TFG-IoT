/**
 * @fileoverview Servicio de avisos del super_admin a profesores (T-942).
 *
 * CRUD simple con cache Redis para `listActiveForAudience` (consultado en
 * cada login/refresh del teacher para renderizar el banner).
 *
 * @module services/admin/systemAnnouncementService
 */

const systemAnnouncementRepository = require('../../repositories/systemAnnouncementRepository');
const { cacheGet, cacheInvalidateNamespace } = require('../../utils/cacheHelper');
const { SYSTEM_ANNOUNCEMENT_CONFIG } = require('../../config/systemAlerts');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger').child({ component: 'systemAnnouncementService' });

const CACHE_NAMESPACE = 'cache:announcements';

const invalidate = async () => {
  try {
    await cacheInvalidateNamespace(CACHE_NAMESPACE);
  } catch (err) {
    logger.warn('No se pudo invalidar cache announcements', { error: err.message });
  }
};

async function list({ active, audience } = {}) {
  const filter = {};
  if (typeof active === 'boolean') {
    filter.active = active;
  }
  if (audience) {
    filter.audience = audience;
  }
  return systemAnnouncementRepository.find(filter, { sort: { publishedAt: -1 }, lean: true });
}

async function create({
  title,
  body,
  severity,
  audience,
  linkUrl,
  linkLabel,
  expiresAt,
  createdBy
}) {
  if (!title || !body) {
    throw new ValidationError('title y body son obligatorios');
  }
  if (audience && !SYSTEM_ANNOUNCEMENT_CONFIG.audiences.includes(audience)) {
    throw new ValidationError(`audience no válida: ${audience}`);
  }
  if (severity && !SYSTEM_ANNOUNCEMENT_CONFIG.severities.includes(severity)) {
    throw new ValidationError(`severity no válida: ${severity}`);
  }
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    throw new ValidationError('expiresAt debe ser futuro');
  }

  const audienceFinal = audience || 'all_teachers';
  const activeCount = await systemAnnouncementRepository.countActiveForAudience({
    audience: audienceFinal
  });
  if (activeCount >= SYSTEM_ANNOUNCEMENT_CONFIG.maxActive) {
    throw new ValidationError(
      `Máximo ${SYSTEM_ANNOUNCEMENT_CONFIG.maxActive} avisos activos para esta audiencia. Archiva alguno primero.`,
      { code: 'ANNOUNCEMENT_LIMIT_REACHED', max: SYSTEM_ANNOUNCEMENT_CONFIG.maxActive }
    );
  }

  const doc = await systemAnnouncementRepository.create({
    title,
    body,
    severity: severity || 'info',
    audience: audienceFinal,
    linkUrl: linkUrl || null,
    linkLabel: linkLabel || null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdBy
  });
  await invalidate();
  logger.info('announcement.created', {
    id: String(doc._id),
    severity: doc.severity,
    audience: doc.audience,
    createdBy: String(createdBy)
  });
  return doc;
}

async function update(id, patch) {
  const existing = await systemAnnouncementRepository.findById(id);
  if (!existing) {
    throw new NotFoundError('Aviso');
  }
  if (patch.severity && !SYSTEM_ANNOUNCEMENT_CONFIG.severities.includes(patch.severity)) {
    throw new ValidationError(`severity no válida: ${patch.severity}`);
  }
  if (patch.audience && !SYSTEM_ANNOUNCEMENT_CONFIG.audiences.includes(patch.audience)) {
    throw new ValidationError(`audience no válida: ${patch.audience}`);
  }
  if (patch.expiresAt && new Date(patch.expiresAt).getTime() <= Date.now()) {
    throw new ValidationError('expiresAt debe ser futuro');
  }

  const updated = await systemAnnouncementRepository.updateById(id, {
    $set: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.severity !== undefined ? { severity: patch.severity } : {}),
      ...(patch.audience !== undefined ? { audience: patch.audience } : {}),
      ...(patch.linkUrl !== undefined ? { linkUrl: patch.linkUrl } : {}),
      ...(patch.linkLabel !== undefined ? { linkLabel: patch.linkLabel } : {}),
      ...(patch.expiresAt !== undefined
        ? { expiresAt: patch.expiresAt ? new Date(patch.expiresAt) : null }
        : {})
    }
  });
  await invalidate();
  logger.info('announcement.updated', { id: String(id) });
  return updated;
}

async function archive(id, archivedBy) {
  const existing = await systemAnnouncementRepository.findById(id);
  if (!existing) {
    throw new NotFoundError('Aviso');
  }
  const updated = await systemAnnouncementRepository.updateById(id, {
    $set: { active: false, archivedAt: new Date(), archivedBy }
  });
  await invalidate();
  logger.info('announcement.archived', { id: String(id), by: String(archivedBy) });
  return updated;
}

async function listActiveForUser({ role }) {
  const audience = role === 'super_admin' ? 'all_users' : 'all_teachers';
  return cacheGet(
    CACHE_NAMESPACE,
    `active:${audience}`,
    async () => systemAnnouncementRepository.findActiveForAudience({ audience, now: new Date() }),
    SYSTEM_ANNOUNCEMENT_CONFIG.cacheTtlSeconds
  );
}

module.exports = {
  list,
  create,
  update,
  archive,
  listActiveForUser,
  _internals: { CACHE_NAMESPACE }
};
