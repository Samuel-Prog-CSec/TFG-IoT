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
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const { createResourceRateLimiter } = require('../config/security');
const {
  createCardSchema,
  updateCardSchema,
  cardQuerySchema,
  cardParamsSchema
} = require('../validators/cardValidator');

/**
 * @route   GET /api/cards/stats
 * @desc    Obtener estadísticas de tarjetas
 * @access  Private (Teacher)
 */
router.get('/stats', authenticate, requireRole('teacher'), getCardStats);

/**
 * @route   GET /api/cards
 * @desc    Obtener lista de tarjetas con filtros
 * @access  Private (Teacher)
 */
router.get('/', authenticate, requireRole('teacher'), validateQuery(cardQuerySchema), getCards);

/**
 * @route   GET /api/cards/:id
 * @desc    Obtener tarjeta por ID o UID
 * @access  Private (Teacher)
 */
router.get('/:id', authenticate, requireRole('teacher'), getCardById);

/**
 * @route   POST /api/cards
 * @desc    Registrar nueva tarjeta
 * @access  Private (Teacher)
 */
router.post(
  '/',
  createResourceRateLimiter, // Rate limiting para prevenir spam
  authenticate,
  requireRole('teacher'),
  validateBody(createCardSchema),
  createCard
);

/**
 * @route   POST /api/cards/batch
 * @desc    Registrar múltiples tarjetas
 * @access  Private (Teacher)
 */
router.post('/batch', authenticate, requireRole('teacher'), createCardsBatch);

/**
 * @route   PUT /api/cards/:id
 * @desc    Actualizar tarjeta
 * @access  Private (Teacher)
 */
router.put(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateBody(updateCardSchema),
  updateCard
);

/**
 * @route   DELETE /api/cards/:id
 * @desc    Eliminar tarjeta (soft delete)
 * @access  Private (Teacher)
 */
router.delete('/:id', authenticate, requireRole('teacher'), deleteCard);

module.exports = router;
