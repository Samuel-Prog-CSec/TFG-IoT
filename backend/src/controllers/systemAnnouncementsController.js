/**
 * @fileoverview Controller dedicado a SystemAnnouncements (T-942).
 *
 * Endpoints:
 *  - GET    /api/admin/announcements             list           super_admin
 *  - POST   /api/admin/announcements             create         super_admin
 *  - PATCH  /api/admin/announcements/:id         update         super_admin
 *  - PATCH  /api/admin/announcements/:id/archive archive        super_admin
 *  - GET    /api/announcements/active            listPublic     authenticate
 *
 * @module controllers/systemAnnouncementsController
 */

const { sendSuccess } = require('../utils/responseHelper');
const { toSystemAnnouncementDTOV1, toPublicAnnouncementDTOV1 } = require('../utils/dtos');
const systemAnnouncementService = require('../services/admin/systemAnnouncementService');
const userRepository = require('../repositories/userRepository');

exports.list = async (req, res) => {
  const items = await systemAnnouncementService.list({
    active: req.query.active,
    audience: req.query.audience
  });
  if (!items.length) {
    sendSuccess(res, { items: [] });
    return;
  }
  // Hidratar authorName
  const ids = [...new Set(items.filter(a => a.createdBy).map(a => String(a.createdBy)))];
  let nameById = new Map();
  if (ids.length) {
    const users = await userRepository.find({ _id: { $in: ids } }, { select: 'name', lean: true });
    nameById = new Map(users.map(u => [String(u._id), u.name]));
  }
  sendSuccess(res, {
    items: items.map(a =>
      toSystemAnnouncementDTOV1(a, {
        authorName: a.createdBy ? nameById.get(String(a.createdBy)) || null : null
      })
    )
  });
};

exports.create = async (req, res) => {
  const doc = await systemAnnouncementService.create({
    ...req.body,
    createdBy: req.user._id
  });
  sendSuccess(res, toSystemAnnouncementDTOV1(doc), undefined, 201);
};

exports.update = async (req, res) => {
  const doc = await systemAnnouncementService.update(req.params.id, req.body);
  sendSuccess(res, toSystemAnnouncementDTOV1(doc));
};

exports.archive = async (req, res) => {
  const doc = await systemAnnouncementService.archive(req.params.id, req.user._id);
  sendSuccess(res, toSystemAnnouncementDTOV1(doc));
};

exports.listPublic = async (req, res) => {
  const items = await systemAnnouncementService.listActiveForUser({
    role: req.user.role
  });
  sendSuccess(res, { items: items.map(toPublicAnnouncementDTOV1) });
};
