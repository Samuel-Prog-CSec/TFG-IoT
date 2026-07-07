/**
 * @fileoverview Rutas de informes y plantillas (T-942 Fase B).
 *
 * Cubre el área "Informes" del frontend (`InsightsReports.jsx` tab Informes):
 * - Plantillas predefinidas que rellenan el formulario.
 * - Persistencia de informes generados ("Informes recientes" + reabrir).
 *
 * Autorización:
 * - GET /templates           → teacher + super_admin.
 * - POST/DELETE /templates   → super_admin.
 * - GET /recent              → teacher + super_admin (filtra por owner).
 * - GET/POST/DELETE /:id     → teacher + super_admin (ownership check
 *                              en controller; super_admin bypasea).
 *
 * @module routes/reports
 */

const express = require('express');
const router = express.Router();

const { authenticate, requireRole } = require('../middlewares/auth');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const { emptyObjectSchema } = require('../validators/commonValidator');
const {
  createTemplateBodySchema,
  templateIdParamsSchema,
  generatedReportIdParamsSchema,
  recentReportsQuerySchema,
  saveGeneratedBodySchema
} = require('../validators/reportsValidator');
const reportsController = require('../controllers/reportsController');
const asyncHandler = require('../utils/asyncHandler');

// Todas las rutas requieren teacher o super_admin (ownership/role check
// adicional en controller cuando es relevante).
router.use(authenticate, requireRole('teacher', 'super_admin'));

// ─────────────── ReportTemplate ───────────────

/**
 * @openapi
 * /reports/templates:
 *   get:
 *     tags: [Reports]
 *     summary: Lista las plantillas de informe disponibles
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     responses:
 *       200: { description: Lista ordenada (system primero) }
 */
router.get(
  '/templates',
  validateQuery(emptyObjectSchema),
  asyncHandler(reportsController.listTemplates)
);

/**
 * @openapi
 * /reports/templates:
 *   post:
 *     tags: [Reports]
 *     summary: Crea una plantilla custom (solo super_admin)
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     responses:
 *       201: { description: Plantilla creada }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       409: { description: Clave ya existe }
 */
router.post(
  '/templates',
  requireRole('super_admin'),
  validateQuery(emptyObjectSchema),
  validateBody(createTemplateBodySchema),
  asyncHandler(reportsController.createTemplate)
);

/**
 * @openapi
 * /reports/templates/{id}:
 *   delete:
 *     tags: [Reports]
 *     summary: Borra una plantilla custom (solo super_admin)
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     responses:
 *       204: { description: Plantilla eliminada }
 *       409: { description: No se pueden borrar plantillas del sistema }
 */
router.delete(
  '/templates/:id',
  requireRole('super_admin'),
  validateParams(templateIdParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(reportsController.deleteTemplate)
);

// ─────────────── GeneratedReport ───────────────

/**
 * @openapi
 * /reports/recent:
 *   get:
 *     tags: [Reports]
 *     summary: Informes recientes del docente autenticado (sin payload)
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50 }
 *     responses:
 *       200: { description: Lista paginada }
 */
router.get(
  '/recent',
  validateQuery(recentReportsQuerySchema),
  asyncHandler(reportsController.listRecent)
);

/**
 * @openapi
 * /reports/{id}:
 *   get:
 *     tags: [Reports]
 *     summary: Devuelve un informe con su payload completo (owner o super_admin)
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     responses:
 *       200: { description: Informe completo }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get(
  '/:id',
  validateParams(generatedReportIdParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(reportsController.getById)
);

/**
 * @openapi
 * /reports:
 *   post:
 *     tags: [Reports]
 *     summary: Persiste un informe recién generado
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     responses:
 *       201: { description: Informe guardado }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.post(
  '/',
  validateQuery(emptyObjectSchema),
  validateBody(saveGeneratedBodySchema),
  asyncHandler(reportsController.saveGenerated)
);

/**
 * @openapi
 * /reports/{id}:
 *   delete:
 *     tags: [Reports]
 *     summary: Borra un informe (owner o super_admin)
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     responses:
 *       204: { description: Informe eliminado }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.delete(
  '/:id',
  validateParams(generatedReportIdParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(reportsController.deleteGenerated)
);

module.exports = router;
