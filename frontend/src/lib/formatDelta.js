/**
 * Calcula el delta porcentual entre dos valores numéricos.
 *
 * Devuelve "—" cuando no se puede calcular un porcentaje significativo
 * (sin baseline, primer dato, división por cero, NaN). El frontend pinta ese
 * guión como pill neutro en lugar de mostrar la línea vacía o un "+Infinity%"
 * que daría apariencia de bug (PROP-88).
 *
 * @param {number} current - Valor del periodo actual.
 * @param {number} previous - Valor del periodo anterior usado como baseline.
 * @returns {string} Delta formateado: "+12.5%", "-3.2%", o "—" si no aplica.
 *
 * @example
 *   formatDelta(15, 10)   // "+50%"
 *   formatDelta(8, 10)    // "-20%"
 *   formatDelta(10, 0)    // "—"   (sin baseline real)
 *   formatDelta(5, null)  // "—"
 */
export function formatDelta(current, previous) {
  if (
    previous === null ||
    previous === undefined ||
    previous === 0 ||
    !Number.isFinite(previous)
  ) {
    return '—';
  }
  if (current === null || current === undefined || !Number.isFinite(current)) {
    return '—';
  }

  const delta = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(delta)) {
    return '—';
  }

  const rounded = Math.round(delta * 10) / 10;
  // Decimal solo si aporta información (evita "+50.0%" que no añade nada).
  const withDecimals = rounded % 1 !== 0;
  const formatted = withDecimals ? rounded.toFixed(1) : String(Math.trunc(rounded));
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${formatted}%`;
}

/**
 * Heurística para detectar si un trend representa el placeholder neutro "—".
 * StatCard usa este check para pintar el pill sin verde/rojo ni flecha.
 */
export function isNeutralDelta(trend) {
  return trend === '—' || trend === '-';
}
