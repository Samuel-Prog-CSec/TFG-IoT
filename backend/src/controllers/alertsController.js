/**
 * @fileoverview Controller dedicado a SmartAlerts (T-941).
 *
 * Sustituye los endpoints `getAlerts` / `getAlertsSummary` que vivían en
 * `analyticsAdvancedController.js` y trabajaban contra `alertsService` (legacy
 * on-the-fly). Ahora toda la lógica está persistida vía `alertDetectionService`.
 *
 * Endpoints:
 *  - GET    /api/analytics/alerts
 *  - GET    /api/analytics/alerts/summary
 *  - GET    /api/analytics/alerts/effectiveness
 *  - GET    /api/analytics/alerts/:id
 *  - GET    /api/analytics/alerts/:id/history
 *  - PATCH  /api/analytics/alerts/:id/dismiss
 *  - PATCH  /api/analytics/alerts/:id/resolve
 *  - PATCH  /api/analytics/alerts/:id/snooze
 *  - PATCH  /api/analytics/alerts/:id/pin
 *  - PATCH  /api/analytics/alerts/:id/unpin
 *  - POST   /api/analytics/alerts/bulk-action
 *
 * Autorización: `requireRole('teacher','super_admin')` ya aplica a nivel router.
 * El servicio aplica `getOwnedAlert` adicional para verificar `teacherId === user.id`.
 *
 * @module controllers/alertsController
 */

const { sendSuccess } = require('../utils/responseHelper');
const { cacheGet } = require('../utils/cacheHelper');
const { toSmartAlertDTOV1 } = require('../utils/dtos');
const { NotFoundError } = require('../utils/errors');
const alertDetectionService = require('../services/analytics/alertDetectionService');
const smartAlertRepository = require('../repositories/smartAlertRepository');
const userRepository = require('../repositories/userRepository');
const { DETECTION_CONFIG } = require('../config/alerts');

const CACHE_NAMESPACE = 'cache:alerts';

const isSuperAdmin = req => req.user?.role === 'super_admin';

const buildListCacheKey = (teacherId, query) =>
  `teacher:${teacherId}:status:${query.status || 'active'}:sev:${query.severity || 'all'}:type:${query.type || 'all'}:student:${query.studentId || 'all'}:lim:${query.limit || 20}:cursor:${query.cursor || 'init'}`;

/**
 * GET /api/analytics/alerts
 */
exports.list = async (req, res) => {
  const teacherId = req.user._id.toString();
  const cacheKey = buildListCacheKey(teacherId, req.query);

  const data = await cacheGet(
    CACHE_NAMESPACE,
    cacheKey,
    async () => {
      const result = await alertDetectionService.listForTeacher(teacherId, {
        status: req.query.status,
        severity: req.query.severity,
        type: req.query.type,
        studentId: req.query.studentId,
        cursor: req.query.cursor,
        limit: req.query.limit
      });
      return {
        items: result.items.map(({ raw, studentName, dismissedByName }) =>
          toSmartAlertDTOV1(raw, { studentName, dismissedByName })
        ),
        nextCursor: result.nextCursor
      };
    },
    DETECTION_CONFIG.cacheTtlSeconds
  );

  sendSuccess(res, data);
};

/**
 * GET /api/analytics/alerts/summary
 */
exports.summary = async (req, res) => {
  const teacherId = req.user._id.toString();
  const data = await cacheGet(
    CACHE_NAMESPACE,
    `teacher:${teacherId}:summary`,
    async () => alertDetectionService.summaryForTeacher(teacherId),
    DETECTION_CONFIG.cacheTtlSeconds
  );
  sendSuccess(res, data);
};

/**
 * GET /api/analytics/alerts/effectiveness
 */
exports.effectiveness = async (req, res) => {
  const teacherId = req.user._id.toString();
  const days = req.query.days || 30;
  const data = await cacheGet(
    CACHE_NAMESPACE,
    `teacher:${teacherId}:effectiveness:${days}`,
    async () => alertDetectionService.effectivenessForTeacher(teacherId, { days }),
    DETECTION_CONFIG.cacheTtlSeconds
  );
  sendSuccess(res, data);
};

/**
 * GET /api/analytics/alerts/:id
 */
