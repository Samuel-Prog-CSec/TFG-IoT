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
router.get('/pending', validateQuery(paginationSchema), asyncHandler(getPendingTeachers));

/**
 * @route   POST /api/admin/users/:id/approve
 * @desc    Aprobar un profesor pendiente
 * @access  Private (super_admin)
 * @validation params: userIdParamsSchema | query: emptyObjectSchema
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
router.post(
  '/lockouts/unlock',
  requireMfa, // T-905 B7: unlock manual requiere MFA reciente
  validateQuery(emptyObjectSchema),
  validateBody(unlockEmailSchema),
  asyncHandler(unlockAccount)
);

module.exports = router;
