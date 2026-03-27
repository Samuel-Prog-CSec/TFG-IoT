/**
 * @fileoverview Rutas de salud y metricas del sistema.
 *
 * Se montan bajo /api en server.js:
 * - GET /api/health — Health check publico
 * - GET /api/metrics — Metricas runtime (protegido)
 * - GET /api/info — Informacion de la API
 *
 * El alias GET /health (sin /api) se monta directamente en app
 * para herramientas externas (Docker, k8s, load balancers).
 *
 * @module routes/health
 */

const express = require('express');

const router = express.Router();

const { authenticate, requireRole } = require('../middlewares/auth');
const { healthCheck, getMetrics, getApiInfo } = require('../controllers/healthController');
const { validateQuery } = require('../middlewares/validation');
const { emptyObjectSchema } = require('../validators/commonValidator');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @route   GET /api/health
 * @desc    Health check con estado detallado del sistema
 * @access  Public
 * @validation query: emptyObjectSchema
 */
router.get('/health', validateQuery(emptyObjectSchema), asyncHandler(healthCheck));

/**
 * @route   GET /api/metrics
 * @desc    Metricas del sistema (HTTP, WebSocket, GameEngine, RFID, memoria)
 * @access  Private (Teacher / Super_Admin)
 * @validation query: emptyObjectSchema
 */
router.get(
  '/metrics',
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateQuery(emptyObjectSchema),
  asyncHandler(getMetrics)
);

/**
 * @route   GET /api/info
 * @desc    Informacion general de la API
 * @access  Public
 * @validation query: emptyObjectSchema
 */
router.get('/info', validateQuery(emptyObjectSchema), getApiInfo);

module.exports = router;
