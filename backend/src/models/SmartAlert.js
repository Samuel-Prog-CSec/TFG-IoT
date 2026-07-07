/**
 * @fileoverview Modelo de alerta inteligente persistida con ciclo de vida (T-941).
 *
 * Las alertas antes se derivaban on-the-fly desde GamePlay + User.studentMetrics
 * en cada llamada del docente, sin historial ni estado. Este modelo persiste
 * cada alerta detectada con su ciclo de vida completo:
 *
 *   active → resolved (automática o manual)
 *          → dismissed (manual con motivo)
 *          → snoozed (manual con fecha hasta)
 *
 * Decisiones clave (ADR-169):
 * - **Dedup a nivel BD**: unique partial index `(studentId, type, status='active')`
 *   evita que dos corridas concurrentes creen duplicados.
 * - **Pinning** (H.1): `pinned=true` para que el docente fije las alertas más
 *   importantes; el repositorio ordena `pinned: -1` antes de severidad/fecha.
 * - **studentPseudoId obligatorio**: para logs sin PII (RGPD Art. 25).
 * - **severityHistory**: timeline auditable de promociones/cambios.
 * - **Sin TTL Mongo**: las alertas resolved/dismissed se limpian via cron
 *   `data-retention` H.4 (configurable, default 365 días).
 *
 * @module models/SmartAlert
 */

const mongoose = require('mongoose');
const {
  ALERT_TYPE_KEYS,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  DISMISS_REASONS
} = require('../config/alerts');

const SeverityHistorySchema = new mongoose.Schema(
  {
    severity: { type: String, enum: ALERT_SEVERITIES, required: true },
    changedAt: { type: Date, required: true, default: Date.now },
    reason: {
      type: String,
      enum: ['initial', 'escalation', 'detector_update', 'reopened'],
      default: 'detector_update'
    }
  },
  { _id: false }
);

const SmartAlertSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
      // index monocampo eliminado: prefijo de { teacherId, status, pinned, detectedAt }
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: ALERT_TYPE_KEYS,
      required: true
    },
    severity: {
      type: String,
      enum: ALERT_SEVERITIES,
      required: true
    },
    status: {
      type: String,
      enum: ALERT_STATUSES,
      default: 'active',
      index: true
    },

    // ── Lifecycle timestamps ────────────────────────────────────────
    detectedAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    occurrencesCount: { type: Number, default: 1, min: 1 },
    missedRuns: { type: Number, default: 0, min: 0 },

    resolvedAt: { type: Date, default: null },
    resolvedAutomatically: { type: Boolean, default: false },

    dismissedAt: { type: Date, default: null },
    dismissedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dismissReason: { type: String, enum: DISMISS_REASONS, default: null },

    snoozedUntil: { type: Date, default: null },
    snoozedAt: { type: Date, default: null },
    snoozedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Contenido ───────────────────────────────────────────────────
    description: { type: String, required: true, maxlength: 280 },
    recommendation: { type: String, maxlength: 280, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Trazabilidad ────────────────────────────────────────────────
    gamePlayId: { type: mongoose.Schema.Types.ObjectId, ref: 'GamePlay', default: null },
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      default: null
    },
    severityHistory: { type: [SeverityHistorySchema], default: [] },

    // ── Pseudonimización (RGPD) ─────────────────────────────────────
    studentPseudoId: { type: String, required: true, maxlength: 32 },

    // ── Pinning (H.1) ───────────────────────────────────────────────
    pinned: { type: Boolean, default: false, index: true },
    pinnedAt: { type: Date, default: null }
  },
  {
    timestamps: true,
    collection: 'smartalerts'
  }
);

// ──────────────────────────── Índices ─────────────────────────────

// Listado paginado del docente — pinned primero, luego severidad, luego fecha
SmartAlertSchema.index({ teacherId: 1, status: 1, pinned: -1, detectedAt: -1 });

// Badges/conteos por severidad
SmartAlertSchema.index({ teacherId: 1, severity: 1, status: 1 });

// Reactivación de snoozed (partial: solo afecta a los pocos en este estado)
SmartAlertSchema.index(
  { status: 1, snoozedUntil: 1 },
  { partialFilterExpression: { status: 'snoozed' } }
);

// **DEDUP**: un solo (studentId, type, status='active') simultáneo
SmartAlertSchema.index(
  { studentId: 1, type: 1, status: 1 },
  {
    partialFilterExpression: { status: 'active' },
    unique: true,
    name: 'dedup_active_student_type'
  }
);

// Hard-delete cron (H.4)
SmartAlertSchema.index(
  { status: 1, updatedAt: 1 },
  {
    partialFilterExpression: { status: { $in: ['resolved', 'dismissed'] } },
    name: 'hard_delete_candidates'
  }
);

// Búsqueda por estudiante (para audit log y student profile)
SmartAlertSchema.index({ studentId: 1, detectedAt: -1 });

// ──────────────────────────── Virtuals ────────────────────────────

SmartAlertSchema.virtual('daysActive').get(function () {
  if (!this.detectedAt) {
    return 0;
  }
  const reference = this.status === 'resolved' && this.resolvedAt ? this.resolvedAt : new Date();
  return Math.floor((reference - this.detectedAt) / 86400000);
});

SmartAlertSchema.virtual('isEscalated').get(function () {
  return (this.severityHistory || []).some(s => s.reason === 'escalation');
});

SmartAlertSchema.set('toJSON', { virtuals: true });
SmartAlertSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('SmartAlert', SmartAlertSchema);
