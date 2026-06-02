/**
 * @fileoverview useInlineSuccess — micro-feedback inline tras éxito (T-955).
 *
 * Devuelve `{ visible, trigger() }`. Llamar a `trigger()` muestra el badge
 * y lo oculta automáticamente tras `duration` ms (default 2000). Cancela
 * cualquier timer anterior, así que doble-click no provoca flicker.
 *
 * Coexiste con Sonner toast: el toast queda reservado para errores y
 * destructivos confirmados; los success habituales son inline donde el
 * usuario acaba de actuar (junto al botón Save).
 *
 * @module hooks/useInlineSuccess
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION = 2000;

export function useInlineSuccess({ duration = DEFAULT_DURATION } = {}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  // Guard de desmontaje: evita que setTimeout llame `setVisible(false)`
  // tras el unmount (React loggea warning y, en particular, evita estado
  // stuck en true tras desmonte → re-monte rápido en StrictMode dev).
  const isMountedRef = useRef(true);

  const trigger = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(true);
    timerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setVisible(false);
      }
      timerRef.current = null;
    }, duration);
  }, [duration]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { visible, trigger };
}

export default useInlineSuccess;
