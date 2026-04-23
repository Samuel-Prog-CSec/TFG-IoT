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
const asyncHandler = require('../utils/asyncHandler');
const { adminRouter: featureFlagsAdminRouter } = require('./featureFlags');

// Todas las rutas de admin requieren autenticación + rol super_admin
router.use(authenticate, requireRole('super_admin'));

// Sub-router de feature flags: /api/admin/flags/*
router.use('/flags', featureFlagsAdminRouter);

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

module.exports = router;
