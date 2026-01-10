/**
 * @fileoverview Rutas de administración (solo Super Admin).
 *
 * @module routes/admin
 */

const express = require('express');
const router = express.Router();

const { authenticate, requireRole } = require('../middlewares/auth');
const { approveTeacher, rejectTeacher } = require('../controllers/adminController');

// Todas las rutas de admin requieren autenticación + rol super_admin
router.use(authenticate, requireRole('super_admin'));

/**
 * @route   POST /api/admin/users/:id/approve
 * @desc    Aprobar un profesor pendiente
 * @access  Private (super_admin)
 */
router.post('/users/:id/approve', approveTeacher);

/**
 * @route   POST /api/admin/users/:id/reject
 * @desc    Rechazar un profesor pendiente
 * @access  Private (super_admin)
 */
router.post('/users/:id/reject', rejectTeacher);

module.exports = router;
