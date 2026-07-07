/**
 * @fileoverview Hook que elige el nº de columnas óptimo para una rejilla de
 * cartas cuadradas, midiendo la región real con ResizeObserver y delegando el
 * cálculo en `pickSquareColumns` (puro). Devuelve un `ref` que debe colocarse
 * en el contenedor de la rejilla (el elemento `flex-1` que define el área
 * disponible) y el número de columnas resultante.
 *
 * Por qué ResizeObserver y no clases responsive estáticas (ADR-207 addendum):
 * el recuento óptimo de columnas depende del *aspect-ratio* de la región, que
 * varía de forma continua con la resolución (ancha-baja a 720p, más cuadrada a
 * 4K con el cap de altura). Una rejilla con columnas fijas por breakpoint no
 * puede maximizar el lado de carta en ambos extremos a la vez.
 *
 * No hay bucle de feedback: cambiar el número de columnas redistribuye filas
 * vía `auto-rows-fr` pero NO altera el tamaño del contenedor observado (sigue
 * siendo `flex-1` de su región), así que el ResizeObserver no se re-dispara por
 * el propio cambio.
 */

import { useState, useEffect, useRef } from 'react';
import { pickSquareColumns } from '../lib/squareGrid';

/**
 * @param {number} count Nº de cartas a disponer.
 * @param {Object} [opts]
 * @param {number} [opts.gap=12]     Separación entre celdas en px (para el cálculo).
 * @param {number} [opts.minCols=2]  Mínimo de columnas.
 * @param {number} [opts.maxCols=8]  Máximo de columnas.
 * @returns {[import('react').RefObject<HTMLElement>, number]} `[ref, columns]`
 */
export function useSquareGridColumns(count, { gap = 12, minCols = 2, maxCols = 8 } = {}) {
  const ref = useRef(null);
  // Default estable (≈√n) para el primer render, antes de la primera medida.
  const [cols, setCols] = useState(() =>
    pickSquareColumns({ count, width: 0, height: 0, gap, minCols, maxCols })
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const recompute = (width, height) => {
      const next = pickSquareColumns({ count, width, height, gap, minCols, maxCols });
      setCols(prev => (prev === next ? prev : next));
    };
    // Medida inicial síncrona (ResizeObserver también dispara al observar, pero
    // adelantamos el cálculo para evitar un frame con el default).
    const rect = el.getBoundingClientRect();
    recompute(rect.width, rect.height);

    const ro = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect;
      if (box) recompute(box.width, box.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [count, gap, minCols, maxCols]);

  return [ref, cols];
}

export default useSquareGridColumns;
