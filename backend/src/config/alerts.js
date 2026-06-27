/**
 * @fileoverview Configuración centralizada del sistema de alertas inteligentes (T-941).
 *
 * Esta es la única fuente de verdad para:
 * - Catálogo de tipos de alerta y sus umbrales.
 * - Estados, severidades, razones de descarte (lifecycle).
 * - Configuración del worker BullMQ (cron, batch, escalation, snooze, reopen).
 * - Configuración del cron de hard-delete (H.4) y auto-reopen (H.5).
 *
 * Antes de T-941, ALERT_TYPES vivía en `services/analytics/analyticsHelpers.js`
 * hardcoded entre helpers de fecha. Esta extracción permite:
 * - Reutilización desde detectores, validators Zod, DTOs y tests.
 * - Override via env var sin redeploy (`ALERT_DETECTION_CRON`, etc.).
 * - Trazabilidad de qué umbrales corresponden a qué decisión pedagógica.
 *
 * Cualquier cambio aquí debe ir acompañado de actualizacion en:
 *  - `backend/docs/Analytics_Design_Rationale.md` § 2.5 (alertas).
 *  - Test `backend/tests/services/analytics/alertConfig.test.js`.
 *
 * @module config/alerts
 */

/**
 * Catálogo canónico de tipos de alerta detectables por el motor.
 * Cada entrada agrupa metadata + umbrales (configurables via env si procede).
 *
 * Los umbrales se mantienen como constantes JS por ahora; la personalización
 * por docente (TeacherAlertConfig) está fuera del scope de T-941 (ver D13).
 */
const ALERT_TYPES = Object.freeze({
  // ── Negativos (warning/critical) ────────────────────────────────────
  declining_performance: Object.freeze({
    label: 'Rendimiento en descenso',
    description: 'El score promedio del alumno ha caído entre dos periodos consecutivos.',
    thresholds: Object.freeze({ warning: 10, critical: 20 }),
    direction: 'negative',
    requiresMechanic: null
  }),
  inactivity: Object.freeze({
    label: 'Inactividad',
    description: 'El alumno lleva varios días sin completar ninguna partida.',
    thresholds: Object.freeze({ info: 7, warning: 14 }),
    direction: 'negative',
    requiresMechanic: null
  }),
  sudden_score_drop: Object.freeze({
    label: 'Caída repentina de puntuación',
    description: 'La última partida del alumno está muy por debajo de su media histórica.',
    thresholds: Object.freeze({ warning: 30 }),
    direction: 'negative',
    requiresMechanic: null
  }),
  consistent_timeout: Object.freeze({
    label: 'Se queda sin tiempo a menudo',
    description: 'El alumno se queda sin tiempo en muchas partidas (≥30 %).',
    thresholds: Object.freeze({ warning: 0.3 }),
    direction: 'negative',
    requiresMechanic: null
  }),
  high_abandonment: Object.freeze({
    label: 'Alto abandono',
    description: 'El alumno abandona más del 25 % de las partidas iniciadas.',
    thresholds: Object.freeze({ warning: 0.25 }),
    direction: 'negative',
    requiresMechanic: null
  }),
  plateau_detected: Object.freeze({
    label: 'Estancamiento detectado',
    description: 'Las últimas partidas tienen scores muy similares (±5 puntos).',
    thresholds: Object.freeze({ info: 5, minGames: 5 }),
    direction: 'neutral',
    requiresMechanic: null
  }),
  engagement_drop: Object.freeze({
    label: 'Caída de implicación',
    description: 'La implicación del alumno cayó más de un 25 % respecto al periodo anterior.',
    thresholds: Object.freeze({ warning: 25 }),
    direction: 'negative',
    requiresMechanic: null
  }),
  mechanic_specific_struggle: Object.freeze({
    label: 'Dificultad específica por mecánica',
    description: 'El alumno domina una mecánica pero falla sistemáticamente en otra.',
    thresholds: Object.freeze({ minGap: 30, minPlaysPerMechanic: 3, weakBelow: 50 }),
    direction: 'negative',
    requiresMechanic: null
  }),

  // ── Positivos (info) ────────────────────────────────────────────────
  improving_fast: Object.freeze({
    label: 'Mejora rápida',
    description: 'El alumno ha mejorado más de un 15 % en la última semana.',
    thresholds: Object.freeze({ info: 15 }),
    direction: 'positive',
    requiresMechanic: null
  }),
  recovery_after_drop: Object.freeze({
    label: 'Recuperación tras bache',
    description: 'El alumno se ha recuperado de una alerta de rendimiento previa.',
    thresholds: Object.freeze({ windowDays: 30 }),
    direction: 'positive',
    requiresMechanic: null
  }),
  mastery_milestone: Object.freeze({
    label: 'Hito de dominio',
    description: 'El alumno ha alcanzado ≥80 % de acierto sostenido en un contexto.',
    thresholds: Object.freeze({ accuracyMin: 0.8, minPlays: 5 }),
    direction: 'positive',
    requiresMechanic: null
  }),

  // ── Específicos de Secuencia ────────────────────────────────────────
  sequence_stagnation: Object.freeze({
    label: 'Estancamiento en Secuencia',
    description: 'El alumno no supera una longitud de secuencia tras varias partidas.',
    thresholds: Object.freeze({ minStagnantGames: 5 }),
    direction: 'negative',
    requiresMechanic: 'sequence'
  }),
  sequence_order_errors: Object.freeze({
    label: 'Errores de orden en Secuencia',
    description: 'Acierta los elementos pero el orden le cuesta sistemáticamente.',
    thresholds: Object.freeze({ partialRatio: 0.4 }),
    direction: 'negative',
    requiresMechanic: 'sequence'
  })
});

