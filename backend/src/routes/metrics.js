/**
 * @fileoverview Rutas de métricas específicas (RFID, etc.).
 *
 * Las métricas runtime generales viven en healthController + endpoints
 * `/api/metrics` y `/api/health/metrics`. Aquí se exponen métricas de
 * dominio específicas para dashboards y monitorización externa.
 *
 * @module routes/metrics
 */

const express = require('express');
const router = express.Router();

const { authenticate, requireRole } = require('../middlewares/auth');
const { getRfidHealth } = require('../controllers/metricsController');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @route   GET /api/metrics/rfid
 * @desc    Snapshot de salud del sensor RFID (estado, tasas, contadores)
 * @access  Private (teacher, super_admin)
 */
router.get(
  '/rfid',
  authenticate,
  requireRole('teacher', 'super_admin'),
  asyncHandler(getRfidHealth)
);

module.exports = router;
