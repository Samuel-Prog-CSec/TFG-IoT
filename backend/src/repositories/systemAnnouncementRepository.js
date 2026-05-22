/**
 * @fileoverview Repositorio para SystemAnnouncement (T-942).
 *
 * @module repositories/systemAnnouncementRepository
 */

const SystemAnnouncement = require('../models/SystemAnnouncement');
const baseRepo = require('./baseRepository');

const find = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(SystemAnnouncement.find(filter), options);

const findById = (id, options = {}) =>
  baseRepo.applyQueryOptions(SystemAnnouncement.findById(id), options);

const findOne = (filter = {}, options = {}) =>
  baseRepo.applyQueryOptions(SystemAnnouncement.findOne(filter), options);

const count = (filter = {}) => SystemAnnouncement.countDocuments(filter);
const create = data => SystemAnnouncement.create(data);

const updateById = (id, update, options = {}) =>
  baseRepo.updateById(SystemAnnouncement, id, update, options);

const deleteById = id => baseRepo.deleteById(SystemAnnouncement, id);

/**
 * Lista de avisos activos para la audiencia indicada (filtrando expiración).
 *
 * @param {object} options
 * @param {string} options.audience  - 'all_teachers' | 'all_users'
 * @param {Date}   [options.now=new Date()]
 */
const findActiveForAudience = async ({ audience, now = new Date() }) => {
  const audiences = audience === 'all_users' ? ['all_users'] : ['all_teachers', 'all_users'];
  return SystemAnnouncement.find({
    active: true,
    audience: { $in: audiences },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
  })
    .sort({ publishedAt: -1 })
    .lean();
};

/**
 * Cuenta cuántos avisos activos hay para una audience determinada
 * (validación del límite máximo en service).
 */
const countActiveForAudience = ({ audience, now = new Date() }) =>
  SystemAnnouncement.countDocuments({
    active: true,
    audience,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
  });

module.exports = {
  find,
  findById,
  findOne,
  count,
  create,
  updateById,
  deleteById,
  findActiveForAudience,
  countActiveForAudience
};
