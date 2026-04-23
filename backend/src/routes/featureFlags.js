/**
 * @fileoverview Rutas para feature flags.
 *
 * Este router se monta DOS veces:
 *   - En `/api/admin/flags` (adminRoutes.use) → endpoints de administración con super_admin.
 *   - En `/api/me/flags` (server.js) → endpoint self-service de cualquier usuario autenticado.
 *
 * Exportamos ambos routers por separado para que server.js y adminRoutes los usen.
 *
 * @module routes/featureFlags
 */

const express = require('express');

const { authenticate, requireRole } = require('../middlewares/auth');
const { validateBody, validateParams } = require('../middlewares/validation');
const { flagNameParamsSchema, upsertFlagSchema } = require('../validators/featureFlagValidator');
const asyncHandler = require('../utils/asyncHandler');
const {
  listFlags,
  getFlag,
  upsertFlag,
  deleteFlag,
  getMyFlags
} = require('../controllers/featureFlagsController');

// =============================================================================
// Admin router: CRUD completo (super_admin)
// =============================================================================

const adminRouter = express.Router();

adminRouter.use(authenticate, requireRole('super_admin'));

/**
 * @route   GET /api/admin/flags
 * @desc    Listar todas las feature flags registradas
 * @access  Private (super_admin)
 */
adminRouter.get('/', asyncHandler(listFlags));

/**
 * @route   GET /api/admin/flags/:name
 * @desc    Obtener una feature flag concreta
 * @access  Private (super_admin)
 */
adminRouter.get('/:name', validateParams(flagNameParamsSchema), asyncHandler(getFlag));

/**
 * @route   PATCH /api/admin/flags/:name
 * @desc    Crear o actualizar una feature flag (idempotente)
 * @access  Private (super_admin)
 * @validation params: flagNameParamsSchema | body: upsertFlagSchema
 */
adminRouter.patch(
  '/:name',
  validateParams(flagNameParamsSchema),
  validateBody(upsertFlagSchema),
  asyncHandler(upsertFlag)
);

/**
 * @route   DELETE /api/admin/flags/:name
 * @desc    Eliminar una feature flag
 * @access  Private (super_admin)
 */
adminRouter.delete('/:name', validateParams(flagNameParamsSchema), asyncHandler(deleteFlag));

// =============================================================================
// Self-service router: mapa de flags para el usuario actual
// =============================================================================

const meRouter = express.Router();

meRouter.use(authenticate);

/**
 * @route   GET /api/me/flags
 * @desc    Obtener las feature flags evaluadas para el usuario autenticado.
 *          El frontend usa este mapa como fuente de verdad para el hook useFeatureFlag.
 * @access  Private (autenticado)
 */
meRouter.get('/', asyncHandler(getMyFlags));

module.exports = {
  adminRouter,
  meRouter
};
