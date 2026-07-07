/**
 * @fileoverview Repositorio para SystemAlert (T-942).
 *
 * Espejo de smartAlertRepository pero sin filtro por teacherId (las alertas
 * de sistema son globales). El ordenamiento principal es:
 *   pinned DESC → severityWeight ASC → detectedAt DESC.
 *
 * Para la severity (critical < warning < info) usamos un mapping en cliente
 * porque MongoDB ordena lexicográficamente; el `paginateGlobal` aplica el
 * mapping vía `$addFields` + `$sort` en aggregation.
 *
 * @module repositories/systemAlertRepository
 */

const mongoose = require('mongoose');
const SystemAlert = require('../models/SystemAlert');
const baseRepo = require('./baseRepository');

const find = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(SystemAlert.find(filter), options);

const findById = (id, options = {}) =>
  baseRepo.applyQueryOptions(SystemAlert.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(SystemAlert.findOne(filter), options);

const count = (filter = {}) => SystemAlert.countDocuments(filter);

const create = data => SystemAlert.create(data);

const updateById = (id, update, options = {}) =>
  baseRepo.updateById(SystemAlert, id, update, options);

const updateOne = (filter, update, options = {}) =>
  baseRepo.updateOne(SystemAlert, filter, update, options);

const updateMany = (filter, update, options = {}) =>
  SystemAlert.updateMany(filter, update, options);

const deleteById = id => baseRepo.deleteById(SystemAlert, id);
const deleteMany = filter => baseRepo.deleteMany(SystemAlert, filter);
const insertMany = (docs, options = {}) => baseRepo.insertMany(SystemAlert, docs, options);
const bulkWrite = (ops, options = {}) => baseRepo.bulkWrite(SystemAlert, ops, options);
const aggregate = pipeline => SystemAlert.aggregate(pipeline);

const SEVERITY_WEIGHT = { critical: 0, warning: 1, info: 2 };

/**
 * Lista global paginada con orden estable (pinned → severidad → fecha).
 * Cursor opaco: ObjectId del último doc de la página anterior.
 *
 * @param {object} [options]
 * @param {string} [options.status='active']
 * @param {string} [options.severity]
 * @param {string} [options.source]
 * @param {string} [options.type]
 * @param {number} [options.limit=20]
 * @param {string} [options.cursor]
 * @returns {Promise<{ items: object[], nextCursor: string|null }>}
 */
const paginateGlobal = async (options = {}) => {
  const { status = 'active', severity, source, type, limit = 20, cursor } = options;

  const match = {};
  if (status && status !== 'all') {
    match.status = status;
  }
  if (severity) {
    match.severity = severity;
  }
  if (source) {
    match.source = source;
  }
  if (type) {
    match.type = type;
  }

  const cappedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);

  const pipeline = [{ $match: match }];

  if (cursor) {
    try {
      pipeline.push({ $match: { _id: { $lt: new mongoose.Types.ObjectId(String(cursor)) } } });
    } catch {
      // cursor inválido → ignorar
    }
  }

  pipeline.push(
    {
      $addFields: {
        _sevWeight: {
          $switch: {
            branches: [
              { case: { $eq: ['$severity', 'critical'] }, then: 0 },
              { case: { $eq: ['$severity', 'warning'] }, then: 1 },
              { case: { $eq: ['$severity', 'info'] }, then: 2 }
            ],
            default: 9
          }
        }
      }
    },
    { $sort: { pinned: -1, _sevWeight: 1, detectedAt: -1, _id: -1 } },
    { $limit: cappedLimit + 1 },
    { $project: { _sevWeight: 0 } }
  );

  const docs = await SystemAlert.aggregate(pipeline);
  const hasMore = docs.length > cappedLimit;
  const slice = hasMore ? docs.slice(0, cappedLimit) : docs;
  const nextCursor = hasMore ? String(slice[slice.length - 1]._id) : null;

  return { items: slice, nextCursor };
};

/**
 * Conteo global por estado, severidad y source.
 *
 * @returns {Promise<{ bySeverity: object, byStatus: object, bySource: object, total: number, activeTotal: number }>}
 */
const summary = async () => {
  const results = await SystemAlert.aggregate([
    {
      $group: {
        _id: { status: '$status', severity: '$severity', source: '$source' },
        count: { $sum: 1 }
      }
    }
  ]);

  const bySeverity = { critical: 0, warning: 0, info: 0 };
  const byStatus = { active: 0, resolved: 0, dismissed: 0, snoozed: 0 };
  const bySource = {};
  let total = 0;
  let activeTotal = 0;

  for (const r of results) {
    const { status, severity, source } = r._id;
    total += r.count;
    if (status === 'active') {
      activeTotal += r.count;
      bySeverity[severity] = (bySeverity[severity] || 0) + r.count;
      bySource[source] = (bySource[source] || 0) + r.count;
    }
    byStatus[status] = (byStatus[status] || 0) + r.count;
  }

  return { bySeverity, byStatus, bySource, total, activeTotal };
};

/**
 * Mapa de alertas activas indexado por `type` para reconciliación.
 *
 * @returns {Promise<Map<string, object>>}
 */
const buildActiveAlertsMap = async () => {
  const active = await SystemAlert.find({ status: 'active' });
  const map = new Map();
  for (const doc of active) {
    map.set(doc.type, doc);
  }
  return map;
};

/**
 * Reactiva las alertas snoozed cuya snoozedUntil ya pasó.
 *
 * @param {Date} [now=new Date()]
 * @returns {Promise<number>}
 */
const reactivateExpiredSnoozes = async (now = new Date()) => {
  const result = await SystemAlert.updateMany(
    { status: 'snoozed', snoozedUntil: { $lte: now } },
    {
      $set: { status: 'active', lastSeenAt: now },
      $unset: { snoozedUntil: '', snoozedAt: '', snoozedBy: '' }
    }
  );
  return result.modifiedCount || 0;
};

/**
 * Cuenta cuántas alertas pinned hay actualmente.
 *
 * @returns {Promise<number>}
 */
const countPinned = () => SystemAlert.countDocuments({ pinned: true, status: 'active' });

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
  paginateGlobal,
  summary,
  buildActiveAlertsMap,
  reactivateExpiredSnoozes,
  countPinned,
  SEVERITY_WEIGHT
};
