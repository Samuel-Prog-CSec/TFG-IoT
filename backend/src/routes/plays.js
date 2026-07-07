/**
 * @fileoverview Rutas de gestión de partidas (GamePlay).
 * Endpoints CRUD para partidas individuales de estudiantes.
 * @module routes/plays
 */

const express = require('express');
const router = express.Router();

const {
  getPlays,
  getPlayById,
  createPlay,
  addEvent,
  completePlay,
  abandonPlay,
  pausePlay,
  resumePlay,
  getPlayerStats
} = require('../controllers/gamePlayController');

const { authenticate, requireRole } = require('../middlewares/auth');
const { createResourceRateLimiter, eventRateLimiter } = require('../config/security');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const {
  createGamePlaySchema,
  addEventSchema,
  gamePlayQuerySchema,
  gamePlayParamsSchema,
  playerStatsQuerySchema,
  playerStatsParamsSchema
} = require('../validators/gamePlayValidator');
const { emptyObjectSchema } = require('../validators/commonValidator');
const asyncHandler = require('../utils/asyncHandler');

// Todas las rutas requieren profesor o super_admin
router.use(authenticate, requireRole('teacher', 'super_admin'));

/**
 * @route   GET /api/plays/stats/:playerId
 * @desc    Obtener estadísticas de un jugador
 * @access  Private (Teacher/Super Admin)
 * @validation params: playerStatsParamsSchema | query: playerStatsQuerySchema
 */
router.get(
  '/stats/:playerId',
  validateParams(playerStatsParamsSchema),
  validateQuery(playerStatsQuerySchema),
  asyncHandler(getPlayerStats)
);

/**
 * @route   GET /api/plays
 * @desc    Obtener lista de partidas con filtros
 * @access  Private
 * @validation query: gamePlayQuerySchema
 */

/**
 * @openapi
 * /plays:
 *   get:
 *     tags: [Plays]
 *     summary: Listar partidas con filtros
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: session
 *         schema: { type: string, description: 'ID de la sesión' }
 *       - in: query
 *         name: student
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, paused, completed, abandoned] }
 *     responses:
 *       200:
 *         description: Lista de partidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/GamePlay' } }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */

/**
 * @openapi
 * /plays:
 *   post:
 *     tags: [Plays]
 *     summary: Crear nueva partida
 *     description: El profesor crea una partida asignándola a un alumno y a una sesión activa.
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [session, student]
 *             properties:
 *               session: { type: string }
 *               student: { type: string }
 *     responses:
 *       201:
 *         description: Partida creada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/GamePlay' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/RateLimitError' }
 */
router.get('/', validateQuery(gamePlayQuerySchema), asyncHandler(getPlays));

/**
 * @route   GET /api/plays/:id
 * @desc    Obtener partida por ID
 * @access  Private
 * @validation params: gamePlayParamsSchema | query: emptyObjectSchema
 */
router.get(
  '/:id',
  validateParams(gamePlayParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(getPlayById)
);

/**
 * @route   POST /api/plays
 * @desc    Crear nueva partida (profesor asigna a alumno)
 * @access  Private (Teacher)
 * @validation body: createGamePlaySchema | query: emptyObjectSchema
 */
router.post(
  '/',
  createResourceRateLimiter, // Rate limiting para prevenir spam
  validateQuery(emptyObjectSchema),
  validateBody(createGamePlaySchema),
  asyncHandler(createPlay)
);

/**
 * @route   POST /api/plays/:id/events
 * @desc    Añadir evento a una partida (usado por GameEngine)
 * @access  Private
 * @validation params: gamePlayParamsSchema | body: addEventSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/events',
  eventRateLimiter, // Rate limiter permisivo para eventos de juego en tiempo real
  validateParams(gamePlayParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(addEventSchema),
  asyncHandler(addEvent)
);

/**
 * @route   POST /api/plays/:id/complete
 * @desc    Completar una partida
 * @access  Private
 * @validation params: gamePlayParamsSchema | body: emptyObjectSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/complete',
  validateParams(gamePlayParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(emptyObjectSchema),
  asyncHandler(completePlay)
);

/**
 * @route   POST /api/plays/:id/abandon
 * @desc    Abandonar una partida
 * @access  Private
 * @validation params: gamePlayParamsSchema | body: emptyObjectSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/abandon',
  validateParams(gamePlayParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(emptyObjectSchema),
  asyncHandler(abandonPlay)
);

/**
 * @route   POST /api/plays/:id/pause
 * @desc    Pausar una partida en curso
 * @access  Private (Teacher)
 * @validation params: gamePlayParamsSchema | body: emptyObjectSchema | query: emptyObjectSchema
 */

/**
 * @openapi
 * /plays/{id}/pause:
 *   post:
 *     tags: [Plays]
 *     summary: Pausar partida en curso
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Partida pausada — guarda remainingTime }
 *       400: { description: La partida no se puede pausar (ya completada o abandonada) }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */

/**
 * @openapi
 * /plays/{id}/resume:
 *   post:
 *     tags: [Plays]
 *     summary: Reanudar partida pausada
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Partida reanudada }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */

/**
 * @openapi
 * /plays/{id}/complete:
 *   post:
 *     tags: [Plays]
 *     summary: Marcar partida como completada
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Partida completada con métricas finales
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/GamePlay' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.post(
  '/:id/pause',
  eventRateLimiter, // Rate limiting para prevenir abuso en pause/resume
  validateParams(gamePlayParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(emptyObjectSchema),
  asyncHandler(pausePlay)
);

/**
 * @route   POST /api/plays/:id/resume
 * @desc    Reanudar una partida pausada
 * @access  Private (Teacher)
 * @validation params: gamePlayParamsSchema | body: emptyObjectSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/resume',
  eventRateLimiter, // Rate limiting para prevenir abuso en pause/resume
  validateParams(gamePlayParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(emptyObjectSchema),
  asyncHandler(resumePlay)
);

module.exports = router;
