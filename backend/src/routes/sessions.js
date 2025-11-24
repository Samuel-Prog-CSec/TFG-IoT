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
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const {
  createGameSessionSchema,
  updateGameSessionSchema,
  gameSessionQuerySchema,
  gameSessionParamsSchema
} = require('../validators/gameSessionValidator');
const { createResourceRateLimiter } = require('../config/security');

/**
 * @route   GET /api/sessions
 * @desc    Obtener lista de sesiones con filtros
 * @access  Private (Teacher)
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
 */
router.get(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameSessionParamsSchema),
  getSessionById
);

/**
 * @route   POST /api/sessions
 * @desc    Crear nueva sesión
 * @access  Private (Teacher)
 */
router.post(
  '/',
  createResourceRateLimiter, // Rate limit específico para creación
  authenticate,
  requireRole('teacher'),
  validateBody(createGameSessionSchema),
  createSession
);

/**
 * @route   POST /api/sessions/:id/start
 * @desc    Iniciar sesión
 * @access  Private (Teacher)
 */
router.post(
  '/:id/start',
  authenticate,
  requireRole('teacher'),
  validateParams(gameSessionParamsSchema),
  startSession
);

/**
 * @route   POST /api/sessions/:id/pause
 * @desc    Pausar sesión activa
 * @access  Private (Teacher)
 */
router.post(
  '/:id/pause',
  authenticate,
  requireRole('teacher'),
  validateParams(gameSessionParamsSchema),
  pauseSession
);

/**
 * @route   POST /api/sessions/:id/end
 * @desc    Finalizar sesión
 * @access  Private (Teacher)
 */
router.post(
  '/:id/end',
  authenticate,
  requireRole('teacher'),
  validateParams(gameSessionParamsSchema),
  endSession
);

/**
 * @route   PUT /api/sessions/:id
 * @desc    Actualizar sesión (solo si no ha iniciado)
 * @access  Private (Teacher)
 */
router.put(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameSessionParamsSchema),
  validateBody(updateGameSessionSchema),
  updateSession
);

/**
 * @route   DELETE /api/sessions/:id
 * @desc    Eliminar sesión (solo si no ha iniciado)
 * @access  Private (Teacher)
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameSessionParamsSchema),
  deleteSession
);

module.exports = router;
