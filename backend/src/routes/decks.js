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
  checkCard,
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
  cardDeckParamsSchema,
  checkCardQuerySchema
} = require('../validators/cardDeckValidator');
const { emptyObjectSchema } = require('../validators/commonValidator');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @route   GET /api/decks
 * @desc    Listar mazos del profesor (con filtros)
 * @access  Private (Teacher)
 * @validation query: cardDeckQuerySchema
 */
router.get(
  '/',
  authenticate,
  requireRole('teacher'),
  validateQuery(cardDeckQuerySchema),
  asyncHandler(getDecks)
);

/**
 * @route   GET /api/decks/check-card
 * @desc    Verificar si un UID existe en otros mazos activos del profesor (ADR-022)
 * @access  Private (Teacher)
 * @validation query: checkCardQuerySchema
 */
router.get(
  '/check-card',
  authenticate,
  requireRole('teacher'),
  validateQuery(checkCardQuerySchema),
  asyncHandler(checkCard)
);

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
  asyncHandler(getDeckById)
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
  asyncHandler(createDeck)
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
  asyncHandler(updateDeck)
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
  asyncHandler(deleteDeck)
);

module.exports = router;
