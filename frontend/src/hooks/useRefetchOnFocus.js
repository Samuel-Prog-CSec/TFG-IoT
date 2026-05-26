import { useEffect, useRef } from 'react';

/**
 * Hook para reintentar cargas al recuperar foco o visibilidad.
 * Evita pantallas vacias si una peticion se cancela por navegacion rapida.
 *
 * @param {Object} options
 * @param {Function} options.refetch - Funcion de recarga
 * @param {boolean} [options.enabled=true] - Activar o no el reintento
 * @param {boolean} [options.isLoading=false] - Estado de carga actual
 * @param {boolean} [options.hasData=false] - Indica si hay datos visibles
 * @param {boolean} [options.hasError=false] - Indica si hay error
 * @param {number} [options.minIntervalMs=1500] - Minimo entre reintentos
 */
export function useRefetchOnFocus({
  refetch,
  enabled = true,
  isLoading = false,
  hasData = false,
  hasError = false,
  minIntervalMs = 1500
}) {
  const lastRunRef = useRef(0);

  // (D-10-B3) `isLoading`, `hasData` y `hasError` cambian en cada ciclo de
  // fetch (varias veces por segundo en dashboards con polling). Si entran en
  // las deps del effect, el listener se reinstala-quita en cada cambio,
  // generando un churn observable en DevTools Performance (sin ser leak: el
  // cleanup limpia bien). Las leemos por ref para que el effect solo se
  // re-ejecute si cambia `refetch`/`enabled`/`minIntervalMs` — el resto se
  // consulta JIT cuando dispara focus/visibilitychange.
  const stateRef = useRef({ isLoading, hasData, hasError });
  stateRef.current = { isLoading, hasData, hasError };

  useEffect(() => {
    if (!enabled || typeof refetch !== 'function') {
      return undefined;
    }

    const shouldRefetch = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') {
        return false;
      }
      const { isLoading: nowLoading, hasData: nowData, hasError: nowError } = stateRef.current;
      if (nowLoading) {
        return false;
      }
      if (nowData && !nowError) {
        return false;
      }
      const now = Date.now();
      if (now - lastRunRef.current < minIntervalMs) {
        return false;
      }
      lastRunRef.current = now;
      return true;
    };

    const handleFocus = () => {
      if (shouldRefetch()) {
        refetch();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [enabled, refetch, minIntervalMs]);
}

