/**
 * @fileoverview Rutas de gestión de tarjetas RFID.
 * Endpoints CRUD para tarjetas físicas.
 * @module routes/cards
 */

const express = require('express');
const router = express.Router();

const {
  getCards,
  getCardById,
  createCard,
  updateCard,
  deleteCard,
  createCardsBatch,
  getCardStats
} = require('../controllers/cardController');

const { authenticate, requireRole } = require('../middlewares/auth');
const { createResourceRateLimiter } = require('../config/security');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const {
  createCardSchema,
  updateCardSchema,
  cardQuerySchema,
  cardIdOrUidParamsSchema,
  cardIdParamsSchema,
  createCardsBatchSchema
} = require('../validators/cardValidator');
const { emptyObjectSchema } = require('../validators/commonValidator');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @route   GET /api/cards/stats
 * @desc    Obtener estadísticas de tarjetas
 * @access  Private (Teacher)
 * @validation query: emptyObjectSchema
 */
router.get(
  '/stats',
  authenticate,
  requireRole('teacher'),
  validateQuery(emptyObjectSchema),
  asyncHandler(getCardStats)
);

/**
 * @route   GET /api/cards
 * @desc    Obtener lista de tarjetas con filtros
 * @access  Private (Teacher)
 * @validation query: cardQuerySchema
 */
router.get(
  '/',
  authenticate,
  requireRole('teacher'),
  validateQuery(cardQuerySchema),
  asyncHandler(getCards)
);

/**
 * @route   GET /api/cards/:id
 * @desc    Obtener tarjeta por ID o UID
 * @access  Private (Teacher)
 * @validation params: cardIdOrUidParamsSchema | query: emptyObjectSchema
 */
router.get(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(cardIdOrUidParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(getCardById)
);

/**
 * @route   POST /api/cards
 * @desc    Registrar nueva tarjeta
 * @access  Private (Teacher)
 * @validation body: createCardSchema | query: emptyObjectSchema
 */
router.post(
  '/',
  createResourceRateLimiter, // Rate limiting para prevenir spam
  authenticate,
  requireRole('teacher'),
  validateQuery(emptyObjectSchema),
  validateBody(createCardSchema),
  asyncHandler(createCard)
);

/**
 * @route   POST /api/cards/batch
 * @desc    Registrar múltiples tarjetas
 * @access  Private (Teacher)
 * @validation body: createCardsBatchSchema | query: emptyObjectSchema
 */
router.post(
  '/batch',
  authenticate,
  requireRole('teacher'),
  validateQuery(emptyObjectSchema),
  validateBody(createCardsBatchSchema),
  asyncHandler(createCardsBatch)
);

/**
 * @route   PUT /api/cards/:id
 * @desc    Actualizar tarjeta
 * @access  Private (Teacher)
 * @validation params: cardIdParamsSchema | body: updateCardSchema | query: emptyObjectSchema
 */
router.put(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(cardIdParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(updateCardSchema),
  asyncHandler(updateCard)
);

/**
 * @route   DELETE /api/cards/:id
 * @desc    Eliminar tarjeta (soft delete)
 * @access  Private (Teacher)
 * @validation params: cardIdParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(cardIdParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(deleteCard)
);

module.exports = router;