exports.getById = async (req, res) => {
  const teacherId = req.user._id.toString();
  const alert = await smartAlertRepository.findById(req.params.id);
  if (!alert) {
    throw new NotFoundError('Alerta');
  }
  if (String(alert.teacherId) !== teacherId && !isSuperAdmin(req)) {
    throw new NotFoundError('Alerta');
  }
  // Hidratar nombres
  const [student, dismisser] = await Promise.all([
    userRepository.findById(alert.studentId, { select: 'name', lean: true }),
    alert.dismissedBy
      ? userRepository.findById(alert.dismissedBy, { select: 'name', lean: true })
      : null
  ]);
  sendSuccess(
    res,
    toSmartAlertDTOV1(alert, {
      studentName: student?.name || null,
      dismissedByName: dismisser?.name || null
    })
  );
};

/**
 * GET /api/analytics/alerts/:id/history
 */
exports.history = async (req, res) => {
  const teacherId = req.user._id.toString();
  const data = await alertDetectionService.getHistory(teacherId, req.params.id, {
    isSuperAdmin: isSuperAdmin(req)
  });
  sendSuccess(res, data);
};

/**
 * PATCH /api/analytics/alerts/:id/dismiss
 */
exports.dismiss = async (req, res) => {
  const teacherId = req.user._id.toString();
  const updated = await alertDetectionService.dismissAlert(teacherId, req.params.id, {
    reason: req.body.reason,
    userId: req.user._id,
    isSuperAdmin: isSuperAdmin(req)
  });
  sendSuccess(res, toSmartAlertDTOV1(updated));
};

/**
 * PATCH /api/analytics/alerts/:id/resolve
 */
exports.resolve = async (req, res) => {
  const teacherId = req.user._id.toString();
  const updated = await alertDetectionService.resolveAlert(teacherId, req.params.id, {
    userId: req.user._id,
    isSuperAdmin: isSuperAdmin(req)
  });
  sendSuccess(res, toSmartAlertDTOV1(updated));
};

/**
 * PATCH /api/analytics/alerts/:id/snooze
 */
exports.snooze = async (req, res) => {
  const teacherId = req.user._id.toString();
  const untilDate = req.body.untilDate
    ? new Date(req.body.untilDate)
    : new Date(Date.now() + (req.body.untilDays || 7) * 86400000);
  const updated = await alertDetectionService.snoozeAlert(teacherId, req.params.id, {
    untilDate,
    userId: req.user._id,
    isSuperAdmin: isSuperAdmin(req)
  });
  sendSuccess(res, toSmartAlertDTOV1(updated));
};

/**
 * PATCH /api/analytics/alerts/:id/pin
 */
exports.pin = async (req, res) => {
  const teacherId = req.user._id.toString();
  const updated = await alertDetectionService.pinAlert(teacherId, req.params.id, {
    userId: req.user._id,
    isSuperAdmin: isSuperAdmin(req)
  });
  sendSuccess(res, toSmartAlertDTOV1(updated));
};

/**
 * PATCH /api/analytics/alerts/:id/unpin
 */
exports.unpin = async (req, res) => {
  const teacherId = req.user._id.toString();
  const updated = await alertDetectionService.unpinAlert(teacherId, req.params.id, {
    userId: req.user._id,
    isSuperAdmin: isSuperAdmin(req)
  });
  sendSuccess(res, toSmartAlertDTOV1(updated));
};

/**
 * POST /api/analytics/alerts/bulk-action
 */
exports.bulkAction = async (req, res) => {
  const teacherId = req.user._id.toString();
  const { ids, action, reason, untilDays, untilDate } = req.body;
  const opts = {
    reason,
    userId: req.user._id,
    isSuperAdmin: isSuperAdmin(req)
  };
  if (action === 'snooze') {
    opts.untilDate = untilDate
      ? new Date(untilDate)
      : new Date(Date.now() + (untilDays || 7) * 86400000);
  }
  const results = await alertDetectionService.bulkAction(teacherId, ids, action, opts);
  const ok = results.filter(r => r.ok).length;
  const failed = results.length - ok;
  const status = failed === 0 ? 200 : 207;
  sendSuccess(res, { results, ok, failed }, undefined, status);
};
