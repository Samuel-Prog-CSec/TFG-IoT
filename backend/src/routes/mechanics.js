/**
 * @fileoverview Rutas de gestión de mecánicas de juego.
 *
 * Las mecánicas (association, sequence, memory, ...) son inmutables a nivel
 * de API. Se definen en los seeders del proyecto y solo los desarrolladores
 * pueden añadir, modificar o eliminar mecánicas mediante migraciones.
 *
 * Por seguridad y consistencia del producto, los métodos POST/PUT/PATCH/DELETE
 * sobre /api/mechanics están deshabilitados para todos los roles, incluido
 * super_admin. Cualquier intento devuelve 405 Method Not Allowed.
 *
 * @module routes/mechanics
 */

const express = require('express');
const router = express.Router();

const {
  getMechanics,
  getMechanicById,
  getActiveMechanics
} = require('../controllers/gameMechanicController');

const { authenticate, requireRole, optionalAuth } = require('../middlewares/auth');
const { validateQuery, validateParams } = require('../middlewares/validation');
const {
  gameMechanicQuerySchema,
  gameMechanicParamsSchema
} = require('../validators/gameMechanicValidator');
const { emptyObjectSchema } = require('../validators/commonValidator');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Handler genérico para métodos no permitidos sobre el recurso de mecánicas.
 * Devuelve 405 con el header Allow indicando los métodos válidos.
 */
const mechanicMethodNotAllowed = (req, res) => {
  res.set('Allow', 'GET');
  return res.status(405).json({
    success: false,
    error: 'Method Not Allowed',
    message:
      'Las mecánicas de juego son inmutables. Solo los desarrolladores pueden añadir, modificar o eliminar mecánicas mediante seeders y migraciones del backend.'
  });
};

/**
 * @route   GET /api/mechanics/active
 * @desc    Obtener solo mecánicas activas (público para frontend)
 * @access  Public (con auth opcional)
 * @validation query: emptyObjectSchema
 *
 * @openapi
 * /mechanics/active:
 *   get:
 *     tags: [Mechanics]
 *     summary: Listar mecánicas activas (público)
 *     description: Endpoint público. El frontend lo consulta antes del login para mostrar mecánicas habilitadas.
 *     security: []
 *     responses:
 *       200:
 *         description: Lista de mecánicas activas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Mechanic' } }
 */
router.get(
  '/active',
  optionalAuth,
  validateQuery(emptyObjectSchema),
  asyncHandler(getActiveMechanics)
);

/**
 * @route   GET /api/mechanics
 * @desc    Obtener lista de mecánicas con filtros
 * @access  Private (Teacher, Super Admin)
 * @validation query: gameMechanicQuerySchema
 *
 * @openapi
 * /mechanics:
 *   get:
 *     tags: [Mechanics]
 *     summary: Listar todas las mecánicas
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Lista completa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Mechanic' } }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */

/**
 * @openapi
 * /mechanics:
 *   post:
 *     tags: [Mechanics]
 *     summary: Crear mecánica (no permitido)
 *     description: Las mecánicas son inmutables vía API — solo se gestionan por seeders/migraciones del backend.
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     responses:
 *       405:
 *         description: Method Not Allowed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 */
router.get(
  '/',
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateQuery(gameMechanicQuerySchema),
  asyncHandler(getMechanics)
);

/**
 * @route   GET /api/mechanics/:id
 * @desc    Obtener mecánica por ID o nombre
 * @access  Private (Teacher, Super Admin)
 * @validation params: gameMechanicParamsSchema | query: emptyObjectSchema
 *
 * @openapi
 * /mechanics/{id}:
 *   get:
 *     tags: [Mechanics]
 *     summary: Obtener mecánica por ID o slug (association|memory|sequence)
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Mecánica encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Mechanic' }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get(
  '/:id',
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateParams(gameMechanicParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(getMechanicById)
);

// Mecánicas inmutables: bloqueamos cualquier intento de write para todos los roles.
router.post('/', mechanicMethodNotAllowed);
router.put('/:id', mechanicMethodNotAllowed);
router.patch('/:id', mechanicMethodNotAllowed);
router.delete('/:id', mechanicMethodNotAllowed);

module.exports = router;
