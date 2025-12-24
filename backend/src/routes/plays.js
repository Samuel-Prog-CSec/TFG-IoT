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
const { createResourceRateLimiter, eventRateLimiter } = require('../config/security');

/**
 * @route   GET /api/plays/stats/:playerId
 * @desc    Obtener estadísticas de un jugador
 * @access  Private
 */
router.get(
  '/stats/:playerId',
  authenticate,
  getPlayerStats
);

/**
 * @route   GET /api/plays
 * @desc    Obtener lista de partidas con filtros
 * @access  Private
 */
router.get('/', authenticate, getPlays);

/**
 * @route   GET /api/plays/:id
 * @desc    Obtener partida por ID
 * @access  Private
 */
router.get('/:id', authenticate, getPlayById);

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
  addEvent
);

/**
 * @route   POST /api/plays/:id/complete
 * @desc    Completar una partida
 * @access  Private
 */
router.post('/:id/complete', authenticate, completePlay);

/**
 * @route   POST /api/plays/:id/abandon
 * @desc    Abandonar una partida
 * @access  Private
 */
router.post('/:id/abandon', authenticate, abandonPlay);

module.exports = router;
