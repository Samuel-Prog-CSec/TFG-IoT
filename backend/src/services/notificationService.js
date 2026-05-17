/**
 * @fileoverview Servicio de notificaciones tiempo real persistidas (T-955).
 *
 * Responsabilidades:
 * - Crear, listar, marcar leídas y contar notificaciones por usuario.
 * - Dedup window 60s vía Redis SET NX para evitar spam de eventos repetidos
 *   (por ejemplo, dos triggers concurrentes del mismo evento o un alumno
 *   que completa 3 partidas seguidas).
 * - Emitir el evento Socket.IO `notification:created` al room `user_${userId}`
 *   con el DTO V1 inmediatamente tras persistir el documento.
 *
 * Inyección de Socket.IO:
 * - El módulo expone `setSocketServer(io)` que `server.js` invoca tras
 *   `registerSocketHandlers`. Si nunca se inyecta (tests aislados), las
 *   emisiones quedan en no-op y la persistencia sigue funcionando.
 *
 * Patrón compatible con el resto del backend (gameEngine inyecta su `io`,
 * socketHandlers mantiene `socketServerRef`).
 *
 * @module services/notificationService
 */

const crypto = require('crypto');
const Notification = require('../models/Notification');
const redisService = require('./redisService');
const { toNotificationDTOV1 } = require('../utils/dtos');
const { NotFoundError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger').child({ component: 'notificationService' });

const DEDUP_TTL_SECONDS = Number.parseInt(process.env.NOTIFICATION_DEDUP_TTL_SEC, 10) || 60;
const NOTIF_DEDUP_NAMESPACE = 'notif:dedup';

let socketServerRef = null;

/**
 * Inyecta la referencia al servidor Socket.IO. Llamado una vez desde
 * `server.js` al arrancar. Antes de la inyección las emisiones son no-op.
 *
 * @param {import('socket.io').Server} io
 * @returns {void}
 */
function setSocketServer(io) {
  socketServerRef = io;
}

/**
 * Devuelve la referencia actual al servidor Socket.IO. Útil para tests.
 *
 * @returns {import('socket.io').Server|null}
 */
function getSocketServer() {
  return socketServerRef;
}

/**
 * Calcula la key de dedup para una notificación. Es estable para inputs
 * equivalentes (mismo usuario + tipo + recurso asociado), de modo que dos
 * triggers idénticos en una ventana corta colisionan en Redis.
 *
 * El hash incluye `metadata.resourceId` si existe; si no, recae en una
 * concatenación de campos relevantes para que el dedup siga teniendo
 * sentido (caso: notificación de sistema sin recurso).
 *
 * @param {string} userId
 * @param {string} type
 * @param {object} [metadata]
 * @returns {string}
 */
function buildDedupKey(userId, type, metadata = {}) {
  const resourceId =
    metadata?.resourceId ||
    metadata?.playId ||
    metadata?.sessionId ||
    metadata?.studentId ||
    metadata?.contextId ||
    '';
  const raw = `${userId}|${type}|${resourceId}|${metadata?.priorityHint || ''}`;
  // SHA-256 truncado a 16 chars: no es contexto cripto-sensible (sólo dedup key
  // de notificaciones), pero usamos SHA-256 para cumplir las reglas de hashing
  // del proyecto y dejar la migración de algoritmo abierta.
  const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  return `${userId}:${type}:${hash}`;
}

/**
 * Emite el evento Socket.IO `notification:created` al room del usuario
 * destinatario. Si el server no está inyectado (tests), no hace nada.
 *
 * @param {string} userId
 * @param {object} dto - DTO V1 serializado a enviar al cliente.
 */
function emitNotificationCreated(userId, dto) {
  if (!socketServerRef || !userId || !dto) {
    return;
  }
  try {
    socketServerRef.to(`user_${userId}`).emit('notification:created', dto);
  } catch (error) {
    // Persistencia ya OK — log y continuar; el cliente recibirá la notif
    // al refrescar (GET /api/notifications).
    logger.warn('No se pudo emitir notification:created', {
      userId,
      error: error.message
    });
  }
}

/**
 * Crea una notificación, aplicando dedup window y emitiendo el evento.
 * Si la dedup window está activa para esta combinación, devuelve `null` y
 * NO crea el documento — el llamante puede tratarlo como un no-op.
 *
 * @param {object} payload
 * @param {string} payload.userId - Destinatario.
 * @param {string} payload.type - Uno de NOTIFICATION_TYPES.
 * @param {string} payload.title
 * @param {string} [payload.body]
 * @param {string|null} [payload.link]
 * @param {object} [payload.metadata]
 * @param {'info'|'warning'|'critical'} [payload.priority='info']
 * @returns {Promise<object|null>} DTO V1 de la notificación creada o null si fue dedup.
 */
async function createNotification({
  userId,
  type,
  title,
  body,
  link = null,
  metadata = {},
  priority = 'info'
}) {
  if (!userId) {
    throw new ValidationError('userId requerido');
  }
  if (!type) {
    throw new ValidationError('type requerido');
  }
  if (!title) {
    throw new ValidationError('title requerido');
  }

  const dedupKey = buildDedupKey(userId, type, metadata);
  const acquired = await redisService.setIfNotExists(
    NOTIF_DEDUP_NAMESPACE,
    dedupKey,
    Date.now(),
    DEDUP_TTL_SECONDS
  );

  if (!acquired) {
    logger.debug('Notificación deduplicada por ventana 60s', {
      userId,
      type,
      dedupKey
    });
    return null;
  }

  const doc = await Notification.create({
    userId,
    type,
    title,
    body,
    link,
    metadata,
    priority
  });

  const dto = toNotificationDTOV1(doc);
  emitNotificationCreated(userId, dto);

  logger.info('Notificación creada', {
    userId,
    type,
    notificationId: doc._id.toString(),
    priority
  });

  return dto;
}

/**
 * Lista las notificaciones de un usuario, ordenadas por fecha descendente.
 * Paginación cursor sobre `createdAt`: el cliente envía `before` (ISO date)
 * para pedir la página siguiente.
 *
 * @param {string} userId
 * @param {object} [options]
 * @param {number} [options.limit=20] - Máximo a devolver (acotado a [1, 100]).
 * @param {string|Date} [options.before] - Cursor: solo notificaciones más antiguas que esto.
 * @returns {Promise<{ items: object[], nextCursor: string|null }>}
 */
async function listForUser(userId, { limit = 20, before } = {}) {
  if (!userId) {
    throw new ValidationError('userId requerido');
  }

  const cappedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
  const filter = { userId };

  if (before) {
    const cursorDate = before instanceof Date ? before : new Date(before);
    if (!Number.isNaN(cursorDate.getTime())) {
      filter.createdAt = { $lt: cursorDate };
    }
  }

  // Pedimos `limit + 1` para saber si hay más página sin un count separado.
  const docs = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(cappedLimit + 1)
    .lean();

  const hasMore = docs.length > cappedLimit;
  const slice = hasMore ? docs.slice(0, cappedLimit) : docs;
  const items = slice.map(toNotificationDTOV1);
  const nextCursor = hasMore ? slice[slice.length - 1].createdAt.toISOString() : null;

  return { items, nextCursor };
}

/**
 * Cuenta notificaciones no leídas de un usuario.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
async function countUnread(userId) {
  if (!userId) {
    return 0;
  }
  return Notification.countDocuments({ userId, read: false });
}

/**
 * Marca una notificación como leída. Solo permite hacerlo al destinatario.
 *
 * @param {string} userId
 * @param {string} notificationId
 * @returns {Promise<object>} DTO V1 actualizado.
 * @throws {NotFoundError} Si la notificación no existe o no pertenece al usuario.
 */
async function markRead(userId, notificationId) {
  const doc = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { read: true, readAt: new Date() } },
    { returnDocument: 'after' }
  );

  if (!doc) {
    throw new NotFoundError('Notificación');
  }

  return toNotificationDTOV1(doc);
}

