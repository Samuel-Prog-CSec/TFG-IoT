import { useEffect, useState } from 'react';
import { formatRelativeTime } from '../lib/dateUtils';

/**
 * Hook que devuelve un string de tiempo relativo auto-actualizado.
 *
 * Re-renderiza cada `intervalMs` (default 60s) para mantener el texto vivo
 * aunque el componente permanezca montado largo rato (p.ej. dashboard que
 * queda abierto).
 *
 * @param {Date|string|number|null|undefined} date
 * @param {number} [intervalMs=60_000]
 * @returns {string}
 */
export function useRelativeTime(date, intervalMs = 60_000) {
  const [label, setLabel] = useState(() => formatRelativeTime(date));

  useEffect(() => {
    setLabel(formatRelativeTime(date));
    if (!date) return undefined;
    const id = setInterval(() => {
      setLabel(formatRelativeTime(date));
    }, intervalMs);
    return () => clearInterval(id);
  }, [date, intervalMs]);

  return label;
}
