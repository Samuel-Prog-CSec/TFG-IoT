/**
 * @fileoverview Rutas REST de SystemAlerts y SystemAnnouncements (T-942).
 *
 * Todas las rutas requieren autenticación. Las rutas admin requieren además
 * `requireRole('super_admin')`. `/api/announcements/active` solo necesita
 * autenticación: la audiencia se decide en el service según `req.user.role`.
 *
 * @module routes/systemAlerts
 */

const express = require('express');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const asyncHandler = require('../utils/asyncHandler');
const systemAlertsController = require('../controllers/systemAlertsController');
const systemAnnouncementsController = require('../controllers/systemAnnouncementsController');
const {
  systemAlertIdParamsSchema,
  listSystemAlertsQuerySchema,
  systemAlertsSummaryQuerySchema,
  systemAlertsEffectivenessQuerySchema,
  dismissSystemAlertBodySchema,
  snoozeSystemAlertBodySchema,
  bulkSystemAlertActionBodySchema
} = require('../validators/systemAlertsValidator');
const {
  announcementIdParamsSchema,
  listAnnouncementsQuerySchema,
  createAnnouncementBodySchema,
  updateAnnouncementBodySchema
} = require('../validators/systemAnnouncementsValidator');

// Router separado para `/admin/*` y otro para `/announcements/active` —
// los montamos ambos a continuación.
const adminRouter = express.Router();
const publicRouter = express.Router();

// ────── /api/admin/system-alerts/* (super_admin) ──────────────────────

adminRouter.use('/system-alerts', authenticate, requireRole('super_admin'));

adminRouter.get(
  '/system-alerts',
  validateQuery(listSystemAlertsQuerySchema),
  asyncHandler(systemAlertsController.list)
);

adminRouter.get(
  '/system-alerts/summary',
  validateQuery(systemAlertsSummaryQuerySchema),
  asyncHandler(systemAlertsController.summary)
);

adminRouter.get(
  '/system-alerts/effectiveness',
  validateQuery(systemAlertsEffectivenessQuerySchema),
  asyncHandler(systemAlertsController.effectiveness)
);

adminRouter.get(
  '/system-alerts/:id',
  validateParams(systemAlertIdParamsSchema),
  asyncHandler(systemAlertsController.getById)
);

adminRouter.get(
  '/system-alerts/:id/history',
  validateParams(systemAlertIdParamsSchema),
  asyncHandler(systemAlertsController.history)
);

adminRouter.patch(
  '/system-alerts/:id/dismiss',
  validateParams(systemAlertIdParamsSchema),
  validateBody(dismissSystemAlertBodySchema),
  asyncHandler(systemAlertsController.dismiss)
);

adminRouter.patch(
  '/system-alerts/:id/resolve',
  validateParams(systemAlertIdParamsSchema),
  asyncHandler(systemAlertsController.resolve)
);

adminRouter.patch(
  '/system-alerts/:id/snooze',
  validateParams(systemAlertIdParamsSchema),
  validateBody(snoozeSystemAlertBodySchema),
  asyncHandler(systemAlertsController.snooze)
);

adminRouter.patch(
  '/system-alerts/:id/pin',
  validateParams(systemAlertIdParamsSchema),
  asyncHandler(systemAlertsController.pin)
);

adminRouter.patch(
  '/system-alerts/:id/unpin',
  validateParams(systemAlertIdParamsSchema),
  asyncHandler(systemAlertsController.unpin)
);

adminRouter.post(
  '/system-alerts/bulk-action',
  validateBody(bulkSystemAlertActionBodySchema),
  asyncHandler(systemAlertsController.bulkAction)
);

// Debug en dev — útil para QA Playwright (force-run detection).
// Bloqueado en producción: el endpoint dispara el motor entero y podría usarse
// para amplificar carga o desencadenar notificaciones inesperadas. Si en algún
// momento se necesita en producción, pasa por feature flag explícito en lugar
// de quitar este guard.
if (process.env.NODE_ENV !== 'production') {
  adminRouter.post(
    '/system-alerts/_debug/run-now',
    asyncHandler(systemAlertsController.debugRunDetection)
  );
}

// ────── /api/admin/announcements/* (super_admin) ──────────────────────

adminRouter.use('/announcements', authenticate, requireRole('super_admin'));

adminRouter.get(
  '/announcements',
  validateQuery(listAnnouncementsQuerySchema),
  asyncHandler(systemAnnouncementsController.list)
);

adminRouter.post(
  '/announcements',
  validateBody(createAnnouncementBodySchema),
  asyncHandler(systemAnnouncementsController.create)
);

adminRouter.patch(
  '/announcements/:id',
  validateParams(announcementIdParamsSchema),
  validateBody(updateAnnouncementBodySchema),
  asyncHandler(systemAnnouncementsController.update)
);

adminRouter.patch(
  '/announcements/:id/archive',
  validateParams(announcementIdParamsSchema),
  asyncHandler(systemAnnouncementsController.archive)
);

// ────── /api/announcements/active (cualquier rol autenticado) ────────

publicRouter.get('/active', authenticate, asyncHandler(systemAnnouncementsController.listPublic));

module.exports = { adminRouter, publicRouter };