/**
 * Marca todas las notificaciones de un usuario como leídas.
 *
 * @param {string} userId
 * @returns {Promise<{ modified: number }>}
 */
async function markAllRead(userId) {
  if (!userId) {
    throw new ValidationError('userId requerido');
  }
  const result = await Notification.updateMany(
    { userId, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  return { modified: result.modifiedCount || 0 };
}

/**
 * Helper interno para que los triggers de dominio (gamePlayService, etc.)
 * no necesiten construir el payload completo — sólo el contexto del evento.
 * Devuelve `null` si el dedup window absorbió la llamada.
 *
 * @param {object} ctx
 * @param {string} ctx.userId
 * @param {string} ctx.type
 * @param {string} ctx.title
 * @param {string} [ctx.body]
 * @param {string} [ctx.link]
 * @param {object} [ctx.metadata]
 * @param {'info'|'warning'|'critical'} [ctx.priority]
 * @returns {Promise<object|null>}
 */
async function notify(ctx) {
  try {
    return await createNotification(ctx);
  } catch (error) {
    // Triggers de notificación NUNCA deben bloquear el flujo de dominio
    // (un fallo aquí no debe abortar un endPlay ni un signup).
    logger.error('Fallo creando notificación, ignorado para no bloquear flujo', {
      userId: ctx?.userId,
      type: ctx?.type,
      error: error.message
    });
    return null;
  }
}

module.exports = {
  setSocketServer,
  getSocketServer,
  createNotification,
  listForUser,
  countUnread,
  markRead,
  markAllRead,
  notify,
  // Internals expuestos para tests.
  _internals: {
    buildDedupKey,
    NOTIF_DEDUP_NAMESPACE,
    DEDUP_TTL_SECONDS
  }
};
