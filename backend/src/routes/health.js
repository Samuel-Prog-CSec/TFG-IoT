/**
 * @fileoverview Rutas de salud y metricas del sistema.
 *
 * Se montan bajo /api en server.js:
 * - GET /api/health — Health check publico
 * - GET /api/metrics — Metricas runtime (protegido)
 * - GET /api/health/metrics — Metricas operacionales detalladas (super_admin)
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
const {
  healthCheck,
  livenessCheck,
  readinessCheck,
  getMetrics,
  getSystemMetrics,
  getApiInfo
} = require('../controllers/healthController');
const { validateQuery } = require('../middlewares/validation');
const { emptyObjectSchema } = require('../validators/commonValidator');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @route   GET /api/health/live
 * @desc    Liveness probe — proceso vivo, 200 sin tocar dependencias
 * @access  Public
 * @validation query: emptyObjectSchema
 *
 * NOTA: la ruta /health/live se registra ANTES que /health para que Express
 * no intente matchear /health/* contra la handler de /health.
 */
router.get('/health/live', validateQuery(emptyObjectSchema), livenessCheck);

/**
 * @route   GET /api/health/ready
 * @desc    Readiness probe — listo para tráfico (Mongo + Redis + no shutdown)
 * @access  Public
 * @validation query: emptyObjectSchema
 */
router.get('/health/ready', validateQuery(emptyObjectSchema), readinessCheck);

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
 * @route   GET /api/health/metrics
 * @desc    Metricas operacionales detalladas (GameEngine, Redis, MongoDB, Sockets, runtime)
 * @access  Private (Super_Admin)
 * @validation query: emptyObjectSchema
 */
router.get(
  '/health/metrics',
  authenticate,
  requireRole('super_admin'),
  validateQuery(emptyObjectSchema),
  asyncHandler(getSystemMetrics)
);

/**
 * @route   GET /api/info
 * @desc    Informacion general de la API
 * @access  Public
 * @validation query: emptyObjectSchema
 */
router.get('/info', validateQuery(emptyObjectSchema), getApiInfo);

module.exports = router;
