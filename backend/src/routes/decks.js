/**
 * @fileoverview Rutas de gestión de mazos (CardDeck).
 * Endpoints CRUD para mazos de tarjetas reutilizables.
 * @module routes/decks
 */

const express = require('express');
const router = express.Router();

const {
  getDecks,
  getDeckById,
  createDeck,
  updateDeck,
  deleteDeck
} = require('../controllers/cardDeckController');

const { authenticate, requireRole } = require('../middlewares/auth');
const { createResourceRateLimiter } = require('../config/security');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const {
  createCardDeckSchema,
  updateCardDeckSchema,
  cardDeckQuerySchema,
  cardDeckParamsSchema
} = require('../validators/cardDeckValidator');

/**
 * @route   GET /api/decks
 * @desc    Listar mazos del profesor (con filtros)
 * @access  Private (Teacher)
 */
router.get('/', authenticate, requireRole('teacher'), validateQuery(cardDeckQuerySchema), getDecks);

/**
 * @route   GET /api/decks/:id
 * @desc    Obtener mazo por ID
 * @access  Private (Teacher)
 */
router.get(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(cardDeckParamsSchema),
  getDeckById
);

/**
 * @route   POST /api/decks
 * @desc    Crear nuevo mazo
 * @access  Private (Teacher)
 */
router.post(
  '/',
  createResourceRateLimiter,
  authenticate,
  requireRole('teacher'),
  validateBody(createCardDeckSchema),
  createDeck
);

/**
 * @route   PUT /api/decks/:id
 * @desc    Actualizar mazo
 * @access  Private (Teacher)
 */
router.put(
  '/:id',
  createResourceRateLimiter,
  authenticate,
  requireRole('teacher'),
  validateParams(cardDeckParamsSchema),
  validateBody(updateCardDeckSchema),
  updateDeck
);

/**
 * @route   DELETE /api/decks/:id
 * @desc    Eliminar (archivar) mazo
 * @access  Private (Teacher)
 */
router.delete(
  '/:id',
  createResourceRateLimiter,
  authenticate,
  requireRole('teacher'),
  validateParams(cardDeckParamsSchema),
  deleteDeck
);

module.exports = router;
