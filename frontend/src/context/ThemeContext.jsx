/**
 * @fileoverview Contexto de tema (claro / oscuro / auto).
 *
 * El tema "auto" sigue la preferencia del sistema operativo del usuario
 * via `matchMedia('(prefers-color-scheme: light)')`. Es importante en
 * centros donde varios profesores comparten ordenador y heredan el
 * ajuste de visualización del aula (T-951 Fase 1).
 *
 * El tema resuelto se aplica como atributo `data-theme="light|dark"` en
 * `<html>` y la meta theme-color se actualiza dinámicamente para que la
 * UI del navegador (barra de direcciones en mobile, status bar PWA) se
 * adapte. Persistencia en `localStorage['eduplay:theme']`.
 *
 * El bloque `<script>` inline de `index.html` aplica el atributo antes
 * del primer paint (FOUC < 50ms). Aquí solo se sincroniza el estado
 * React con esa fuente de verdad.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { THEME_STORAGE_KEY, THEME_MODES, META_THEME_COLOR } from '../constants/theme';

const ThemeContext = createContext(null);

/**
 * Resuelve el tema efectivo desde un modo + la preferencia del sistema.
 * Idéntica lógica al script inline de index.html — si cambias una
 * cambia la otra.
 */
function resolveTheme(mode, systemPrefersLight) {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return systemPrefersLight ? 'light' : 'dark';
}

function readStoredMode() {
  if (typeof window === 'undefined') return 'auto';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_MODES.includes(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

function readSystemPrefersLight() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

function applyThemeAttribute(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', META_THEME_COLOR[theme] ?? META_THEME_COLOR.dark);
  }
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readStoredMode);
  const [systemPrefersLight, setSystemPrefersLight] = useState(readSystemPrefersLight);

  const resolvedTheme = useMemo(
    () => resolveTheme(mode, systemPrefersLight),
    [mode, systemPrefersLight],
  );

  // Sincroniza el atributo data-theme y la meta theme-color cuando cambia
  // el tema resuelto. El script inline del index.html ya lo aplicó al
  // boot — esto cubre los cambios posteriores (toggle del usuario o
  // cambio del SO).
  useEffect(() => {
    applyThemeAttribute(resolvedTheme);
  }, [resolvedTheme]);

  // Listener del SO para el modo "auto". Cambiar el tema del sistema
  // mientras la app está abierta se refleja sin recargar.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (event) => setSystemPrefersLight(event.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    // Safari < 14 fallback
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  const setMode = useCallback((nextMode) => {
    if (!THEME_MODES.includes(nextMode)) {
      // No usamos console.error en producción — fallar silenciosamente
      // y dejar el modo previo es más seguro para UX.
      return;
    }
    setModeState(nextMode);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    } catch {
      // localStorage puede estar deshabilitado (modo privado Safari).
      // El modo en memoria sigue funcionando para esta sesión.
    }
  }, []);

  const value = useMemo(
    () => ({
      mode,
      resolvedTheme,
      systemPrefersLight,
      setMode,
      isLight: resolvedTheme === 'light',
      isDark: resolvedTheme === 'dark',
    }),
    [mode, resolvedTheme, systemPrefersLight, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  }
  return ctx;
}
