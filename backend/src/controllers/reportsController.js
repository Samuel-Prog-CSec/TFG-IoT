/**
 * @fileoverview Controller para informes persistidos y plantillas (T-942 Fase B).
 *
 * Gestiona dos colecciones:
 * - `ReportTemplate` — plantillas predefinidas que rellenan los dropdowns
 *   del `ReportGenerator`. Listado público (teacher/super_admin), creación
 *   y borrado solo super_admin (y solo plantillas custom, no system).
 * - `GeneratedReport` — informes persistidos por docente. Ownership estricto:
 *   un docente solo ve, abre y borra los suyos; super_admin puede abrir y
 *   borrar cualquiera.
 *
 * @module controllers/reportsController
 */

const ReportTemplate = require('../models/ReportTemplate');
const GeneratedReport = require('../models/GeneratedReport');
const logger = require('../utils/logger').child({ component: 'reportsController' });
const { sendSuccess, sendCreated, sendNoContent } = require('../utils/responseHelper');
const { NotFoundError, ForbiddenError, ConflictError } = require('../utils/errors');

/**
 * Carga una plantilla por id y lanza NotFoundError si no existe.
 *
 * @param {string} id
 * @returns {Promise<import('mongoose').Document>}
 */
const findTemplateOrThrow = async id => {
  const tpl = await ReportTemplate.findById(id);
  if (!tpl) {
    throw new NotFoundError('Plantilla de informe');
  }
  return tpl;
};

/**
 * Carga un informe generado por id y verifica ownership.
 * super_admin tiene acceso a cualquier informe.
 *
 * @param {string} id
 * @param {object} user - req.user
 * @returns {Promise<import('mongoose').Document>}
 */
const findGeneratedReportOrThrow = async (id, user) => {
  const report = await GeneratedReport.findById(id);
  if (!report) {
    throw new NotFoundError('Informe');
  }
  if (user.role !== 'super_admin' && report.teacherId.toString() !== user._id.toString()) {
    throw new ForbiddenError('No tienes acceso a este informe');
  }
  return report;
};

// ───────────────────────── ReportTemplate ─────────────────────────

/**
 * Lista todas las plantillas (system primero, luego alfabético).
 *
 * @route GET /api/reports/templates
 */
exports.listTemplates = async (req, res) => {
  const templates = await ReportTemplate.find({}).sort({ isSystem: -1, name: 1 });
  return sendSuccess(res, templates);
};

/**
 * Crea una plantilla custom (super_admin).
 * `isSystem` se fuerza a false para que la plantilla creada vía API siga
 * siendo borrable y la inmutabilidad quede reservada para el seeder.
 *
 * @route POST /api/reports/templates
 */
exports.createTemplate = async (req, res) => {
  const { key, name, description, icon, defaults } = req.body;

  const existing = await ReportTemplate.findOne({ key });
  if (existing) {
    throw new ConflictError('Ya existe una plantilla con esa clave', { key });
  }

  const created = await ReportTemplate.create({
    key,
    name,
    description: description || '',
    icon: icon || 'FileText',
    defaults,
    isSystem: false
  });

  logger.info({ templateId: created._id, key }, 'Plantilla de informe creada');
  return sendCreated(res, created, 'Plantilla creada');
};

/**
 * Borra una plantilla custom. Las plantillas `isSystem=true` no se pueden borrar.
 *
 * @route DELETE /api/reports/templates/:id
 */
exports.deleteTemplate = async (req, res) => {
  const tpl = await findTemplateOrThrow(req.params.id);
  if (tpl.isSystem) {
    throw new ConflictError('Las plantillas del sistema no se pueden eliminar', {
      key: tpl.key
    });
  }
  await ReportTemplate.deleteOne({ _id: tpl._id });
  logger.info({ templateId: tpl._id, key: tpl.key }, 'Plantilla de informe eliminada');
  return sendNoContent(res);
};

// ───────────────────────── GeneratedReport ─────────────────────────

/**
 * Lista los informes más recientes del docente autenticado (sin payload).
 *
 * @route GET /api/reports/recent
 */
exports.listRecent = async (req, res) => {
  const { page, limit } = req.query;
  const teacherId = req.user._id;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    GeneratedReport.find({ teacherId })
      .sort({ generatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-payload')
      .lean(),
    GeneratedReport.countDocuments({ teacherId })
  ]);

  return sendSuccess(res, {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  });
};

/**
 * Devuelve un informe concreto con su payload completo.
 *
 * @route GET /api/reports/:id
 */
exports.getById = async (req, res) => {
  const report = await findGeneratedReportOrThrow(req.params.id, req.user);
  return sendSuccess(res, report);
};

/**
 * Persiste un informe recién generado. El payloadSize se recalcula en el
 * hook pre-save del modelo (no aceptamos el valor del cliente).
 *
 * @route POST /api/reports
 */
exports.saveGenerated = async (req, res) => {
  const { reportType, period, format, templateKey, title, studentId, payload, metadata } = req.body;

  const created = await GeneratedReport.create({
    teacherId: req.user._id,
    studentId: reportType === 'student' ? studentId : null,
    reportType,
    period,
    format,
    templateKey: templateKey || null,
    title,
    payload,
    // payloadSize se sobrescribe en pre-save (recalculado del payload real).
    payloadSize: 0,
    metadata: metadata || {}
  });

  logger.info(
    {
      reportId: created._id,
      teacherId: req.user._id,
      reportType,
      payloadSize: created.payloadSize
    },
    'Informe persistido'
  );
  return sendCreated(res, created, 'Informe guardado');
};

/**
 * Borra un informe del docente. Hard delete (no soft).
 *
 * @route DELETE /api/reports/:id
 */
exports.deleteGenerated = async (req, res) => {
  const report = await findGeneratedReportOrThrow(req.params.id, req.user);
  await GeneratedReport.deleteOne({ _id: report._id });
  logger.info({ reportId: report._id, teacherId: report.teacherId }, 'Informe eliminado');
  return sendNoContent(res);
};
