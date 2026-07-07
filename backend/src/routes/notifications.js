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

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Listado paginado de notificaciones del usuario
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: before
 *         schema: { type: string, format: date-time, description: 'Cursor (createdAt anterior)' }
 *     responses:
 *       200:
 *         description: Notificaciones del usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items: { type: array, items: { $ref: '#/components/schemas/Notification' } }
 *                     nextCursor: { type: string, nullable: true }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */
router.get('/', authenticate, validateQuery(notificationListQuerySchema), asyncHandler(list));

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Contador de no leídas del usuario autenticado.
 * @access  Private (cualquier rol autenticado)
 */

/**
 * @openapi
 * /notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Contador de notificaciones no leídas
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Contador
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     count: { type: integer, minimum: 0 }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
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

/**
 * @openapi
 * /notifications/mark-all-read:
 *   post:
 *     tags: [Notifications]
 *     summary: Marcar todas las notificaciones del usuario como leídas
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     responses:
 *       200: { description: Todas marcadas como leídas }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
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

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Marcar una notificación como leída
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notificación marcada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Notification' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.patch(
  '/:id/read',
  authenticate,
  validateParams(notificationParamsSchema),
  validateBody(emptyObjectSchema),
  asyncHandler(markRead)
);

module.exports = router;
