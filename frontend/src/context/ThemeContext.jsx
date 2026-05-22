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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { THEME_STORAGE_KEY, THEME_MODES, META_THEME_COLOR } from '../constants/theme';

const ThemeContext = createContext(null);

const REDUCED_MOTION_STORAGE_KEY = 'eduplay:reduced-motion';
const FALLBACK_TRANSITION_MS = 280;
// Mínimo tiempo que `isTogglingRef` permanece levantado tras un toggleTheme,
// incluso si el View Transition resuelve antes. Suprime triple-tap rápido.
const MIN_LOCK_MS = 350;

/**
 * Lectura síncrona de la preferencia de reduced-motion para uso fuera de
 * hooks (toggleTheme se llama desde atajos de teclado). Replica la lógica
 * del hook `useReducedMotion`: preferencia explícita del usuario en
 * localStorage > preferencia del sistema operativo. Si el documento no
 * está disponible (SSR), por defecto no se reduce el motion.
 */
function readReducedMotionPreference() {
  try {
    const stored = globalThis.localStorage?.getItem(REDUCED_MOTION_STORAGE_KEY);
    if (stored === 'reduce') return true;
    if (stored === 'no-preference') return false;
  } catch {
    // localStorage puede estar deshabilitado (modo privado Safari). Caemos al
    // valor del sistema sin interrumpir el toggle.
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.matchMedia === 'function') {
    return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return false;
}

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
  // Guard de re-entrada para `toggleTheme`. React 19 StrictMode en dev monta
  // los efectos dos veces, lo que puede provocar que un `keydown` se
  // procese por dos listeners superpuestos durante un instante; sin este
  // ref, cada Shift+T dispararía dos `startViewTransition` simultáneos.
  // El ref se levanta antes de programar la transición y se baja en cuanto
  // ésta termina (o tras 350ms si el navegador no soporta promesa
  // `finished`). En producción no aplica StrictMode y es un no-op.
  const isTogglingRef = useRef(false);

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

  /**
   * Alterna entre claro y oscuro. El atajo `Shift+T` y el toggle visual lo
   * usan indistintamente. Si el modo actual es `auto`, salta al opuesto del
   * tema resuelto — así un clic siempre produce un cambio visible.
   *
   * Camino preferido: View Transition API (Chrome/Edge ≥111, Safari ≥18).
   * Genera un cross-fade nativo entre snapshots del DOM (CSS en
   * `index.css` controla la duración y easing). Camino fallback: aplica el
   * atributo `data-theme-switching` durante 280ms para que la transición
   * CSS expandida (bg/color/border/fill/stroke) cubra el cambio sin
   * fogonazo. Si el usuario tiene `prefers-reduced-motion: reduce`, no se
   * dispara ninguna animación — sólo se cambia el tema.
   */
  const toggleTheme = useCallback(() => {
    // Guard: si una transición está en curso, ignorar nuevas llamadas. Esto
    // suprime el double-fire de React StrictMode (dev) y evita que un
    // usuario que mantiene pulsado Shift+T encadene transiciones solapadas.
    if (isTogglingRef.current) return;
    isTogglingRef.current = true;
    // P0-7 plan auditoría Sprint 6: además del guard binario, garantizamos
    // un "minimum hold" de MIN_LOCK_MS para que un triple-tap rápido (Shift+T
    // pulsado 3 veces en 400ms) no encadene transiciones aunque el View
    // Transition haya resuelto `finished` antes — caso real en páginas
    // ligeras (Login/Register) donde el fade nativo apenas tarda 200ms.
    const lockStartedAt = Date.now();

    const nextTheme = resolvedTheme === 'light' ? 'dark' : 'light';
    // El callback del View Transition es síncrono y el navegador necesita
    // el DOM ya actualizado para capturar el "next snapshot". Si solo
    // hacemos `setMode(nextTheme)`, React programa el re-render
    // asíncronamente y la VT API se queda esperando que React commitee
    // — en páginas pesadas (Dashboard) esto añade ~1s de "freeze"
    // antes de que el cross-fade visible empiece.
    //
    // Aplicamos el atributo `data-theme` y la meta theme-color
    // SÍNCRONAMENTE dentro del callback (las CSS vars resuelven
    // inmediatamente, no requieren re-render de React). El `setMode`
    // sigue ejecutándose para sincronizar el state de los consumidores
    // de `useTheme()` (ThemeToggle, ThemeAwareToaster), pero ya no es
    // bloqueante para la animación.
    const apply = () => {
      applyThemeAttribute(nextTheme);
      setMode(nextTheme);
    };
    const release = () => {
      isTogglingRef.current = false;
    };
    // Garantiza que el ref se mantiene levantado al menos MIN_LOCK_MS antes
    // de soltarse. Si la transición termina antes (fade nativo rápido),
    // posponemos el release hasta cumplir el mínimo.
    const releaseRespectingMinHold = () => {
      const elapsed = Date.now() - lockStartedAt;
      if (elapsed >= MIN_LOCK_MS) {
        release();
        return;
      }
      globalThis.setTimeout(release, MIN_LOCK_MS - elapsed);
    };

    const reduceMotion = readReducedMotionPreference();

    if (typeof document === 'undefined' || reduceMotion) {
      apply();
      releaseRespectingMinHold();
      return;
    }

    if (typeof document.startViewTransition === 'function') {
      // El navegador captura snapshot antes/después y cross-fadea según el
      // CSS de ::view-transition-old/new(root) declarado en index.css.
      const transition = document.startViewTransition(apply);
      // `finished` resuelve cuando la animación termina o se cancela. Soltamos
      // el lock respetando MIN_LOCK_MS; si por alguna razón nunca resuelve
      // (caso patológico), un timer de seguridad libera a los 650ms.
      transition.finished.then(releaseRespectingMinHold, releaseRespectingMinHold);
      globalThis.setTimeout(release, 650);
      return;
    }

    // Fallback CSS para Firefox y Safari <18: marca el documento con
    // `data-theme-switching` para que la regla en index.css active una
    // transition expandida (background-color/color/border-color/fill/stroke).
    const root = document.documentElement;
    root.dataset.themeSwitching = '';
    apply();
    globalThis.setTimeout(() => {
      delete root.dataset.themeSwitching;
      releaseRespectingMinHold();
    }, FALLBACK_TRANSITION_MS);
  }, [resolvedTheme, setMode]);

  const value = useMemo(
    () => ({
      mode,
      resolvedTheme,
      systemPrefersLight,
      setMode,
      toggleTheme,
      isLight: resolvedTheme === 'light',
      isDark: resolvedTheme === 'dark',
    }),
    [mode, resolvedTheme, systemPrefersLight, setMode, toggleTheme],
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
