/**
 * @fileoverview Hook envoltorio sobre `@tanstack/react-virtual` con
 * threshold opcional (T-952 Fase B).
 *
 * Permite que un listado decida en runtime si necesita virtualización
 * (≥`enableAt` items por defecto 50) o si puede renderizar todos
 * directamente. El consumidor recibe un flag `shouldVirtualize` y, si
 * aplica, la API estándar de `useVirtualizer` (scrollElementRef,
 * virtualItems, totalSize, measureElement).
 *
 * Esto evita complicar el render para listados pequeños (que es la
 * realidad del 99% de aulas: 10-30 alumnos), mientras cubre el criterio
 * de aceptación T-952 "virtualización funciona con 1000+ items" cuando
 * un super_admin gestiona centros grandes o cuando se siembra un dataset
 * sintético para QA.
 *
 * @module hooks/useVirtualizedList
 */

import { useCallback, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const DEFAULT_THRESHOLD = 50;
const DEFAULT_OVERSCAN = 8;

/**
 * @typedef {Object} UseVirtualizedListOptions
 * @property {number} count — Número total de items a renderizar.
 * @property {number} [enableAt=50] — A partir de cuántos items se activa
 *   la virtualización. Si `count < enableAt`, el hook devuelve
 *   `shouldVirtualize=false` y el consumidor debe renderizar todos los
 *   items de forma normal.
 * @property {number | ((index: number) => number)} [estimateSize=80]
 *   Estimación de la altura en px de cada fila (o función que devuelve
 *   la altura por índice). Cuanto más precisa, menos saltos al
 *   scrollear. Para items dinámicos usa `measureElement`.
 * @property {number} [overscan=8] — Items extra que se renderizan
 *   antes/después del viewport para suavizar el scroll.
 * @property {('vertical'|'horizontal')} [orientation='vertical']
 *
 * @returns {{
 *   shouldVirtualize: boolean,
 *   scrollElementRef: React.RefObject<HTMLElement>,
 *   virtualItems: Array<{ index: number, key: string|number, start: number, size: number, lane: number }>,
 *   totalSize: number,
 *   measureElement: (node: Element | null) => void,
 * }}
 */
export function useVirtualizedList({
  count,
  enableAt = DEFAULT_THRESHOLD,
  estimateSize = 80,
  overscan = DEFAULT_OVERSCAN,
  orientation = 'vertical',
} = {}) {
  // Importante: usamos `useState` + callback ref en lugar de `useRef`
  // porque `useVirtualizer` necesita re-ejecutarse cuando el scroll
  // element se monta. `useRef` no dispara re-render, así que la primera
  // vez que el hook se ejecuta `getScrollElement` retorna null, el
  // virtualizer no se inicializa y la lista queda vacía aunque después
  // el ref reciba el elemento. Con `useState`, el callback ref dispara
  // un setState al asignarse, el componente re-renderiza y el
  // virtualizer mide la altura del scroll element correctamente.
  const [scrollElement, setScrollElement] = useState(null);
  const scrollElementRef = useCallback((el) => {
    setScrollElement(el);
  }, []);

  const shouldVirtualize = Number(count) >= Number(enableAt);

  const estimateFn = useMemo(() => {
    if (typeof estimateSize === 'function') return estimateSize;
    return () => Number(estimateSize) || 80;
  }, [estimateSize]);

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? count : 0,
    getScrollElement: () => scrollElement,
    estimateSize: estimateFn,
    overscan,
    horizontal: orientation === 'horizontal',
  });

  return {
    shouldVirtualize,
    scrollElementRef,
    virtualItems: shouldVirtualize ? virtualizer.getVirtualItems() : [],
    totalSize: shouldVirtualize ? virtualizer.getTotalSize() : 0,
    measureElement: virtualizer.measureElement,
  };
}

export default useVirtualizedList;
