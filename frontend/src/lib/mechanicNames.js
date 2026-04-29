/**
 * @fileoverview Normalizacion de nombres de mecanicas.
 *
 * El backend almacena nombres internos en minuscula (`memory`, `association`,
 * `sequence`) y, opcionalmente, un `displayName` en espanol para la UI. Algunas
 * pipelines de analytics (p.ej. contentEffectivenessService) proyectan el `name`
 * interno cuando el `displayName` no esta presente, lo que rompe la coherencia
 * de la UI (aparece "memory"/"association" junto al resto de la app que usa
 * "Memoria"/"Asociacion").
 *
 * Este helper centraliza el mapping y provee un fallback consistente para
 * cualquier nombre no mapeado (capitaliza la primera letra).
 */

const MECHANIC_DISPLAY = Object.freeze({
  memory: 'Memoria',
  association: 'Asociación',
  sequence: 'Secuencia'
});

/**
 * Formatea un nombre de mecanica para mostrar en UI.
 *
 * @param {string|null|undefined} raw - nombre interno (`memory`) o ya formateado
 * @returns {string} nombre formateado ("Memoria") o "Mecánica" si falta
 */
export function formatMechanicName(raw) {
  if (!raw || typeof raw !== 'string') return 'Mecánica';
  const trimmed = raw.trim();
  if (!trimmed) return 'Mecánica';
  const lc = trimmed.toLowerCase();
  if (MECHANIC_DISPLAY[lc]) return MECHANIC_DISPLAY[lc];
  // Fallback: capitaliza primera letra preservando el resto
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
