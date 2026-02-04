/**
 * @fileoverview Rutas de administración (solo Super Admin).
 *
 * @module routes/admin
 */

const express = require('express');
const router = express.Router();

const { authenticate, requireRole } = require('../middlewares/auth');
const {
  approveTeacher,
  rejectTeacher,
  getPendingTeachers
} = require('../controllers/adminController');
const { validateParams, validateQuery } = require('../middlewares/validation');
const { userIdParamsSchema } = require('../validators/userValidator');
const { emptyObjectSchema, paginationSchema } = require('../validators/commonValidator');

// Todas las rutas de admin requieren autenticación + rol super_admin
router.use(authenticate, requireRole('super_admin'));

/**
 * @route   GET /api/admin/pending
 * @desc    Obtener profesores pendientes de aprobación
 * @access  Private (super_admin)
 * @validation query: paginationSchema
 */
router.get('/pending', validateQuery(paginationSchema), getPendingTeachers);

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
  approveTeacher
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
  rejectTeacher
);

module.exports = router;
