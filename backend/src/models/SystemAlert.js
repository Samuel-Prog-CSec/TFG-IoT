/**
 * @fileoverview Modelo de alerta operativa global del super_admin (T-942).
 *
 * Espejo del modelo SmartAlert (T-941) **sin** teacherId/studentId. Las alertas
 * de sistema son globales por incidente: una única alerta activa por (type)
 * en cualquier momento; cualquier super_admin puede gestionarla y el cambio
 * se ve para todos.
 *
 * Lifecycle: active → resolved (auto o manual) / dismissed (con motivo) /
 *            snoozed (hasta fecha).
 *
 * Decisiones clave (ADR adjunto):
 * - Dedup global a nivel BD: unique partial index `(type, status='active')`.
 * - Pinning global, máx `SYSTEM_DETECTION_CONFIG.maxPinned` (5 por defecto).
 * - severityHistory: timeline auditable.
 * - Sin teacherId/studentId/studentPseudoId: la naturaleza es operacional, no
 *   pedagógica. Si una alerta necesita citar a un teacher (p.ej.
 *   pending_teachers_aging), va en `data` como referencia plana (id+nombre),
 *   sin populate.
 * - Retención corta: hard-delete a los 90 días (vs 365 de SmartAlert).
 *
 * @module models/SystemAlert
 */

const mongoose = require('mongoose');
const {
  SYSTEM_ALERT_TYPE_KEYS,
  SYSTEM_ALERT_SEVERITIES,
  SYSTEM_ALERT_STATUSES,
  SYSTEM_DISMISS_REASONS,
  SYSTEM_ALERT_SOURCES
} = require('../config/systemAlerts');

const SeverityHistorySchema = new mongoose.Schema(
  {
    severity: { type: String, enum: SYSTEM_ALERT_SEVERITIES, required: true },
    changedAt: { type: Date, required: true, default: Date.now },
    reason: {
      type: String,
      enum: ['initial', 'escalation', 'detector_update', 'reopened'],
      default: 'detector_update'
    }
  },
  { _id: false }
);

const SystemAlertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: SYSTEM_ALERT_TYPE_KEYS,
      required: true,
      index: true
    },
    severity: {
      type: String,
      enum: SYSTEM_ALERT_SEVERITIES,
      required: true
    },
    status: {
      type: String,
      enum: SYSTEM_ALERT_STATUSES,
      default: 'active'
      // index monocampo eliminado: prefijo de { status, pinned, severity, detectedAt }
    },
    source: {
      type: String,
      enum: SYSTEM_ALERT_SOURCES,
      required: true
      // index monocampo eliminado: prefijo de { source, status }
    },
    component: { type: String, maxlength: 80, default: null },

    // ── Lifecycle timestamps ────────────────────────────────────────
    detectedAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    occurrencesCount: { type: Number, default: 1, min: 1 },
    missedRuns: { type: Number, default: 0, min: 0 },

    resolvedAt: { type: Date, default: null },
    resolvedAutomatically: { type: Boolean, default: false },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    dismissedAt: { type: Date, default: null },
    dismissedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dismissReason: { type: String, enum: SYSTEM_DISMISS_REASONS, default: null },

    snoozedUntil: { type: Date, default: null },
    snoozedAt: { type: Date, default: null },
    snoozedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Contenido ───────────────────────────────────────────────────
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 280 },
    recommendation: { type: String, maxlength: 280, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    runbookUrl: { type: String, maxlength: 240, default: null },

    // ── Trazabilidad ────────────────────────────────────────────────
    severityHistory: { type: [SeverityHistorySchema], default: [] },
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      default: null
    },

    // ── Pinning ─────────────────────────────────────────────────────
    pinned: { type: Boolean, default: false, index: true },
    pinnedAt: { type: Date, default: null },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  {
    timestamps: true,
    collection: 'systemalerts'
  }
);

// ──────────────────────────── Índices ─────────────────────────────

// Listado paginado global — pinned primero, luego severidad, luego fecha
SystemAlertSchema.index({ status: 1, pinned: -1, severity: 1, detectedAt: -1 });

// Counters por severidad
SystemAlertSchema.index({ severity: 1, status: 1 });

// Filtro por subsistema
SystemAlertSchema.index({ source: 1, status: 1 });

// Reactivación de snoozed
SystemAlertSchema.index(
  { status: 1, snoozedUntil: 1 },
  { partialFilterExpression: { status: 'snoozed' } }
);

// **DEDUP GLOBAL**: una sola alerta activa por tipo simultáneamente
SystemAlertSchema.index(
  { type: 1, status: 1 },
  {
    partialFilterExpression: { status: 'active' },
    unique: true,
    name: 'dedup_active_type'
  }
);

// Hard-delete cron
SystemAlertSchema.index(
  { status: 1, updatedAt: 1 },
  {
    partialFilterExpression: { status: { $in: ['resolved', 'dismissed'] } },
    name: 'system_hard_delete_candidates'
  }
);

// ──────────────────────────── Virtuals ────────────────────────────

SystemAlertSchema.virtual('hoursActive').get(function () {
  if (!this.detectedAt) {
    return 0;
  }
  const reference = this.status === 'resolved' && this.resolvedAt ? this.resolvedAt : new Date();
  return Math.max(0, Math.floor((reference - this.detectedAt) / (60 * 60 * 1000)));
});

SystemAlertSchema.virtual('daysActive').get(function () {
  return Math.floor((this.hoursActive || 0) / 24);
});

SystemAlertSchema.virtual('isEscalated').get(function () {
  return (this.severityHistory || []).some(s => s.reason === 'escalation');
});

SystemAlertSchema.set('toJSON', { virtuals: true });
SystemAlertSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('SystemAlert', SystemAlertSchema);
