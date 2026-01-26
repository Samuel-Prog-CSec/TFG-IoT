/**
 * @fileoverview Rutas de gestión de sesiones de juego.
 * Endpoints CRUD para sesiones con acciones (start, pause, end).
 * @module routes/sessions
 */

const express = require('express');
const router = express.Router();

const {
  getSessions,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
  startSession,
  pauseSession,
  endSession
} = require('../controllers/gameSessionController');

const { authenticate, requireRole } = require('../middlewares/auth');
const { createResourceRateLimiter } = require('../config/security');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const {
  createGameSessionSchema,
  updateGameSessionSchema,
  gameSessionQuerySchema,
  gameSessionParamsSchema,
  sessionActionSchema
} = require('../validators/gameSessionValidator');
const { emptyObjectSchema } = require('../validators/commonValidator');

/**
 * @route   GET /api/sessions
 * @desc    Obtener lista de sesiones con filtros
 * @access  Private (Teacher)
 * @validation query: gameSessionQuerySchema
 */
router.get(
  '/',
  authenticate,
  requireRole('teacher'),
  validateQuery(gameSessionQuerySchema),
  getSessions
);

/**
 * @route   GET /api/sessions/:id
 * @desc    Obtener sesión por ID
 * @access  Private (Teacher)
 * @validation params: gameSessionParamsSchema | query: emptyObjectSchema
 */
router.get(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameSessionParamsSchema),
  validateQuery(emptyObjectSchema),
  getSessionById
);

/**
 * @route   POST /api/sessions
 * @desc    Crear nueva sesión
 * @access  Private (Teacher)
 * @validation body: createGameSessionSchema | query: emptyObjectSchema
 */
router.post(
  '/',
  createResourceRateLimiter, // Rate limit específico para creación
  authenticate,
  requireRole('teacher'),
  validateQuery(emptyObjectSchema),
  validateBody(createGameSessionSchema),
  createSession
);

/**
 * @route   POST /api/sessions/:id/start
 * @desc    Iniciar sesión
 * @access  Private (Teacher)
 * @validation params: sessionActionSchema | body: emptyObjectSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/start',
  authenticate,
  requireRole('teacher'),
  validateParams(sessionActionSchema),
  validateQuery(emptyObjectSchema),
  validateBody(emptyObjectSchema),
  startSession
);

/**
 * @route   POST /api/sessions/:id/pause
 * @desc    Pausar sesión activa
 * @access  Private (Teacher)
 * @validation params: sessionActionSchema | body: emptyObjectSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/pause',
  authenticate,
  requireRole('teacher'),
  validateParams(sessionActionSchema),
  validateQuery(emptyObjectSchema),
  validateBody(emptyObjectSchema),
  pauseSession
);

/**
 * @route   POST /api/sessions/:id/end
 * @desc    Finalizar sesión
 * @access  Private (Teacher)
 * @validation params: sessionActionSchema | body: emptyObjectSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/end',
  authenticate,
  requireRole('teacher'),
  validateParams(sessionActionSchema),
  validateQuery(emptyObjectSchema),
  validateBody(emptyObjectSchema),
  endSession
);

/**
 * @route   PUT /api/sessions/:id
 * @desc    Actualizar sesión (solo si no ha iniciado)
 * @access  Private (Teacher)
 * @validation params: gameSessionParamsSchema | body: updateGameSessionSchema | query: emptyObjectSchema
 */
router.put(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameSessionParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(updateGameSessionSchema),
  updateSession
);

/**
 * @route   DELETE /api/sessions/:id
 * @desc    Eliminar sesión (solo si no ha iniciado)
 * @access  Private (Teacher)
 * @validation params: gameSessionParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameSessionParamsSchema),
  validateQuery(emptyObjectSchema),
  deleteSession
);

module.exports = router;