/** Claves de tipos de alerta (para validators y enums Mongoose). */
const ALERT_TYPE_KEYS = Object.freeze(Object.keys(ALERT_TYPES));

/** Severidades de alertas, ordenadas de mayor a menor urgencia. */
const ALERT_SEVERITIES = Object.freeze(['critical', 'warning', 'info']);

/** Estados de ciclo de vida de una alerta. */
const ALERT_STATUSES = Object.freeze(['active', 'resolved', 'dismissed', 'snoozed']);

/** Razones admitidas al descartar una alerta. */
const DISMISS_REASONS = Object.freeze([
  'false_positive',
  'already_addressed',
  'irrelevant',
  'other'
]);

/**
 * Configuración del detector worker. Centralizada aquí para que tests y
 * scripts puedan importarla sin pasar por el worker mismo.
 */
const DETECTION_CONFIG = Object.freeze({
  /** Patrón cron del job BullMQ (cada 15 minutos por defecto). */
  cronPattern: process.env.ALERT_DETECTION_CRON || '*/15 * * * *',
  /** Tamaño de batch al iterar teachers en runForAllTeachers. */
  teacherBatchSize: Number.parseInt(process.env.ALERT_DETECTION_TEACHER_BATCH, 10) || 50,
  /** Corridas consecutivas SIN aparecer antes de auto-resolve una alerta. */
  autoResolveAfterMissedRuns: Number.parseInt(process.env.ALERT_AUTO_RESOLVE_MISSED, 10) || 2,
  /** Días activos antes de promover warning → critical (severity escalation). */
  escalateWarningAfterDays: Number.parseInt(process.env.ALERT_ESCALATE_DAYS, 10) || 7,
  /** Ocurrencias mínimas antes de poder escalar (evita escaladas por una sola corrida). */
  escalateMinOccurrences: Number.parseInt(process.env.ALERT_ESCALATE_MIN_OCCURRENCES, 10) || 3,
  /** Días tras dismiss para reabrir si reaparece como critical (H.5). */
  reopenAfterDays: Number.parseInt(process.env.SMART_ALERT_REOPEN_AFTER_DAYS, 10) || 60,
  /** Días para hard-delete de alertas resolved/dismissed (H.4). */
  hardDeleteAfterDays: Number.parseInt(process.env.SMART_ALERT_RETENTION_DAYS, 10) || 365,
  /** Máximo de alertas pinned por teacher (H.1). */
  maxPinnedPerTeacher: Number.parseInt(process.env.ALERT_MAX_PINNED, 10) || 3,
  /** TTL del cache `cache:alerts:teacher:*` en segundos. */
  cacheTtlSeconds: Number.parseInt(process.env.ALERT_CACHE_TTL_SEC, 10) || 60,
  /** Snooze: opciones predefinidas (días). */
  snoozePresetsDays: Object.freeze([1, 7, 14, 30])
});

/**
 * Periodos temporales aceptados por endpoints (alineado con el resto de analytics).
 */
const ALERT_PERIODS = Object.freeze(['7d', '30d', '90d', 'all']);

module.exports = {
  ALERT_TYPES,
  ALERT_TYPE_KEYS,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  DISMISS_REASONS,
  DETECTION_CONFIG,
  ALERT_PERIODS
};
