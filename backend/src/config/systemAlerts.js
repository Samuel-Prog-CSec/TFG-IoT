/**
 * @fileoverview Configuración centralizada del sistema de alertas operativas
 * para super_admin (T-942).
 *
 * Espejo conceptual de `config/alerts.js` (alertas pedagógicas del teacher),
 * pero con catálogo, severidades y escalas temporales propias del dominio
 * operacional: las alertas de sistema escalan en HORAS (no días), retienen
 * menos histórico y se ejecutan con un cron más frecuente.
 *
 * Cualquier cambio en este archivo debe ir acompañado de actualización en:
 *  - `backend/docs/Analytics_Design_Rationale.md` § 2.6 (alertas de sistema).
 *  - `frontend/src/constants/systemAlertTypes.js` (catálogo espejo para UI).
 *  - Test `backend/tests/services/analytics/systemAlertConfig.test.js`.
 *
 * @module config/systemAlerts
 */

/**
 * Catálogo canónico de tipos de alerta de sistema detectables por el motor.
 *
 * Estructura por entrada:
 *  - `label`: copy ES corto (titulo por defecto si el detector no aporta uno).
 *  - `description`: explicación pedagógica para la UI.
 *  - `source`: subsistema afectado (controla el badge de color y los filtros).
 *  - `thresholds`: umbrales overrideables vía env (consultar cada detector).
 *  - `direction`: 'negative' (problema) o 'positive' (informativo). Hoy todas
 *    las alertas de sistema son negativas; el campo se mantiene por simetría
 *    con `config/alerts.js`.
 *  - `defaultRunbook`: ruta a una doc interna sugerida (puede ser overridden
 *    desde el finding del detector con `runbookUrl`).
 */
const SYSTEM_ALERT_TYPES = Object.freeze({
  // ── Sistema / Operación ─────────────────────────────────────────────
  redis_high_latency: Object.freeze({
    label: 'Latencia elevada en Redis',
    description: 'Redis muestra latencias medias sostenidas por encima del umbral.',
    source: 'redis',
    thresholds: Object.freeze({ warningMs: 100, criticalMs: 500, sustainedSamples: 3 }),
    direction: 'negative',
    defaultRunbook: 'documentation/SECURITY.md#redis-latencia'
  }),
  mongo_disconnected: Object.freeze({
    label: 'MongoDB desconectado',
    description: 'La conexión a MongoDB no está disponible.',
    source: 'mongo',
    thresholds: Object.freeze({ downSamples: 2 }),
    direction: 'negative',
    defaultRunbook: 'documentation/SECURITY.md#mongo-disconnect'
  }),
  memory_pressure: Object.freeze({
    label: 'Memoria al límite',
    description: 'El heap del proceso supera el porcentaje configurado.',
    source: 'memory',
    thresholds: Object.freeze({ warningPct: 85, criticalPct: 95 }),
    direction: 'negative',
    defaultRunbook: 'backend/docs/Performance_Notes.md#memoria'
  }),
  queue_backlog: Object.freeze({
    label: 'Cola con acumulación',
    description: 'Una cola BullMQ acumula jobs pendientes o ha fallado recientemente.',
    source: 'queue',
    thresholds: Object.freeze({
      warningPending: 100,
      criticalPending: 500,
      failedAny: 1
    }),
    direction: 'negative',
    defaultRunbook: 'backend/docs/Arquitectura_Redis.md#bullmq'
  }),

  // ── Seguridad ───────────────────────────────────────────────────────
  account_lockout_spike: Object.freeze({
    label: 'Pico de bloqueos de cuenta',
    description: 'Varias cuentas se han bloqueado en la última hora por intentos fallidos.',
    source: 'auth',
    thresholds: Object.freeze({ warningPerHour: 5, criticalPerHour: 20 }),
    direction: 'negative',
    defaultRunbook: 'documentation/SECURITY.md#account-lockout'
  }),
  auth_failed_spike: Object.freeze({
    label: 'Pico de fallos de login',
    description: 'Tasa anormal de logins fallidos en la última hora.',
    source: 'auth',
    thresholds: Object.freeze({ warningPerHour: 50, criticalPerHour: 200 }),
    direction: 'negative',
    defaultRunbook: 'documentation/SECURITY.md#brute-force'
  }),
  token_theft_detected: Object.freeze({
    label: 'Token comprometido detectado',
    description: 'Reuso sospechoso de refresh token (posible robo de credenciales).',
    source: 'auth',
    thresholds: Object.freeze({ anyOccurrence: true }),
    direction: 'negative',
    defaultRunbook: 'documentation/SECURITY.md#token-theft'
  }),

  // ── Moderación ──────────────────────────────────────────────────────
  pending_teachers_aging: Object.freeze({
    label: 'Profesores pendientes envejecidos',
    description: 'Hay profesores en espera de aprobación desde hace demasiado tiempo.',
    source: 'moderation',
    thresholds: Object.freeze({ warningHours: 48, criticalDays: 7 }),
    direction: 'negative',
    defaultRunbook: null
  }),
  inactive_teachers: Object.freeze({
    label: 'Profesores inactivos',
    description: 'Profesores aprobados que llevan mucho tiempo sin entrar.',
    source: 'moderation',
    thresholds: Object.freeze({ infoDays: 30, warningDays: 90 }),
    direction: 'negative',
    defaultRunbook: null
  }),
  context_without_assets: Object.freeze({
    label: 'Contexto sin contenido',
    description: 'Un contexto se creó pero sigue sin assets pasado el plazo.',
    source: 'moderation',
    thresholds: Object.freeze({ warningHours: 24 }),
    direction: 'negative',
    defaultRunbook: null
  }),

  // ── Compliance ──────────────────────────────────────────────────────
  data_retention_lag: Object.freeze({
    label: 'Retención de datos retrasada',
    description: 'El job de retención RGPD no ha completado en la ventana esperada.',
    source: 'compliance',
    thresholds: Object.freeze({ warningHours: 48, criticalDays: 7 }),
    direction: 'negative',
    defaultRunbook: 'documentation/Proteccion_Datos_Menores.md#retencion'
  }),
  consent_withdrawal_spike: Object.freeze({
    label: 'Pico de retiradas de consentimiento',
    description: 'Volumen anómalo de retiradas de consentimiento parental en el último día.',
    source: 'compliance',
    thresholds: Object.freeze({ infoPerDay: 5, warningPerDay: 20 }),
    direction: 'negative',
    defaultRunbook: 'documentation/Proteccion_Datos_Menores.md#brechas'
  })
});

