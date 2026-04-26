/**
 * @fileoverview Catálogo declarativo de feature flags conocidas por el sistema.
 *
 * Cada entrada representa una flag que el código backend o frontend consulta vía
 * `featureFlagService.isEnabled(name, userId)` o el hook `useFeatureFlag(name)`.
 * El panel admin (`/admin/flags`) cruza este catálogo con las flags realmente
 * presentes en Redis: las que aparecen aquí pero no existen aún se muestran como
 * "Por crear" y el admin puede materializarlas con un click.
 *
 * Añadir una entrada aquí NO crea la flag automáticamente — solo la declara como
 * conocida. Para inicializarlas en una instancia recién desplegada usar el
 * script `npm run seed:feature-flags` (idempotente, no sobrescribe estado manual).
 *
 * @module config/featureFlagsCatalog
 */

/**
 * @typedef {Object} CatalogFlag
 * @property {string} name - Identificador (camelCase, kebab o snake).
 * @property {string} description - Para qué sirve la flag, audiencia y proposito.
 * @property {boolean} defaultEnabled - Valor inicial al ejecutar el seeder.
 * @property {number} [defaultRolloutPct=0] - Rollout inicial.
 * @property {string} [reason=''] - Razón de negocio (ADR, propuesta, ticket).
 */

/** @type {CatalogFlag[]} */
const FEATURE_FLAGS_CATALOG = [
  {
    name: 'redis-leaderboards-zset',
    description: 'Leaderboards por sesión via ZSET en Redis (PROP-60)',
    defaultEnabled: false,
    reason: 'Diferida a Sprint 7 — infra lista pero no activada por defecto'
  },
  {
    name: 'student-metrics-redis-hash',
    description: 'studentMetrics materializadas en Redis Hash (PROP-63)',
    defaultEnabled: false,
    reason: 'Diferida a Sprint 7 — pendiente de validar coste/beneficio'
  },
  {
    name: 'rfid-mode-distributed',
    description: 'RFID mode coordinado vía Redis pub/sub multi-instancia (PROP-64, ADR-076)',
    defaultEnabled: true,
    defaultRolloutPct: 100,
    reason: 'En producción tras pre-v1.0.0 23/04/2026'
  },
  {
    name: 'ws-rate-limit-distributed',
    description: 'Rate limit de WebSocket vía Lua + ZSET en Redis (PROP-59, ADR-072)',
    defaultEnabled: true,
    defaultRolloutPct: 100,
    reason: 'Insurance limiter local mantiene cobertura ante caída de Redis'
  },
  {
    name: 'bullmq-worker',
    description: 'Worker BullMQ separado para data-retention y backfills (PROP-62, ADR-077)',
    defaultEnabled: true,
    defaultRolloutPct: 100,
    reason: 'Activo en docker-compose worker service'
  },
  {
    name: 'context-cache-invalidator',
    description: 'Invalidación de cache de contextos al editar assets (PROP-12)',
    defaultEnabled: true,
    defaultRolloutPct: 100,
    reason: 'Estable desde el paquete pre-v1.0.0'
  },
  {
    name: 'feature-flags-ui',
    description: 'Panel admin /admin/flags habilitado (PROP-61, ADR-073)',
    defaultEnabled: true,
    defaultRolloutPct: 100,
    reason: 'Necesario para que super_admin pueda gestionar flags en runtime'
  },
  {
    name: 'deck-sparkline',
    description: 'Sparkline de actividad reciente en SessionCard (PROP-5)',
    defaultEnabled: true,
    defaultRolloutPct: 100
  },
  {
    name: 'icon-opt-in',
    description: 'Wrapper Icon opt-in para tree-shaking de Lucide (PROP-8)',
    defaultEnabled: false,
    reason: 'Migración de 64 archivos parcial — diferida'
  }
];

module.exports = {
  FEATURE_FLAGS_CATALOG
};
