/**
 * @fileoverview Modelo de notificación persistida (T-955).
 *
 * Una notificación representa un evento entregable al usuario de forma
 * asíncrona: la creación inserta el documento en MongoDB y emite el evento
 * Socket.IO `notification:created` al room `user_${userId}` con el DTO V1.
 *
 * Convenciones:
 * - El `userId` es el destinatario (no el origen). Para auditar el origen
 *   se usa `metadata.triggeredBy` (otro userId/system).
 * - El `link` apunta a la ruta SPA que el frontend debe navegar al hacer
 *   click (puede ser absoluta `/sessions/:id` o nula si la notif es
 *   informativa sin destino).
 * - El TTL index sobre `createdAt` elimina notificaciones antiguas tras
 *   `NOTIFICATION_RETENTION_DAYS` (default 90d). Compatible con la
 *   política `data:retention` ya existente.
 *
 * @module models/Notification
 */

const mongoose = require('mongoose');
const { NOTIFICATION_TYPES, NOTIFICATION_PRIORITIES } = require('../constants/enums');

const NOTIFICATION_RETENTION_DAYS =
  Number.parseInt(process.env.NOTIFICATION_RETENTION_DAYS, 10) || 90;
const SECONDS_PER_DAY = 24 * 60 * 60;

// Auditoría operativa: si `NOTIFICATION_RETENTION_DAYS` no se configura en
// Koyeb, silenciosamente caemos a 90 días. El log al import deja constancia
// del valor efectivo en cada arranque (visible en Loki) sin requerir
// inspección manual del .env del despliegue.
try {
  // require diferido para evitar coste si el modelo se importa antes que el logger
  // (el logger no depende de modelos, así que el orden inverso es seguro).
  const bootLogger = require('../utils/logger');
  bootLogger.info(
    { retentionDays: NOTIFICATION_RETENTION_DAYS, env: 'NOTIFICATION_RETENTION_DAYS' },
    'Notification TTL configurado'
  );
} catch {
  // logger aún no disponible — descartamos el log silenciosamente; las
  // consultas TTL siguen funcionando con el valor calculado arriba.
}

const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
      // index monocampo eliminado: prefijo de { userId, createdAt } y { userId, read, createdAt }
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true
    },
    priority: {
      type: String,
      enum: NOTIFICATION_PRIORITIES,
      default: 'info'
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    body: {
      type: String,
      trim: true,
      maxlength: 280
    },
    link: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'notifications'
  }
);

// Indices compuestos para queries calientes:
// - Listado paginado por usuario más reciente primero
NotificationSchema.index({ userId: 1, createdAt: -1 });
// - Conteo de no-leidas por usuario
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// TTL: limpieza automatica de notificaciones antiguas. Mongo aplica el
// borrado en background, alineado con la politica RGPD de retencion.
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: NOTIFICATION_RETENTION_DAYS * SECONDS_PER_DAY }
);

module.exports = mongoose.model('Notification', NotificationSchema);
