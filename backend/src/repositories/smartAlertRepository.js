/**
 * @fileoverview Repositorio para SmartAlert (T-941).
 *
 * Centraliza el acceso a la colección `smartalerts`. Mantiene el contrato
 * pequeño y predecible — la lógica de negocio (escalation, reconciliación,
 * snooze) vive en `services/analytics/alertDetectionService.js`.
 *
 * @module repositories/smartAlertRepository
 */

const SmartAlert = require('../models/SmartAlert');
const baseRepo = require('./baseRepository');

const find = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(SmartAlert.find(filter), options);

const findById = (id, options = {}) => baseRepo.applyQueryOptions(SmartAlert.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(SmartAlert.findOne(filter), options);

const count = (filter = {}) => SmartAlert.countDocuments(filter);

const create = data => SmartAlert.create(data);

const updateById = (id, update, options = {}) =>
  baseRepo.updateById(SmartAlert, id, update, options);

const updateOne = (filter, update, options = {}) =>
  baseRepo.updateOne(SmartAlert, filter, update, options);

const updateMany = (filter, update, options = {}) => SmartAlert.updateMany(filter, update, options);

const deleteById = id => baseRepo.deleteById(SmartAlert, id);

const deleteMany = filter => baseRepo.deleteMany(SmartAlert, filter);

const insertMany = (docs, options = {}) => baseRepo.insertMany(SmartAlert, docs, options);

const bulkWrite = (ops, options = {}) => baseRepo.bulkWrite(SmartAlert, ops, options);

const aggregate = pipeline => SmartAlert.aggregate(pipeline);

/**
 * Lista paginada para un docente. Ordena pinned primero, luego severidad,
 * luego detectedAt desc. Paginación por cursor opaco (objectId).
 *
 * @param {string} teacherId
 * @param {object} [options]
 * @param {string} [options.status='active']
 * @param {string} [options.severity]
 * @param {string} [options.type]
 * @param {string} [options.studentId]
 * @param {Date} [options.detectedAfter]
 * @param {number} [options.limit=20]
 * @param {string} [options.cursor] - _id del último doc de la página anterior
 * @returns {Promise<{ items: object[], nextCursor: string|null }>}
 */
const paginateForTeacher = async (teacherId, options = {}) => {
  const {
    status = 'active',
    severity,
    type,
    studentId,
    detectedAfter,
    limit = 20,
    cursor
  } = options;

  const filter = { teacherId };
  if (status && status !== 'all') {
    filter.status = status;
  }
  if (severity) {
    filter.severity = severity;
  }
  if (type) {
    filter.type = type;
  }
  if (studentId) {
    filter.studentId = studentId;
  }
  if (detectedAfter) {
    filter.detectedAt = { $gte: detectedAfter };
  }
  if (cursor) {
    filter._id = { $lt: cursor };
  }

  const cappedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);

  // Severidad ordenable: 'critical'=0, 'warning'=1, 'info'=2
  // (Mongo ordena lexicográfico, así que añadimos una etapa de pipeline si es necesario.
  //  Aquí usamos sort estable: pinned > severity desc lexicográfico inverso > detectedAt desc.
  //  'critical' < 'info' < 'warning' lexicográfico — no nos vale, hacemos sort en cliente
  //  o priorizamos via aggregation. Simplificamos: ordenamos por { pinned: -1, detectedAt: -1 }
  //  y la severity se respeta en cliente con badges visuales + filtros explícitos.)
  const docs = await SmartAlert.find(filter)
    .sort({ pinned: -1, detectedAt: -1, _id: -1 })
    .limit(cappedLimit + 1)
    .lean();

  const hasMore = docs.length > cappedLimit;
  const slice = hasMore ? docs.slice(0, cappedLimit) : docs;
  const nextCursor = hasMore ? String(slice[slice.length - 1]._id) : null;

  return { items: slice, nextCursor };
};

/**
 * Conteo por severidad y estado para el docente — alimenta los badges del UI.
 *
 * @param {string} teacherId
 * @returns {Promise<{ bySeverity: Record<string,number>, byStatus: Record<string,number>, byType: Record<string,number>, total: number, activeTotal: number }>}
 */
