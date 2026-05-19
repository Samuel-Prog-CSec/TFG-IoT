/**
 * @fileoverview Rutas de administración (solo Super Admin).
 *
 * @module routes/admin
 */

const express = require('express');
const router = express.Router();

const { authenticate, requireRole } = require('../middlewares/auth');
const { requireMfa } = require('../middlewares/requireMfa');
const {
  approveTeacher,
  rejectTeacher,
  getPendingTeachers,
  unlockAccount
} = require('../controllers/adminController');
const { validateParams, validateQuery, validateBody } = require('../middlewares/validation');
const { userIdParamsSchema } = require('../validators/userValidator');
const { emptyObjectSchema, paginationSchema } = require('../validators/commonValidator');
const { unlockEmailSchema } = require('../validators/lockoutValidator');
const asyncHandler = require('../utils/asyncHandler');

// Todas las rutas de admin requieren autenticación + rol super_admin
router.use(authenticate, requireRole('super_admin'));

/**
 * @route   GET /api/admin/pending
 * @desc    Obtener profesores pendientes de aprobación
 * @access  Private (super_admin)
 * @validation query: paginationSchema
 */

/**
 * @openapi
 * /admin/pending:
 *   get:
 *     tags: [Admin]
 *     summary: Profesores en estado `pending`
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100 }
 *     responses:
 *       200:
 *         description: Lista paginada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/User' } }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 */
router.get('/pending', validateQuery(paginationSchema), asyncHandler(getPendingTeachers));

/**
 * @route   POST /api/admin/users/:id/approve
 * @desc    Aprobar un profesor pendiente
 * @access  Private (super_admin)
 * @validation params: userIdParamsSchema | query: emptyObjectSchema
 */

/**
 * @openapi
 * /admin/users/{id}/approve:
 *   post:
 *     tags: [Admin]
 *     summary: Aprobar profesor pendiente (super_admin)
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Profesor activado }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.post(
  '/users/:id/approve',
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(approveTeacher)
);

/**
 * @route   POST /api/admin/users/:id/reject
 * @desc    Rechazar un profesor pendiente
 * @access  Private (super_admin)
 * @validation params: userIdParamsSchema | query: emptyObjectSchema
 */

/**
 * @openapi
 * /admin/users/{id}/reject:
 *   post:
 *     tags: [Admin]
 *     summary: Rechazar profesor pendiente
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Profesor rechazado y notificado }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.post(
  '/users/:id/reject',
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(rejectTeacher)
);

/**
 * @route   POST /api/admin/lockouts/unlock
 * @desc    Desbloquea manualmente una cuenta bloqueada por intentos fallidos.
 * @access  Private (super_admin). Cuando MFA esté operativo (B7), añadir `requireMfa`.
 * @validation body: unlockEmailSchema
 */

/**
 * @openapi
 * /admin/lockouts/unlock:
 *   post:
 *     tags: [Admin]
 *     summary: Desbloquear cuenta bloqueada por intentos fallidos (requiere MFA reciente)
 *     description: T-905 B7 — opera sobre el lockout per-user (no IP). Genera entrada en el audit log.
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Cuenta desbloqueada }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 */
router.post(
  '/lockouts/unlock',
  requireMfa, // T-905 B7: unlock manual requiere MFA reciente
  validateQuery(emptyObjectSchema),
  validateBody(unlockEmailSchema),
  asyncHandler(unlockAccount)
);

module.exports = router;
