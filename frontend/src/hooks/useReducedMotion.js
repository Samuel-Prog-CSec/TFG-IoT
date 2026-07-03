import { useCallback, useEffect, useMemo, useState } from 'react';

const REDUCED_MOTION_STORAGE_KEY = 'eduplay:reduced-motion';

const normalizeStoredPreference = (rawValue) => {
  if (rawValue === 'reduce') return 'reduce';
  if (rawValue === 'no-preference') return 'no-preference';
  return null;
};

const readStoredPreference = () => {
  if (typeof globalThis === 'undefined') return null;
  try {
    return normalizeStoredPreference(
      globalThis.localStorage?.getItem(REDUCED_MOTION_STORAGE_KEY)
    );
  } catch {
    return null;
  }
};

// NOTA (mantenimiento 2026-07): se evaluó elevar `userPreference` a un store
// módulo-level para que el toggle "Animaciones" propagara a las 70+ instancias
// del hook a la vez. Se REVIRTIÓ: esa propagación provoca un re-render EN SITIO
// masivo y simultáneo que, con extensiones de navegador que inyectan nodos en el
// DOM gestionado por React (p. ej. antivirus tipo Kaspersky "protección web"),
// dispara `NotFoundError: removeChild` y tumba la app al error boundary. El
// atributo `data-reduced-motion` de `<html>` (más abajo) ya propaga la
// preferencia a TODAS las animaciones/transiciones CSS de inmediato; los
// componentes Framer Motion la recogen en su siguiente render. Ese pequeño
// desfase es preferible a un crash con extensiones que mutan el DOM.

/**
 * Hook para gestionar reduced motion solo por preferencia explícita del usuario.
 *
 * Prioridad de decisión:
 * 1) Preferencia persistida en app (si existe)
 * 2) Preferencia del sistema operativo
 */
export function useReducedMotion() {
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => {
    if (typeof globalThis === 'undefined' || !globalThis.matchMedia) {
      return false;
    }
    return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  const [userPreference, setUserPreferenceState] = useState(() => readStoredPreference());

  useEffect(() => {
    if (typeof globalThis === 'undefined' || !globalThis.matchMedia) {
      return undefined;
    }

    const mediaQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMediaChange = (event) => {
      setSystemReducedMotion(event.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
      return () => mediaQuery.removeEventListener('change', handleMediaChange);
    }

    mediaQuery.addListener(handleMediaChange);
    return () => mediaQuery.removeListener(handleMediaChange);
  }, []);

  const setUserPreference = useCallback((preference) => {
    const normalizedPreference = normalizeStoredPreference(preference);
    setUserPreferenceState(normalizedPreference);

    try {
      if (!normalizedPreference) {
        globalThis.localStorage?.removeItem(REDUCED_MOTION_STORAGE_KEY);
        return;
      }
      globalThis.localStorage?.setItem(REDUCED_MOTION_STORAGE_KEY, normalizedPreference);
    } catch {
      // no-op
    }
  }, []);

  const resetUserPreference = useCallback(() => {
    setUserPreference(null);
  }, [setUserPreference]);

  const shouldReduceMotion = useMemo(() => {
    if (userPreference === 'reduce') return true;
    if (userPreference === 'no-preference') return false;
    return systemReducedMotion;
  }, [systemReducedMotion, userPreference]);

  // Sincroniza la preferencia efectiva con `<html data-reduced-motion>` para que
  // las reglas CSS (animaciones, transiciones, scanlines del aurora, hovers que
  // dependen de transition-duration) también se enteren del toggle del sidebar.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (shouldReduceMotion) {
      root.setAttribute('data-reduced-motion', 'reduce');
    } else {
      root.removeAttribute('data-reduced-motion');
    }
  }, [shouldReduceMotion]);

  return {
    shouldReduceMotion,
    systemReducedMotion,
    userPreference,
    setUserPreference,
    resetUserPreference,
  };
}
