/**
 * @fileoverview Controller para analíticas tenancy-wide (super_admin).
 *
 * Delgado: valida (vía Zod en la ruta), cachea el resultado del service
 * en Redis con TTL 5min (alineado con el resto de analytics del docente)
 * y responde con `sendSuccess`. T-942 Fase B.
 *
 * @module controllers/adminAnalyticsController
 */

const adminAnalyticsService = require('../services/adminAnalyticsService');
const { sendSuccess } = require('../utils/responseHelper');
const { cacheGet } = require('../utils/cacheHelper');

const OVERVIEW_TTL_SECONDS = 300;

/**
 * Devuelve los KPIs agregados del centro educativo para el AdminDashboard.
 *
 * @route GET /api/admin/analytics/overview?timeRange=7d|30d|90d
 */
exports.getOverview = async (req, res) => {
  const { timeRange } = req.query;
  const data = await cacheGet(
    'cache:analytics',
    `admin:overview:${timeRange}`,
    async () => adminAnalyticsService.getCenterOverview({ timeRange }),
    OVERVIEW_TTL_SECONDS
  );
  return sendSuccess(res, data);
};
