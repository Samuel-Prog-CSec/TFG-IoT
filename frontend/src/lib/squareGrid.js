/**
 * @fileoverview Selección de columnas para rejillas de cartas CUADRADAS que
 * deben llenar al máximo una región dada (ADR-207 addendum: columnas
 * adaptativas por aspect-ratio).
 *
 * Una rejilla de N cartas cuadradas dentro de una región `width × height` tiene
 * un tamaño de carta = `min(anchoColumna, altoFila)`. Ese tamaño depende del
 * número de columnas elegido. Esta función prueba todos los recuentos de
 * columnas viables y devuelve el que MAXIMIZA el lado de la carta:
 *  - Región ancha y baja (p.ej. el panel táctil a 720p) → más columnas / menos
 *    filas → cartas mayores.
 *  - Región alta y más cuadrada (p.ej. a 4K con el cap de altura) → menos
 *    columnas / más filas → las cartas llenan el alto.
 *
 * Es pura y determinista (testeable sin DOM); el hook `useSquareGridColumns`
 * la alimenta con la medida real de la región vía ResizeObserver.
 */

/**
 * @param {Object} params
 * @param {number} params.count   Nº de cartas.
 * @param {number} params.width   Ancho de la región en px (content-box).
 * @param {number} params.height  Alto de la región en px (content-box).
 * @param {number} [params.gap=12]      Separación entre celdas en px.
 * @param {number} [params.minCols=1]   Mínimo de columnas (evita tiras de 1).
 * @param {number} [params.maxCols=8]   Máximo de columnas (legibilidad).
 * @returns {number} Nº de columnas que maximiza el lado de carta.
 */
export function pickSquareColumns({
  count,
  width,
  height,
  gap = 12,
  minCols = 1,
  maxCols = 8
}) {
  const n = Math.max(1, Math.floor(Number(count)) || 1);
  const lo = Math.max(1, Math.min(minCols, n));
  const hi = Math.max(lo, Math.min(maxCols, n));

  // Sin una medida válida de la región (primer render, SSR, NaN), caemos a una
  // heurística cuadrada estable (≈ √n) para no parpadear con un valor absurdo.
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return Math.min(hi, Math.max(lo, Math.ceil(Math.sqrt(n))));
  }

  let best = { cols: lo, size: -1, rows: Infinity };
  for (let c = lo; c <= hi; c++) {
    const rows = Math.ceil(n / c);
    const cellW = (width - gap * (c - 1)) / c;
    const cellH = (height - gap * (rows - 1)) / rows;
    const size = Math.min(cellW, cellH);
    // Mayor tamaño gana; en empate (~0.5px) preferimos MENOS filas (rejilla
    // más limpia, menos última fila incompleta).
    const better =
      size > best.size + 0.5 ||
      (Math.abs(size - best.size) <= 0.5 && rows < best.rows);
    if (better) {
      best = { cols: c, size, rows };
    }
  }
  return best.cols;
}

export default pickSquareColumns;