const SYSTEM_ALERT_TYPE_KEYS = Object.freeze(Object.keys(SYSTEM_ALERT_TYPES));

/** Severidades. Reutilizan el mismo enum que las alertas pedagógicas. */
const SYSTEM_ALERT_SEVERITIES = Object.freeze(['critical', 'warning', 'info']);

/** Estados del ciclo de vida. Mismos que SmartAlert para reutilizar UI. */
const SYSTEM_ALERT_STATUSES = Object.freeze(['active', 'resolved', 'dismissed', 'snoozed']);

/** Motivos de descarte. Mismos que SmartAlert. */
const SYSTEM_DISMISS_REASONS = Object.freeze([
  'false_positive',
  'already_addressed',
  'irrelevant',
  'other'
]);

/** Subsistemas (filtro principal en la UI del super_admin). */
const SYSTEM_ALERT_SOURCES = Object.freeze([
  'redis',
  'mongo',
  'memory',
  'queue',
  'auth',
  'moderation',
  'compliance'
]);

/**
 * Configuración del detector worker para alertas de sistema.
 * Las escalas son operacionales (horas) en lugar de pedagógicas (días).
 */
const SYSTEM_DETECTION_CONFIG = Object.freeze({
  /** Patrón cron del job BullMQ (cada 5 minutos por defecto — más frecuente que pedagogía). */
  cronPattern: process.env.SYSTEM_ALERT_DETECTION_CRON || '*/5 * * * *',
  /** Corridas consecutivas SIN aparecer antes de auto-resolve. */
  autoResolveAfterMissedRuns:
    Number.parseInt(process.env.SYSTEM_ALERT_AUTO_RESOLVE_MISSED, 10) || 2,
  /** Horas activa antes de promover warning → critical. */
  escalateWarningAfterHours: Number.parseFloat(process.env.SYSTEM_ALERT_ESCALATE_HOURS) || 2,
  /** Ocurrencias mínimas antes de poder escalar (igual semántica que pedagogía). */
  escalateMinOccurrences:
    Number.parseInt(process.env.SYSTEM_ALERT_ESCALATE_MIN_OCCURRENCES, 10) || 3,
  /** Horas tras dismiss para reabrir si reaparece como critical. */
  reopenAfterHours: Number.parseFloat(process.env.SYSTEM_ALERT_REOPEN_AFTER_HOURS) || 12,
  /** Días para hard-delete de alertas resolved/dismissed. */
  hardDeleteAfterDays: Number.parseInt(process.env.SYSTEM_ALERT_RETENTION_DAYS, 10) || 90,
  /** Máximo de alertas pinned a nivel global. */
  maxPinned: Number.parseInt(process.env.SYSTEM_ALERT_MAX_PINNED, 10) || 5,
  /** TTL del cache de listado/summary. */
  cacheTtlSeconds: Number.parseInt(process.env.SYSTEM_ALERT_CACHE_TTL_SEC, 10) || 30,
  /** Snooze: opciones predefinidas (horas) — la pedagógica usa días. */
  snoozePresetsHours: Object.freeze([1, 6, 24, 72]),
  /** Días para los presets también disponibles (compatibilidad con cliente). */
  snoozePresetsDays: Object.freeze([1, 3, 7]),
  /** Concurrencia del worker. */
  workerConcurrency: Math.max(
    1,
    Number.parseInt(process.env.SYSTEM_ALERT_DETECTION_WORKER_CONCURRENCY, 10) || 1
  )
});

/** Configuración del módulo de avisos a profesores (SystemAnnouncement). */
const SYSTEM_ANNOUNCEMENT_CONFIG = Object.freeze({
  /** Máximo de avisos activos simultáneos por audience. */
  maxActive: Number.parseInt(process.env.SYSTEM_ANNOUNCEMENT_MAX_ACTIVE, 10) || 3,
  /** TTL del cache `cache:announcements:active`. */
  cacheTtlSeconds: Number.parseInt(process.env.SYSTEM_ANNOUNCEMENT_CACHE_TTL_SEC, 10) || 60,
  /** Severidades permitidas. */
  severities: Object.freeze(['info', 'warning', 'urgent']),
  /** Audiencias permitidas. */
  audiences: Object.freeze(['all_teachers', 'all_users'])
});

module.exports = {
  SYSTEM_ALERT_TYPES,
  SYSTEM_ALERT_TYPE_KEYS,
  SYSTEM_ALERT_SEVERITIES,
  SYSTEM_ALERT_STATUSES,
  SYSTEM_DISMISS_REASONS,
  SYSTEM_ALERT_SOURCES,
  SYSTEM_DETECTION_CONFIG,
  SYSTEM_ANNOUNCEMENT_CONFIG
};
