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
  const abortControllerRef = useRef(null);

  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async (...args) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    setStatus('loading');
    setError(null);

    try {
      const result = await fetchFnRef.current(...args, { signal });

      if (!signal.aborted && mountedRef.current) {
        setData(result);
        setStatus('success');
        onSuccessRef.current?.(result);
      }

      return result;
    } catch (err) {
      if (signal.aborted) return;
      if (mountedRef.current) {
        setError(err);
        setStatus('error');
        onErrorRef.current?.(err);
      }
      throw err;
    }
  }, []);

  const dependenciesKey = JSON.stringify(dependencies);

  useEffect(() => {
    if (immediate) {
      execute();
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [immediate, dependenciesKey, execute]);

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
