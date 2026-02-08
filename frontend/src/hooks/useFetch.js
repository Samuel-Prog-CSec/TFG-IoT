import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Estados de la petición
 * @typedef {'idle' | 'loading' | 'success' | 'error'} FetchStatus
 */

/**
 * Hook genérico para fetch de datos
 * 
 * @template T
 * @param {Function} fetchFn - Función que retorna una Promise con los datos
 * @param {Object} options
 * @param {boolean} options.immediate - Si ejecutar inmediatamente (default: true)
 * @param {any[]} options.dependencies - Dependencias para re-fetch
 * @param {Function} options.onSuccess - Callback en éxito
 * @param {Function} options.onError - Callback en error
 */
export function useFetch(fetchFn, options = {}) {
  const { 
    immediate = true, 
    dependencies = [],
    onSuccess,
    onError 
  } = options;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('idle');
  
  const mountedRef = useRef(true);
  const fetchFnRef = useRef(fetchFn);

  // Mantener ref actualizada
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  // Marcar como desmontado al unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async (...args) => {
    setStatus('loading');
    setError(null);

    try {
      const result = await fetchFnRef.current(...args);
      
      if (mountedRef.current) {
        setData(result);
        setStatus('success');
        onSuccess?.(result);
      }
      
      return result;
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        setStatus('error');
        onError?.(err);
      }
      throw err;
    }
  }, [onSuccess, onError]);

  // Fetch inicial si immediate es true
  useEffect(() => {
    if (immediate) {
      execute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate, ...dependencies]);

  const refetch = useCallback(() => execute(), [execute]);

  return {
    data,
    error,
    status,
    isLoading: status === 'loading',
    isError: status === 'error',
    isSuccess: status === 'success',
    isIdle: status === 'idle',
    execute,
    refetch,
  };
}

export default useFetch;
