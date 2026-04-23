/**
 * @fileoverview Contexto de feature flags evaluadas para el usuario actual.
 *
 * Hace fetch de `/api/me/flags` cuando el usuario está autenticado y cachea el
 * mapa en memoria. Expone `useFeatureFlag(name)` para consulta síncrona desde
 * cualquier componente. Fallback seguro: si el fetch falla o la flag no está
 * definida, devuelve `false` — convención "default off".
 *
 * @module context/FeatureFlagsContext
 */

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { featureFlagsAPI, extractData, isAbortError } from '../services/api';
import { useAuth } from './AuthContext';
import { captureException } from '../lib/sentry';

const FeatureFlagsContext = createContext({
  flags: {},
  isLoading: false,
  isReady: false,
  refresh: async () => {},
});

/**
 * Proveedor del contexto. Debe envolver la aplicación DESPUÉS de AuthProvider.
 */
export function FeatureFlagsProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [flags, setFlags] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const inFlightRef = useRef(null);

  const loadFlags = useCallback(async (signal) => {
    if (!isAuthenticated) {
      setFlags({});
      setIsReady(true);
      return;
    }

    setIsLoading(true);
    try {
      const response = await featureFlagsAPI.getMine({ signal });
      const data = extractData(response) || {};
      setFlags(data.flags || {});
      setIsReady(true);
    } catch (error) {
      if (isAbortError(error)) return;
      // Fallback silencioso: default OFF si /me/flags falla.
      // No reportamos a Sentry 401/403 porque pueden ocurrir durante logout.
      const status = error?.response?.status;
      if (status !== 401 && status !== 403) {
        captureException(error);
      }
      setFlags({});
      setIsReady(true);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const controller = new AbortController();
    inFlightRef.current?.abort?.();
    inFlightRef.current = controller;
    loadFlags(controller.signal);
    return () => {
      controller.abort();
    };
    // Re-fetch cuando cambia la identidad autenticada (login / logout / cambio de usuario).
  }, [loadFlags, user?.id]);

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    inFlightRef.current?.abort?.();
    inFlightRef.current = controller;
    await loadFlags(controller.signal);
  }, [loadFlags]);

  const value = useMemo(
    () => ({ flags, isLoading, isReady, refresh }),
    [flags, isLoading, isReady, refresh]
  );

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

FeatureFlagsProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

/**
 * Consulta síncrona de una feature flag.
 *
 * @param {string} name - Nombre de la flag.
 * @returns {boolean} `true` si la flag está activa para el usuario actual.
 *
 * @example
 * const leaderboardsEnabled = useFeatureFlag('leaderboardsZSet');
 * if (leaderboardsEnabled) {
 *   return <ZSetLeaderboards />;
 * }
 */
// eslint-disable-next-line react-refresh/only-export-components -- context + hook pattern
export function useFeatureFlag(name) {
  const ctx = useContext(FeatureFlagsContext);
  if (!ctx) {
    return false;
  }
  return Boolean(ctx.flags?.[name]);
}

/**
 * Acceso al mapa completo + función refresh. Útil en paneles admin.
 */
// eslint-disable-next-line react-refresh/only-export-components -- context + hook pattern
export function useFeatureFlagsContext() {
  const ctx = useContext(FeatureFlagsContext);
  if (!ctx) {
    throw new Error('useFeatureFlagsContext debe usarse dentro de un FeatureFlagsProvider');
  }
  return ctx;
}

export default FeatureFlagsContext;
