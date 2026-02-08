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
const { createResourceRateLimiter } = require('../config/security');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const {
  createGameMechanicSchema,
  updateGameMechanicSchema,
  gameMechanicQuerySchema,
  gameMechanicParamsSchema,
  gameMechanicIdParamsSchema
} = require('../validators/gameMechanicValidator');
const { emptyObjectSchema } = require('../validators/commonValidator');

/**
 * @route   GET /api/mechanics/active
 * @desc    Obtener solo mecánicas activas (público para frontend)
 * @access  Public (con auth opcional)
 * @validation query: emptyObjectSchema
 */
router.get('/active', optionalAuth, validateQuery(emptyObjectSchema), getActiveMechanics);

/**
 * @route   GET /api/mechanics
 * @desc    Obtener lista de mecánicas con filtros
 * @access  Private (Teacher)
 * @validation query: gameMechanicQuerySchema
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
 * @validation params: gameMechanicParamsSchema | query: emptyObjectSchema
 */
router.get(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameMechanicParamsSchema),
  validateQuery(emptyObjectSchema),
  getMechanicById
);

/**
 * @route   POST /api/mechanics
 * @desc    Crear nueva mecánica
 * @access  Private (Teacher)
 * @validation body: createGameMechanicSchema | query: emptyObjectSchema
 */
router.post(
  '/',
  createResourceRateLimiter, // Rate limiting para prevenir spam
  authenticate,
  requireRole('teacher'),
  validateQuery(emptyObjectSchema),
  validateBody(createGameMechanicSchema),
  createMechanic
);

/**
 * @route   PUT /api/mechanics/:id
 * @desc    Actualizar mecánica
 * @access  Private (Teacher)
 * @validation params: gameMechanicIdParamsSchema | body: updateGameMechanicSchema | query: emptyObjectSchema
 */
router.put(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameMechanicIdParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(updateGameMechanicSchema),
  updateMechanic
);

/**
 * @route   DELETE /api/mechanics/:id
 * @desc    Eliminar mecánica (soft delete)
 * @access  Private (Teacher)
 * @validation params: gameMechanicIdParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameMechanicIdParamsSchema),
  validateQuery(emptyObjectSchema),
  deleteMechanic
);

module.exports = router;