const summaryForTeacher = async teacherId => {
  const results = await SmartAlert.aggregate([
    { $match: { teacherId: toObjectIdSafe(teacherId) } },
    {
      $group: {
        _id: { status: '$status', severity: '$severity', type: '$type' },
        count: { $sum: 1 }
      }
    }
  ]);

  const bySeverity = { critical: 0, warning: 0, info: 0 };
  const byStatus = { active: 0, resolved: 0, dismissed: 0, snoozed: 0 };
  const byType = {};
  let total = 0;
  let activeTotal = 0;

  for (const r of results) {
    const { status, severity, type } = r._id;
    total += r.count;
    if (status === 'active') {
      activeTotal += r.count;
      bySeverity[severity] = (bySeverity[severity] || 0) + r.count;
      byType[type] = (byType[type] || 0) + r.count;
    }
    byStatus[status] = (byStatus[status] || 0) + r.count;
  }

  return { bySeverity, byStatus, byType, total, activeTotal };
};

/**
 * Helper local para castear teacherId a ObjectId — evita dependencia circular
 * con utils y trabaja con string o ObjectId.
 */
function toObjectIdSafe(id) {
  const mongoose = require('mongoose');
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));
}

/**
 * Devuelve mapa de alertas activas del teacher, indexado por `studentId:type`,
 * usado por alertDetectionService.runForTeacher() para la reconciliación.
 *
 * @param {string} teacherId
 * @returns {Promise<Map<string, object>>}
 */
const buildActiveAlertsMap = async teacherId => {
  const active = await SmartAlert.find({ teacherId, status: 'active' });
  const map = new Map();
  for (const doc of active) {
    map.set(`${doc.studentId}:${doc.type}`, doc);
  }
  return map;
};

/**
 * Mapa de alertas SNOOZED del teacher, indexado por `studentId:type`. Lo usa
 * la reconciliación para NO crear un duplicado `active` cuando el detector vuelve
 * a emitir un `(studentId, type)` que el docente silenció: el índice único parcial
 * de dedup solo cubre `status:'active'`, así que sin esta comprobación una alerta
 * snoozed re-detectada generaba un segundo documento active y rompía el snooze.
 *
 * @param {string} teacherId
 * @returns {Promise<Map<string, object>>}
 */
const buildSnoozedAlertsMap = async teacherId => {
  const snoozed = await SmartAlert.find({ teacherId, status: 'snoozed' });
  const map = new Map();
  for (const doc of snoozed) {
    map.set(`${doc.studentId}:${doc.type}`, doc);
  }
  return map;
};

/**
 * Reactiva las alertas snoozed cuya snoozedUntil ya pasó.
 *
 * @param {Date} [now=new Date()]
 * @returns {Promise<number>} Número de alertas reactivadas.
 */
const reactivateExpiredSnoozes = async (now = new Date(), teacherId = null) => {
  // Scope por teacher cuando se invoca dentro de runForTeacher: evita que cada
  // corrida del bucle (N teachers) ejecute el MISMO updateMany global (la 1ª las
  // reactiva todas, las N-1 restantes son writes vacíos contra Mongo/Atlas). Sin
  // teacherId mantiene el comportamiento global (compat).
  const filter = { status: 'snoozed', snoozedUntil: { $lte: now } };
  if (teacherId) {
    filter.teacherId = teacherId;
  }
  const result = await SmartAlert.updateMany(filter, {
    $set: { status: 'active', lastSeenAt: now },
    $unset: { snoozedUntil: '', snoozedAt: '', snoozedBy: '' }
  });
  return result.modifiedCount || 0;
};

/**
 * Cuenta cuántas alertas pinned tiene un docente (para el límite H.1).
 *
 * @param {string} teacherId
 * @returns {Promise<number>}
 */
const countPinned = teacherId =>
  SmartAlert.countDocuments({ teacherId, pinned: true, status: 'active' });

module.exports = {
  find,
  findById,
  findOne,
  count,
  create,
  updateById,
  updateOne,
  updateMany,
  deleteById,
  deleteMany,
  insertMany,
  bulkWrite,
  aggregate,
  paginateForTeacher,
  summaryForTeacher,
  buildActiveAlertsMap,
  buildSnoozedAlertsMap,
  reactivateExpiredSnoozes,
  countPinned
};
