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

// NOTA: la ruta /health/live se registra ANTES que /health para que Express
// no intente matchear /health/* contra la handler de /health.
/**
 * @openapi
 * /health/live:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe — proceso vivo
 *     description: |
 *       Devuelve 200 mientras el event loop responda. No toca Mongo ni Redis.
 *       Pensado para UptimeRobot y liveness probes de Kubernetes/Koyeb.
 *     security: []
 *     responses:
 *       200:
 *         description: Proceso vivo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: 'alive' }
 *                 pid: { type: integer }
 *                 uptimeSeconds: { type: integer }
 *                 timestamp: { type: string, format: date-time }
 */
router.get('/health/live', validateQuery(emptyObjectSchema), livenessCheck);

/**
 * @openapi
 * /health/ready:
 *   get:
 *     tags: [Health]
 *     summary: Readiness probe — listo para tráfico
 *     description: |
 *       Devuelve 200 si Mongo (siempre) y Redis (sólo en producción) están conectados
 *       y el servidor no está en proceso de shutdown. 503 en cualquier otro caso.
 *       Pensado para Koyeb routing y readiness probes de Kubernetes.
 *     security: []
 *     responses:
 *       200: { description: Listo para tráfico }
 *       503:
 *         description: Alguna dependencia caída o shutdown en curso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ready: { type: boolean, example: false }
 *                 shuttingDown: { type: boolean }
 *                 checks:
 *                   type: object
 *                   properties:
 *                     mongo: { type: string, enum: [ok, down] }
 *                     redis: { type: string, enum: [ok, degraded, down] }
 */
router.get('/health/ready', validateQuery(emptyObjectSchema), readinessCheck);

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Health check detallado (legacy)
 *     description: |
 *       Estado completo del sistema: Mongo, Redis, RFID service, memoria y CPU.
 *       Mantenido por compatibilidad con dashboards admin. Para load balancers
 *       usar /health/live o /health/ready según corresponda.
 *     security: []
 *     responses:
 *       200: { description: Sistema healthy o degraded }
 *       503: { description: Alguna dependencia crítica caída }
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
