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

  // En cada rango, si `Math.round` empuja el valor al máximo de la unidad
  // (p. ej. 59.6 min → 60, o 23.6 h → 24) se PROMOCIONA a la unidad superior
  // para no mostrar "Hace 60 min" / "Hace 24 h": se deja caer al siguiente
  // bloque, cuyo `absDiff < ...` sigue siendo cierto y redondea a "Hace 1 h" /
  // "Ayer" de forma natural.
  if (absDiff < HOUR) {
    const mins = Math.round(absDiff / MINUTE);
    if (mins < 60) return `Hace ${mins} min`;
  }
  if (absDiff < DAY) {
    const hrs = Math.round(absDiff / HOUR);
    if (hrs < 24) return `Hace ${hrs} h`;
  }
  if (absDiff < WEEK) {
    // Entre 1 y 6 dias: usar RTF para "ayer" / "hace 2 dias" naturales
    const days = Math.round(absDiff / DAY);
    if (days < 7) {
      if (rtfAuto) {
        const text = rtfAuto.format(futureSign * days, 'day');
        return text.charAt(0).toUpperCase() + text.slice(1);
      }
      return `Hace ${days} d`;
    }
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

// ────────────────────────────────────────────────────────────────────────
// Cohort helpers (T-942 Fase E.1)
//
// Devuelven rangos { start, end } usados por el selector "Mes actual" y
// "Trimestre actual" del Dashboard teacher. Útiles cuando el frontend
// necesita filtrar localmente datos pre-agregados que no exponen un
// `startDate` en el endpoint backend.
//
// Convención: `start` siempre es el primer día del periodo a las 00:00
// horario local (sin desplazamiento UTC, para que la franja horaria del
// docente sea la de su navegador). `end` es el `now` recibido (típicamente
// `new Date()`), de forma que el rango es ventana cerrada-abierta del
// periodo en curso.
// ────────────────────────────────────────────────────────────────────────

/**
 * Devuelve el rango temporal del mes actual.
 *
 * Útil para el selector de cohort "Mes actual" del Dashboard teacher.
 *
 * @param {Date} [now=new Date()] Fecha actual (parametrizable para tests).
 * @returns {{ start: Date, end: Date }} Inicio (1 del mes a las 00:00) y `now`.
 */
export function getCurrentMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { start, end: now };
}

/**
 * Devuelve el rango temporal del trimestre actual (Q1: ene-mar,
 * Q2: abr-jun, Q3: jul-sep, Q4: oct-dic).
 *
 * Útil para el selector de cohort "Trimestre actual" del Dashboard teacher.
 *
 * @param {Date} [now=new Date()] Fecha actual (parametrizable para tests).
 * @returns {{ start: Date, end: Date }} Inicio (1 del primer mes del Q a las 00:00) y `now`.
 */
export function getCurrentQuarterRange(now = new Date()) {
  const month = now.getMonth();
  const quarterStartMonth = month - (month % 3);
  const start = new Date(now.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0);
  return { start, end: now };
}
