import { useEffect, useState } from 'react';

/**
 * @fileoverview Hook genérico de debounce — devuelve el último valor
 * estabilizado después de `delay` ms sin cambios (T-952 Fase C).
 *
 * Útil cuando hay un input cuyo `onChange` se dispara en cada keystroke
 * pero el efecto secundario (API call, autosave, recalcular sugerencias)
 * solo debe ejecutarse cuando el usuario "pausa". El consumidor escribe
 * con el valor crudo en el input controlado y consume `debouncedValue`
 * en su `useEffect` para el side effect.
 *
 * Ejemplo:
 *
 *   const [query, setQuery] = useState('');
 *   const debouncedQuery = useDebounce(query, 300);
 *   useEffect(() => fetchResults(debouncedQuery), [debouncedQuery]);
 *
 * @template T
 * @param {T} value
 * @param {number} delay
 * @returns {T}
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handle = globalThis.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => globalThis.clearTimeout(handle);
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
