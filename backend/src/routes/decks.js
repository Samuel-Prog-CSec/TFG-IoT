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

/**
 * @openapi
 * /decks:
 *   get:
 *     tags: [Decks]
 *     summary: Listar mazos del profesor autenticado
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: context
 *         schema: { type: string }
 *       - in: query
 *         name: mechanic
 *         schema: { type: string }
 *       - in: query
 *         name: includeArchived
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Lista de mazos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Deck' } }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */

/**
 * @openapi
 * /decks:
 *   post:
 *     tags: [Decks]
 *     summary: Crear nuevo mazo
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, context, mechanic, cards]
 *             properties:
 *               name: { type: string }
 *               context: { type: string }
 *               mechanic: { type: string }
 *               cards: { type: array, items: { type: object } }
 *     responses:
 *       201:
 *         description: Mazo creado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Deck' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/RateLimitError' }
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

/**
 * @openapi
 * /decks/check-card:
 *   get:
 *     tags: [Decks]
 *     summary: Comprobar duplicidad de UID RFID en mazos del profesor
 *     description: |
 *       Implementa la política "un UID solo en un mazo activo por profesor" (ADR-022).
 *       Devuelve el mazo en conflicto si aplica, para que el wizard lo resuelva antes de guardar.
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: excludeDeck
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Resultado del chequeo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     exists: { type: boolean }
 *                     deck: { $ref: '#/components/schemas/Deck' }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
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
  authenticate,
  createResourceRateLimiter,
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
  authenticate,
  createResourceRateLimiter,
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

/**
 * @openapi
 * /decks/{id}:
 *   delete:
 *     tags: [Decks]
 *     summary: Archivar mazo (soft delete)
 *     description: El mazo se marca como archivado y deja de aparecer en listas por defecto. Se conserva por trazabilidad.
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Mazo archivado }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.delete(
  '/:id',
  authenticate,
  createResourceRateLimiter,
  requireRole('teacher'),
  validateParams(cardDeckParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(deleteDeck)
);

module.exports = router;
