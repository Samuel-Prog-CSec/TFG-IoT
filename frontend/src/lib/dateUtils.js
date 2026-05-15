/**
 * @fileoverview Formatters de fechas relativas y absolutas en espanol.
 *
 * Reemplaza los 3 helpers duplicados (`formatRelativeDate` en AlertsHub,
 * `getRelativeTime` en Dashboard y StudentProfile) por una funcion unica que
 * maneja correctamente minutos, horas, dias, semanas, meses y fechas absolutas.
 *
 * Internamente usa `Intl.RelativeTimeFormat('es', { numeric: 'auto' })` cuando
 * es posible (p.ej. devuelve "ayer" / "hoy" automaticamente), con fallback a
 * `Intl.DateTimeFormat` para fechas antiguas.
 */

const RTF_CACHE = new Map();

function getRtf(numeric = 'auto') {
  if (typeof Intl === 'undefined' || !Intl.RelativeTimeFormat) return null;
  if (!RTF_CACHE.has(numeric)) {
    RTF_CACHE.set(numeric, new Intl.RelativeTimeFormat('es', { numeric }));
  }
  return RTF_CACHE.get(numeric);
}

/**
 * Formatea un timestamp como texto relativo en espanol.
 *
 * Rangos:
 *  - <1 min          → "Ahora mismo"
 *  - <60 min         → "Hace N min"
 *  - <24 h           → "Hace N h"
 *  - <7 d            → "Hace N d" (o "Ayer"/"Hoy" si numeric=auto)
 *  - <30 d           → "Hace N sem"
 *  - <365 d          → "Hace N meses"
 *  - ≥365 d          → fecha absoluta (DD mmm YYYY)
 *
 * @param {Date|string|number|null|undefined} input
 * @param {Object} [options]
 * @param {Date} [options.now=new Date()] - util para tests deterministas
 * @returns {string} texto listo para UI
 */
export function formatRelativeTime(input, options = {}) {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';

  const now = options.now instanceof Date ? options.now : new Date();
  const diffMs = now.getTime() - date.getTime();
  const absDiff = Math.abs(diffMs);
  const futureSign = diffMs < 0 ? 1 : -1; // RelativeTimeFormat: pasado = negativo

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  if (absDiff < MINUTE) return 'Ahora mismo';

  const rtfAuto = getRtf('auto');

  if (absDiff < HOUR) {
    const mins = Math.round(absDiff / MINUTE);
    return `Hace ${mins} min`;
  }
  if (absDiff < DAY) {
    const hrs = Math.round(absDiff / HOUR);
    return `Hace ${hrs} h`;
  }
  if (absDiff < WEEK) {
    // Entre 1 y 6 dias: usar RTF para "ayer" / "hace 2 dias" naturales
    const days = Math.round(absDiff / DAY);
    if (rtfAuto) {
      const text = rtfAuto.format(futureSign * days, 'day');
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    return `Hace ${days} d`;
  }
  if (absDiff < MONTH) {
    const weeks = Math.round(absDiff / WEEK);
    return `Hace ${weeks} sem`;
  }
  if (absDiff < YEAR) {
    const months = Math.round(absDiff / MONTH);
    return `Hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  }

  // Fecha absoluta para >1 ano
  if (ABSOLUTE_DATE_FMT) {
    return ABSOLUTE_DATE_FMT.format(date);
  }
  return date.toLocaleDateString('es-ES');
}

// Cacheado a nivel modulo: cada `new Intl.DateTimeFormat` reserva
// docenas de objetos en cada llamada, asi que para fechas absolutas
// (caso comun en listados densos) reutilizamos la instancia.
const ABSOLUTE_DATE_FMT =
  typeof Intl !== 'undefined' && Intl.DateTimeFormat
    ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
