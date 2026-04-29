/**
 * @fileoverview Fuente única de verdad para umbrales RAG y tiers de rendimiento
 * en el frontend de analytics.
 *
 * Estos valores reflejan los definidos en el backend:
 *   backend/src/services/analytics/analyticsHelpers.js → PERFORMANCE_TIERS, KPI_DEFINITIONS
 *
 * Si los umbrales cambian en el backend, deben actualizarse aquí también.
 */

// ══════════════════════════════════════════════════════════════════════
// Performance Tiers (coinciden con backend analyticsHelpers.js)
// ══════════════════════════════════════════════════════════════════════

/**
 * Rangos de rendimiento con boundaries, labels y clases Tailwind.
 */
export const PERFORMANCE_TIERS = [
  { tier: 'risk', label: 'Necesita apoyo', min: 0, max: 49 },
  { tier: 'average', label: 'Promedio', min: 50, max: 69 },
  { tier: 'good', label: 'Bueno', min: 70, max: 89 },
  { tier: 'excellent', label: 'Excelente', min: 90, max: 100 },
];

/**
 * Configuración visual de cada tier para badges y cards.
 */
export const TIER_CONFIG = {
  excellent: { label: 'Excelente', className: 'bg-success-base/15 text-success-base border-success-base/30' },
  good: { label: 'Bueno', className: 'bg-success-base/10 text-success-base/80 border-success-base/20' },
  average: { label: 'Promedio', className: 'bg-warning-base/15 text-warning-base border-warning-base/30' },
  risk: { label: 'Necesita apoyo', className: 'bg-error-base/15 text-error-base border-error-base/30' },
};

/**
 * Badges compactos para tablas e historial de partidas.
 */
export const TIER_BADGE = {
  excellent: { label: 'Excelente', className: 'bg-success-base/15 text-success-base' },
  good: { label: 'Bueno', className: 'bg-success-base/10 text-success-base/80' },
  average: { label: 'Medio', className: 'bg-warning-base/15 text-warning-base' },
  risk: { label: 'Bajo', className: 'bg-error-base/15 text-error-base' },
};

// ══════════════════════════════════════════════════════════════════════
// Funciones de clasificación
// ══════════════════════════════════════════════════════════════════════

/**
 * Clasifica un score (0-100) en un tier de rendimiento.
 * @param {number|null|undefined} score
 * @returns {'excellent'|'good'|'average'|'risk'}
 */
export function scoreToTier(score) {
  if (score == null || score < 0) return 'risk';
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'average';
  return 'risk';
}

/**
 * Mapea un score a color RAG semántico (green/amber/red).
 * @param {number|null|undefined} score
 * @returns {'green'|'amber'|'red'}
 */
export function scoreToRAG(score) {
  if (score == null) return 'red';
  if (score >= 70) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

/**
 * Devuelve un CSS custom property de color según el score.
 * Para uso en charts de Recharts que necesitan color inline.
 * @param {number} score
 * @returns {string} CSS variable
 */
export function getRAGCSSColor(score) {
  if (score >= 70) return 'var(--color-success-base)';
  if (score >= 50) return 'var(--color-warning-base)';
  return 'var(--color-error-base)';
}

/**
 * Mapea un score a color RAG con soporte para null/NaN → 'gray'.
 * Pensado para matrices y celdas que pueden no tener datos.
 * @param {number|null|undefined} score
 * @returns {'green'|'amber'|'red'|'gray'}
 */
export function scoreToRAGWithNull(score) {
  if (score == null || isNaN(score)) return 'gray';
  if (score >= 70) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}
