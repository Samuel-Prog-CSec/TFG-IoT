import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Observa un contenedor con overflow-x y expone su estado de scroll.
 *
 * Retorna:
 *  - `ref` — asignar al contenedor que scrollea horizontalmente.
 *  - `hasOverflow` — true si el contenido excede el ancho visible.
 *  - `canScrollRight` — true si todavia queda contenido a la derecha.
 *  - `scrollByOne(behavior)` — scroll programatico de ~80% del viewport.
 *
 * Re-evalua en scroll del elemento, resize de la ventana y cambios de
 * tamaño del contenedor (ResizeObserver). Pensado para mostrar/ocultar
 * affordances de scroll (gradient fade + chevron) de forma honesta —
 * solo aparecen cuando hay contenido real pendiente.
 */
export function useHorizontalScroll() {
  const ref = useRef(null);
  const [state, setState] = useState({ hasOverflow: false, canScrollRight: false });

  const recalc = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth - el.clientWidth > 2;
    const canScrollRight =
      hasOverflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setState(prev =>
      prev.hasOverflow === hasOverflow && prev.canScrollRight === canScrollRight
        ? prev
        : { hasOverflow, canScrollRight }
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    recalc();
    el.addEventListener('scroll', recalc, { passive: true });
    window.addEventListener('resize', recalc);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recalc) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', recalc);
      window.removeEventListener('resize', recalc);
      ro?.disconnect();
    };
  }, [recalc]);

  const scrollByOne = useCallback((behavior = 'smooth') => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: Math.round(el.clientWidth * 0.8), behavior });
  }, []);

  return { ref, scrollByOne, ...state };
}
