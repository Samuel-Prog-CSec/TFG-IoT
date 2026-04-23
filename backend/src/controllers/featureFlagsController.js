/**
 * @fileoverview Controllers para la gestión de feature flags.
 *
 * Los endpoints admin (GET/PATCH/DELETE /api/admin/flags/*) requieren rol super_admin.
 * El endpoint /api/me/flags es accesible por cualquier usuario autenticado y devuelve
 * el mapa de flags evaluadas para su userId.
 *
 * @module controllers/featureFlagsController
 */

const featureFlagService = require('../services/featureFlagService');
const { NotFoundError } = require('../utils/errors');
const { sendSuccess, sendNoContent } = require('../utils/responseHelper');
const logger = require('../utils/logger');

/**
 * GET /api/admin/flags
 */
const listFlags = async (req, res) => {
  const flags = await featureFlagService.listFlags();
  sendSuccess(res, { flags });
};

/**
 * GET /api/admin/flags/:name
 */
const getFlag = async (req, res) => {
  const { name } = req.params;
  const flag = await featureFlagService.getFlag(name);
  if (!flag) {
    throw new NotFoundError('Feature flag');
  }
  sendSuccess(res, { flag });
};

/**
 * PATCH /api/admin/flags/:name
 *
 * Crea o actualiza la flag con los valores del body. Idempotente.
 */
const upsertFlag = async (req, res) => {
  const { name } = req.params;
  const updatedBy = req.user?._id?.toString?.();

  const flag = await featureFlagService.setFlag(name, req.body, updatedBy);

  logger.info('Flag actualizada vía API admin', {
    name,
    enabled: flag.enabled,
    rolloutPct: flag.rolloutPct,
    actor: updatedBy
  });

  sendSuccess(res, { flag }, 'Feature flag actualizada');
};

/**
 * DELETE /api/admin/flags/:name
 */
const deleteFlag = async (req, res) => {
  const { name } = req.params;
  const existed = await featureFlagService.getFlag(name);
  if (!existed) {
    throw new NotFoundError('Feature flag');
  }
  await featureFlagService.deleteFlag(name);
  sendNoContent(res);
};

/**
 * GET /api/me/flags
 *
 * Devuelve el evaluado de todas las flags conocidas para el userId del request.
 * El frontend cachea este mapa en AuthContext y lo consulta síncronamente
 * vía `useFeatureFlag(name)`.
 */
const getMyFlags = async (req, res) => {
  const userId = req.user?._id?.toString?.() || null;
  const flags = await featureFlagService.evaluateAllForUser(userId);
  sendSuccess(res, { flags });
};

module.exports = {
  listFlags,
  getFlag,
  upsertFlag,
  deleteFlag,
  getMyFlags
};
