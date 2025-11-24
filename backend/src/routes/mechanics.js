/**
 * @fileoverview Rutas de gestión de mecánicas de juego.
 * Endpoints CRUD para mecánicas (association, sequence, memory, etc.).
 * @module routes/mechanics
 */

const express = require('express');
const router = express.Router();

const {
  getMechanics,
  getMechanicById,
  createMechanic,
  updateMechanic,
  deleteMechanic,
  getActiveMechanics
} = require('../controllers/gameMechanicController');

const { authenticate, requireRole, optionalAuth } = require('../middlewares/auth');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const {
  createGameMechanicSchema,
  updateGameMechanicSchema,
  gameMechanicQuerySchema,
  gameMechanicParamsSchema
} = require('../validators/gameMechanicValidator');

/**
 * @route   GET /api/mechanics/active
 * @desc    Obtener solo mecánicas activas (público para frontend)
 * @access  Public (con auth opcional)
 */
router.get('/active', optionalAuth, getActiveMechanics);

/**
 * @route   GET /api/mechanics
 * @desc    Obtener lista de mecánicas con filtros
 * @access  Private (Teacher)
 */
router.get(
  '/',
  authenticate,
  requireRole('teacher'),
  validateQuery(gameMechanicQuerySchema),
  getMechanics
);

/**
 * @route   GET /api/mechanics/:id
 * @desc    Obtener mecánica por ID o nombre
 * @access  Private (Teacher)
 */
router.get(
  '/:id',
  authenticate,
  requireRole('teacher'),
  getMechanicById
);

/**
 * @route   POST /api/mechanics
 * @desc    Crear nueva mecánica
 * @access  Private (Teacher)
 */
router.post(
  '/',
  authenticate,
  requireRole('teacher'),
  validateBody(createGameMechanicSchema),
  createMechanic
);

/**
 * @route   PUT /api/mechanics/:id
 * @desc    Actualizar mecánica
 * @access  Private (Teacher)
 */
router.put(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameMechanicParamsSchema),
  validateBody(updateGameMechanicSchema),
  updateMechanic
);

/**
 * @route   DELETE /api/mechanics/:id
 * @desc    Eliminar mecánica (soft delete)
 * @access  Private (Teacher)
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameMechanicParamsSchema),
  deleteMechanic
);

module.exports = router;
