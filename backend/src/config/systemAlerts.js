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

  // ── Free-tier budget (T-910) ────────────────────────────────────────
  // Detectores que vigilan la proximidad a las cuotas del free tier
  // observables internamente. Las cuotas de proveedores sin API gratuita
  // (Sentry, Supabase, Cloudflare) se revisan manualmente vía workflow
  // mensual; ver `documentation/Free_Tier_Budget.md` §5.
  upstash_commands_quota: Object.freeze({
    label: 'Comandos Upstash cerca del límite diario',
    description:
      'La proyección lineal del consumo diario de comandos Redis supera el umbral del free tier.',
    source: 'redis',
    thresholds: Object.freeze({
      warningPct: 80,
      criticalPct: 95,
      // El default cubre el caso conservador 10K/día; ajustable por env
      // cuando Upstash modifique límites o se migre a paid.
      dailyBudget: Number.parseInt(process.env.UPSTASH_DAILY_BUDGET, 10) || 10000
    }),
    direction: 'negative',
    defaultRunbook: 'documentation/Runbook_Operacional.md#13b'
  }),
  atlas_storage_quota: Object.freeze({
    label: 'Almacenamiento Atlas cerca del límite',
    description:
      'El uso de storage (data + index) en MongoDB Atlas M0 supera el umbral configurado.',
    source: 'mongo',
    thresholds: Object.freeze({
      warningPct: 80,
      criticalPct: 95,
      // M0 free tier ofrece 512 MB; configurable para tiers superiores.
      storageBudgetMB: Number.parseInt(process.env.ATLAS_STORAGE_BUDGET_MB, 10) || 512
    }),
    direction: 'negative',
    defaultRunbook: 'documentation/Runbook_Operacional.md#13a'
  }),
  rate_limit_store_fallback: Object.freeze({
    label: 'Rate limit no distribuido',
    description:
      'Algún rate limiter HTTP ha caído a MemoryStore por ausencia de Redis: el límite global ya no se comparte entre instancias.',
    source: 'redis',
    thresholds: Object.freeze({ anyOccurrence: true }),
    direction: 'negative',
    defaultRunbook: 'documentation/Runbook_Operacional.md#13b'
  }),
  in_memory_cache_low_hit: Object.freeze({
    label: 'Hit ratio de caché en memoria bajo',
    description:
      'El hit ratio agregado del cache LRU en memoria está por debajo del umbral sostenido durante varias muestras.',
    source: 'memory',
    thresholds: Object.freeze({
      warningHitRatio: Number.parseFloat(process.env.LRU_HIT_RATIO_WARN) || 0.4,
      sustainedSamples: 4,
      // Por debajo de este número de lookups totales no se evalúa
      // (evita falsos positivos en arranques con poco tráfico).
      minLookups: 50
    }),
    direction: 'negative',
    defaultRunbook: 'backend/docs/Performance_Notes.md#cache-lru'
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
  }),

  // ── Acciones administrativas ────────────────────────────────────────
  admin_approval_spike: Object.freeze({
    label: 'Pico de aprobaciones/rechazos administrativos',
    description:
      'Volumen anómalo de aprobaciones o rechazos de cuentas en la última hora. ' +
      'Una sesión de super_admin comprometida o un script automatizado podrían ' +
      'estar procesando solicitudes en masa.',
    source: 'admin',
    thresholds: Object.freeze({ warningPerHour: 20, criticalPerHour: 50 }),
    direction: 'negative',
    defaultRunbook: 'documentation/SECURITY.md#admin-approval-anomaly'
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
  'compliance',
  'admin'
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
