import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'sidebar:mode';
const VALID = ['auto', 'compact', 'expanded'];

const readStored = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
};

const computeLayout = (preference, width) => {
  // <lg siempre drawer, no se puede override.
  if (width < 1024) return 'drawer';
  // auto: rail entre 1024-1439 (incluye caso 1366×768), expanded en ≥1440.
  // Nota: el ADR-115 menciona "≥xl=1280 expanded" pero el contrato de los
  // tests sitúa 1366 en rail. Se adopta 1440 como umbral wide para que el
  // peor caso de portátiles del tribunal siga colapsado a rail.
  if (preference === 'auto') return width < 1440 ? 'rail' : 'expanded';
  if (preference === 'compact') return 'rail';
  return 'expanded';
};

/**
 * Hook que coordina el modo de la sidebar.
 * @returns {{ preference, layout, setPreference, toggle }}
 */
export function useSidebarMode() {
  const [preference, setPreferenceState] = useState(readStored);
  const [width, setWidth] = useState(() =>
    typeof globalThis !== 'undefined' ? globalThis.innerWidth : 1920
  );

  useEffect(() => {
    const handler = () => setWidth(globalThis.innerWidth);
    globalThis.addEventListener('resize', handler);
    return () => globalThis.removeEventListener('resize', handler);
  }, []);

  const setPreference = useCallback((next) => {
    if (!VALID.includes(next)) return;
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage no disponible — modo memoria */
    }
  }, []);

  const toggle = useCallback(() => {
    setPreferenceState((prev) => {
      const idx = VALID.indexOf(prev);
      const next = VALID[(idx + 1) % VALID.length];
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  return { preference, layout: computeLayout(preference, width), setPreference, toggle };
}

