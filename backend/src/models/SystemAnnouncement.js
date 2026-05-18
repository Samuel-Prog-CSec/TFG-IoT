/**
 * @fileoverview Modelo de aviso/banner publicado por super_admin para profesores (T-942).
 *
 * El super_admin crea un SystemAnnouncement que el frontend renderiza como
 * banner en la parte superior de `AppLayout` para los usuarios del rol/role
 * coincidente con `audience`. Es un mecanismo de broadcast manual,
 * complementario al sistema automático de SystemAlert.
 *
 * El dismiss por usuario se persiste en localStorage del cliente
 * (`announcement-dismissed:<id>`) — no requiere endpoint server-side en esta
 * primera versión.
 *
 * Decisiones:
 * - Máximo `SYSTEM_ANNOUNCEMENT_CONFIG.maxActive` activos por audience (3).
 *   La validación se hace en el service al crear; el modelo no fuerza el
 *   límite con índice porque `expiresAt` puede pasar a auto-archivar.
 * - Soft archive (`active=false`) en lugar de delete, para auditoría.
 *
 * @module models/SystemAnnouncement
 */

const mongoose = require('mongoose');
const { SYSTEM_ANNOUNCEMENT_CONFIG } = require('../config/systemAlerts');

const SystemAnnouncementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 120, trim: true },
    body: { type: String, required: true, maxlength: 500, trim: true },
    severity: {
      type: String,
      enum: SYSTEM_ANNOUNCEMENT_CONFIG.severities,
      default: 'info'
    },
    audience: {
      type: String,
      enum: SYSTEM_ANNOUNCEMENT_CONFIG.audiences,
      default: 'all_teachers',
      index: true
    },
    linkUrl: { type: String, maxlength: 240, default: null },
    linkLabel: { type: String, maxlength: 40, default: null },

    publishedAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, default: null },

    active: { type: Boolean, default: true, index: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  {
    timestamps: true,
    collection: 'systemannouncements'
  }
);

// Listado público (activos y no expirados) por audience
SystemAnnouncementSchema.index({ active: 1, audience: 1, publishedAt: -1 });

// Limpieza por expiración (partial)
SystemAnnouncementSchema.index(
  { expiresAt: 1 },
  {
    partialFilterExpression: { expiresAt: { $exists: true, $ne: null } },
    name: 'announcement_expires_lookup'
  }
);

SystemAnnouncementSchema.virtual('isExpired').get(function () {
  return !!(this.expiresAt && this.expiresAt.getTime() <= Date.now());
});

SystemAnnouncementSchema.set('toJSON', { virtuals: true });
SystemAnnouncementSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('SystemAnnouncement', SystemAnnouncementSchema);
