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
const { emptyObjectSchema } = require('../validators/commonValidator');

/**
 * @route   GET /api/decks
 * @desc    Listar mazos del profesor (con filtros)
 * @access  Private (Teacher)
 * @validation query: cardDeckQuerySchema
 */
router.get('/', authenticate, requireRole('teacher'), validateQuery(cardDeckQuerySchema), getDecks);

/**
 * @route   GET /api/decks/:id
 * @desc    Obtener mazo por ID
 * @access  Private (Teacher)
 * @validation params: cardDeckParamsSchema | query: emptyObjectSchema
 */
router.get(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(cardDeckParamsSchema),
  validateQuery(emptyObjectSchema),
  getDeckById
);

/**
 * @route   POST /api/decks
 * @desc    Crear nuevo mazo
 * @access  Private (Teacher)
 * @validation body: createCardDeckSchema | query: emptyObjectSchema
 */
router.post(
  '/',
  createResourceRateLimiter,
  authenticate,
  requireRole('teacher'),
  validateQuery(emptyObjectSchema),
  validateBody(createCardDeckSchema),
  createDeck
);

/**
 * @route   PUT /api/decks/:id
 * @desc    Actualizar mazo
 * @access  Private (Teacher)
 * @validation params: cardDeckParamsSchema | body: updateCardDeckSchema | query: emptyObjectSchema
 */
router.put(
  '/:id',
  createResourceRateLimiter,
  authenticate,
  requireRole('teacher'),
  validateParams(cardDeckParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(updateCardDeckSchema),
  updateDeck
);

/**
 * @route   DELETE /api/decks/:id
 * @desc    Eliminar (archivar) mazo
 * @access  Private (Teacher)
 * @validation params: cardDeckParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id',
  createResourceRateLimiter,
  authenticate,
  requireRole('teacher'),
  validateParams(cardDeckParamsSchema),
  validateQuery(emptyObjectSchema),
  deleteDeck
);

module.exports = router;
