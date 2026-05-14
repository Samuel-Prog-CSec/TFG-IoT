/**
 * @fileoverview Rutas de notificaciones tiempo real (T-955).
 * Endpoints REST montados bajo `/api/notifications`.
 * @module routes/notifications
 */

const express = require('express');
const router = express.Router();

const {
  list,
  unreadCount,
  markRead,
  markAllRead
} = require('../controllers/notificationController');

const { authenticate } = require('../middlewares/auth');
const { validateQuery, validateParams, validateBody } = require('../middlewares/validation');
const {
  notificationListQuerySchema,
  emptyNotificationQuerySchema,
  notificationParamsSchema
} = require('../validators/notificationValidator');
const { emptyObjectSchema } = require('../validators/commonValidator');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @route   GET /api/notifications
 * @desc    Listado paginado por cursor (createdAt) de notificaciones del usuario autenticado.
 * @access  Private (cualquier rol autenticado)
 * @query   limit (1-100, default 20), before (ISO date para cursor)
 */
router.get('/', authenticate, validateQuery(notificationListQuerySchema), asyncHandler(list));

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Contador de no leídas del usuario autenticado.
 * @access  Private (cualquier rol autenticado)
 */
router.get(
  '/unread-count',
  authenticate,
  validateQuery(emptyNotificationQuerySchema),
  asyncHandler(unreadCount)
);

/**
 * @route   POST /api/notifications/mark-all-read
 * @desc    Marca todas las notificaciones del usuario como leídas.
 * @access  Private (cualquier rol autenticado)
 */
router.post(
  '/mark-all-read',
  authenticate,
  validateBody(emptyObjectSchema),
  asyncHandler(markAllRead)
);

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Marca una notificación específica como leída.
 * @access  Private (sólo destinatario)
 * @params  id (ObjectId)
 */
router.patch(
  '/:id/read',
  authenticate,
  validateParams(notificationParamsSchema),
  validateBody(emptyObjectSchema),
  asyncHandler(markRead)
);

module.exports = router;
