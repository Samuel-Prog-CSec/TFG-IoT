/**
 * @fileoverview Controller dedicado a SystemAlerts (T-942).
 *
 * Endpoints (todos bajo `/api/admin/system-alerts`, `requireRole('super_admin')`):
 *  - GET    /                       list
 *  - GET    /summary                summary
 *  - GET    /effectiveness          effectiveness
 *  - GET    /:id                    getById
 *  - GET    /:id/history            history
 *  - PATCH  /:id/dismiss            dismiss
 *  - PATCH  /:id/resolve            resolve
 *  - PATCH  /:id/snooze             snooze
 *  - PATCH  /:id/pin                pin
 *  - PATCH  /:id/unpin              unpin
 *  - POST   /bulk-action            bulkAction
 *  - POST   /_debug/run-now         debugRunDetection (NODE_ENV !== 'production')
 *
 * @module controllers/systemAlertsController
 */

const { sendSuccess } = require('../utils/responseHelper');
const { cacheGet } = require('../utils/cacheHelper');
const { toSystemAlertDTOV1 } = require('../utils/dtos');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const systemAlertDetectionService = require('../services/analytics/systemAlertDetectionService');
const systemAlertRepository = require('../repositories/systemAlertRepository');
const userRepository = require('../repositories/userRepository');
const { SYSTEM_DETECTION_CONFIG } = require('../config/systemAlerts');

const CACHE_NAMESPACE = 'cache:system-alerts';

const buildListCacheKey = query =>
  `list:${query.status || 'active'}:sev:${query.severity || 'all'}:source:${query.source || 'all'}:type:${query.type || 'all'}:lim:${query.limit || 20}:cursor:${query.cursor || 'init'}`;

exports.list = async (req, res) => {
  const data = await cacheGet(
    CACHE_NAMESPACE,
    buildListCacheKey(req.query),
    async () => {
      const result = await systemAlertDetectionService.list({
        status: req.query.status,
        severity: req.query.severity,
        source: req.query.source,
        type: req.query.type,
        cursor: req.query.cursor,
        limit: req.query.limit
      });
      return {
        items: result.items.map(
          ({ raw, dismissedByName, resolvedByName, snoozedByName, pinnedByName }) =>
            toSystemAlertDTOV1(raw, {
              dismissedByName,
              resolvedByName,
              snoozedByName,
              pinnedByName
            })
        ),
        nextCursor: result.nextCursor
      };
    },
    SYSTEM_DETECTION_CONFIG.cacheTtlSeconds
  );
  sendSuccess(res, data);
};

exports.summary = async (req, res) => {
  const data = await cacheGet(
    CACHE_NAMESPACE,
    'summary',
    async () => systemAlertDetectionService.summary(),
    SYSTEM_DETECTION_CONFIG.cacheTtlSeconds
  );
  sendSuccess(res, data);
};

exports.effectiveness = async (req, res) => {
  const days = req.query.days || 30;
  const data = await cacheGet(
    CACHE_NAMESPACE,
    `effectiveness:${days}`,
    async () => systemAlertDetectionService.effectiveness({ days }),
    SYSTEM_DETECTION_CONFIG.cacheTtlSeconds
  );
  sendSuccess(res, data);
};

exports.getById = async (req, res) => {
  const alert = await systemAlertRepository.findById(req.params.id);
  if (!alert) {
    throw new NotFoundError('Alerta de sistema');
  }
  // Hidratar nombres
  const ids = [alert.dismissedBy, alert.resolvedBy, alert.snoozedBy, alert.pinnedBy].filter(
    Boolean
  );
  const users = ids.length
    ? await userRepository.find({ _id: { $in: ids } }, { select: 'name', lean: true })
    : [];
  const nameById = new Map(users.map(u => [String(u._id), u.name]));
  sendSuccess(
    res,
    toSystemAlertDTOV1(alert, {
      dismissedByName: alert.dismissedBy ? nameById.get(String(alert.dismissedBy)) || null : null,
      resolvedByName: alert.resolvedBy ? nameById.get(String(alert.resolvedBy)) || null : null,
      snoozedByName: alert.snoozedBy ? nameById.get(String(alert.snoozedBy)) || null : null,
      pinnedByName: alert.pinnedBy ? nameById.get(String(alert.pinnedBy)) || null : null
    })
  );
};

exports.history = async (req, res) => {
  const data = await systemAlertDetectionService.getHistory(req.params.id);
  sendSuccess(res, data);
};

exports.dismiss = async (req, res) => {
  const updated = await systemAlertDetectionService.dismissAlert(req.params.id, {
    reason: req.body.reason,
    userId: req.user._id
  });
  sendSuccess(res, toSystemAlertDTOV1(updated));
};

exports.resolve = async (req, res) => {
  const updated = await systemAlertDetectionService.resolveAlert(req.params.id, {
    userId: req.user._id
  });
  sendSuccess(res, toSystemAlertDTOV1(updated));
};

const resolveSnoozeUntilDate = body => {
  if (body.untilDate) {
    return new Date(body.untilDate);
  }
  if (body.untilHours) {
    return new Date(Date.now() + body.untilHours * 60 * 60 * 1000);
  }
  if (body.untilDays) {
    return new Date(Date.now() + body.untilDays * 86400000);
  }
  // Default 24h si no se especifica nada
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
};

exports.snooze = async (req, res) => {
  const untilDate = resolveSnoozeUntilDate(req.body || {});
  const updated = await systemAlertDetectionService.snoozeAlert(req.params.id, {
    untilDate,
    userId: req.user._id
  });
  sendSuccess(res, toSystemAlertDTOV1(updated));
};

exports.pin = async (req, res) => {
  const updated = await systemAlertDetectionService.pinAlert(req.params.id, {
    userId: req.user._id
  });
  sendSuccess(res, toSystemAlertDTOV1(updated));
};

exports.unpin = async (req, res) => {
  const updated = await systemAlertDetectionService.unpinAlert(req.params.id);
  sendSuccess(res, toSystemAlertDTOV1(updated));
};

exports.bulkAction = async (req, res) => {
  const { ids, action, reason, untilHours, untilDays, untilDate } = req.body;
  const opts = { reason, userId: req.user._id };
  if (action === 'snooze') {
    opts.untilDate = resolveSnoozeUntilDate({ untilHours, untilDays, untilDate });
  }
  const results = await systemAlertDetectionService.bulkAction(ids, action, opts);
  const ok = results.filter(r => r.ok).length;
  const failed = results.length - ok;
  const status = failed === 0 ? 200 : 207;
  sendSuccess(res, { results, ok, failed }, undefined, status);
};

/**
 * Endpoint debug solo en desarrollo: dispara una corrida inmediata.
 * Útil para QA y para probar detectores tras inyectar datos.
 */
exports.debugRunDetection = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    throw new ForbiddenError('Endpoint deshabilitado en producción');
  }
  const result = await systemAlertDetectionService.runDetection({
    dryRun: !!req.body?.dryRun
  });
  sendSuccess(res, result);
};
