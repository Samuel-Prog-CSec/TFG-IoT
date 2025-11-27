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
  getPlayerStats
} = require('../controllers/gamePlayController');

const { authenticate, requireRole } = require('../middlewares/auth');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const { createResourceRateLimiter, eventRateLimiter } = require('../config/security');
const {
  createGamePlaySchema,
  addEventSchema,
  gamePlayQuerySchema,
  gamePlayParamsSchema,
  playerStatsQuerySchema
} = require('../validators/gamePlayValidator');

/**
 * @route   GET /api/plays/stats/:playerId
 * @desc    Obtener estadísticas de un jugador
 * @access  Private
 */
router.get(
  '/stats/:playerId',
  authenticate,
  validateParams(gamePlayParamsSchema.extend({
    playerId: gamePlayParamsSchema.shape.id
  })),
  validateQuery(playerStatsQuerySchema),
  getPlayerStats
);

/**
 * @route   GET /api/plays
 * @desc    Obtener lista de partidas con filtros
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  validateQuery(gamePlayQuerySchema),
  getPlays
);

/**
 * @route   GET /api/plays/:id
 * @desc    Obtener partida por ID
 * @access  Private
 */
router.get(
  '/:id',
  authenticate,
  validateParams(gamePlayParamsSchema),
  getPlayById
);

/**
 * @route   POST /api/plays
 * @desc    Crear nueva partida (profesor asigna a alumno)
 * @access  Private (Teacher)
 */
router.post(
  '/',
  createResourceRateLimiter, // Rate limiting para prevenir spam
  authenticate,
  requireRole('teacher'),
  validateBody(createGamePlaySchema),
  createPlay
);

/**
 * @route   POST /api/plays/:id/events
 * @desc    Añadir evento a una partida (usado por GameEngine)
 * @access  Private
 */
router.post(
  '/:id/events',
  eventRateLimiter, // Rate limiter permisivo para eventos de juego en tiempo real
  authenticate,
  validateParams(gamePlayParamsSchema),
  validateBody(addEventSchema),
  addEvent
);

/**
 * @route   POST /api/plays/:id/complete
 * @desc    Completar una partida
 * @access  Private
 */
router.post(
  '/:id/complete',
  authenticate,
  validateParams(gamePlayParamsSchema),
  completePlay
);

/**
 * @route   POST /api/plays/:id/abandon
 * @desc    Abandonar una partida
 * @access  Private
 */
router.post(
  '/:id/abandon',
  authenticate,
  validateParams(gamePlayParamsSchema),
  abandonPlay
);

module.exports = router;
