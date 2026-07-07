/* eslint-disable react-refresh/only-export-components -- patrón contexto: Provider + hook en el mismo archivo; solo afecta al HMR de dev */
/**
 * @fileoverview AtmosphereContext — atmósfera dinámica por contexto (T-954).
 *
 * Mantiene un atmosphereKey global (`default|geography|animals|colors|
 * numbers|shapes`) y lo aplica como atributo `data-atmosphere` en `<html>`.
 * Los componentes consumidores **NO** dependen del valor de React: leen
 * directamente las CSS vars `--color-atmosphere-*` definidas en `index.css`.
 * Por eso el provider es ligero — un solo setter + un único re-render
 * cuando el caller necesita saber la atmósfera activa (badge "estás en
 * Geografía", por ejemplo).
 *
 * Patrón equivalente al ThemeContext (View Transition API + data-attribute).
 *
 * @module context/AtmosphereContext
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const ATMOSPHERE_ATTRIBUTE = 'data-atmosphere';
const VALID_KEYS = new Set(['default', 'geography', 'animals', 'colors', 'numbers', 'shapes']);

const AtmosphereContext = createContext(null);

function normalizeKey(input) {
  if (!input || typeof input !== 'string') {
    return 'default';
  }
  const trimmed = input.trim().toLowerCase();
  if (VALID_KEYS.has(trimmed)) {
    return trimmed;
  }
  // Aliases comunes (slugs largos del contextoTheme.js).
  if (trimmed.startsWith('geography')) return 'geography';
  if (trimmed.startsWith('animals')) return 'animals';
  if (trimmed.startsWith('colors')) return 'colors';
  if (trimmed.startsWith('numbers')) return 'numbers';
  if (trimmed.startsWith('shapes')) return 'shapes';
  return 'default';
}

function applyAtmosphereAttribute(key) {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  if (key === 'default') {
    root.removeAttribute(ATMOSPHERE_ATTRIBUTE);
  } else {
    root.setAttribute(ATMOSPHERE_ATTRIBUTE, key);
  }
}

export function AtmosphereProvider({ children }) {
  const [atmosphereKey, setAtmosphereKey] = useState('default');
  const isFirstApplyRef = useRef(true);

  // Aplica el atributo cuando cambia la key. En el primer mount sólo
  // escribe el atributo si la key no es default (para no tocar el DOM
  // antes del primer paint sin necesidad).
  useEffect(() => {
    if (isFirstApplyRef.current && atmosphereKey === 'default') {
      isFirstApplyRef.current = false;
      return;
    }
    isFirstApplyRef.current = false;
    applyAtmosphereAttribute(atmosphereKey);
  }, [atmosphereKey]);

  const setAtmosphere = useCallback((input) => {
    const next = normalizeKey(input);
    setAtmosphereKey((prev) => (prev === next ? prev : next));
  }, []);

  const clearAtmosphere = useCallback(() => {
    setAtmosphereKey('default');
  }, []);

  const value = useMemo(
    () => ({
      atmosphereKey,
      isDefault: atmosphereKey === 'default',
      setAtmosphere,
      clearAtmosphere
    }),
    [atmosphereKey, setAtmosphere, clearAtmosphere]
  );

  return <AtmosphereContext.Provider value={value}>{children}</AtmosphereContext.Provider>;
}

AtmosphereProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export function useAtmosphere() {
  const ctx = useContext(AtmosphereContext);
  if (ctx === null) {
    // Devuelve un fallback no-op en lugar de throw para que componentes que
    // se rendericen fuera del provider (tests aislados, Login pre-auth) no
    // se rompan — sólo no reciben la atmósfera real.
    return {
      atmosphereKey: 'default',
      isDefault: true,
      setAtmosphere: () => {},
      clearAtmosphere: () => {}
    };
  }
  return ctx;
}

export default AtmosphereContext;
