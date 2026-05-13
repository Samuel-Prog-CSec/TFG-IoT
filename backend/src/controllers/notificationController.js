/**
 * @fileoverview Controller delgado de notificaciones. Orquesta el
 * notificationService y devuelve DTOs V1 vía responseHelper.
 *
 * @module controllers/notificationController
 */

const notificationService = require('../services/notificationService');
const { sendSuccess } = require('../utils/responseHelper');

/**
 * GET /api/notifications
 *
 * Lista las notificaciones del usuario autenticado con paginación cursor.
 * Devuelve `{ items, nextCursor }` para que el frontend pueda pedir la
 * página siguiente vía `?before=<nextCursor>`.
 */
const list = async (req, res) => {
  const { limit, before } = req.query;
  const result = await notificationService.listForUser(req.user._id, { limit, before });
  return sendSuccess(res, result);
};

/**
 * GET /api/notifications/unread-count
 *
 * Devuelve el contador de no leídas del usuario autenticado.
 */
const unreadCount = async (req, res) => {
  const count = await notificationService.countUnread(req.user._id);
  return sendSuccess(res, { count });
};

/**
 * PATCH /api/notifications/:id/read
 *
 * Marca como leída una notificación del usuario autenticado. Si la
 * notificación no le pertenece o no existe, devuelve 404 vía
 * NotFoundError → errorHandler.
 */
const markRead = async (req, res) => {
  const dto = await notificationService.markRead(req.user._id, req.params.id);
  return sendSuccess(res, dto);
};

/**
 * POST /api/notifications/mark-all-read
 *
 * Marca como leídas todas las notificaciones del usuario autenticado.
 */
const markAllRead = async (req, res) => {
  const result = await notificationService.markAllRead(req.user._id);
  return sendSuccess(res, result);
};

module.exports = {
  list,
  unreadCount,
  markRead,
  markAllRead
};
