/**
 * @fileoverview Hook de onboarding interactivo (T-951 PROP-13).
 *
 * Diferencias con la versión 0.5.0:
 *  - Multi-track: detecta el rol del usuario autenticado (`teacher` /
 *    `super_admin`) y selecciona el tour correspondiente.
 *  - Persistencia mixta: hidrata desde `user.profile.onboarding` (backend)
 *    y propaga cada paso con un PATCH a `/api/users/me/onboarding`. Esto
 *    permite que el progreso sobreviva al cambio de dispositivo.
 *  - Migración legacy: si el flag `localStorage['eduplay:onboarding-completed']`
 *    existe (instalaciones < 0.5.0), marcamos `teacherCompleted: true`
 *    en backend y borramos el flag local — el tour no vuelve a aparecer.
 *  - Bug fix: el hook arranca desde `useEffect` después de tener `user`,
 *    no en estado inicial — antes el flag se evaluaba antes de que llegara
 *    `user` y siempre tomaba el camino "no completado".
 *
 * El hook NO conoce el contenido de los pasos. Eso vive en
 * `frontend/src/constants/onboardingTracks.js` (Fase 4) y el componente
 * que renderiza el tour decide qué mostrar para `currentStep`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usersAPI } from '../services/api';

// Helper local de logging — el frontend no tiene Pino y el CLAUDE.md
// prohíbe console.log/error en producción. console.warn está permitido
// para fallos no críticos (la app sigue funcionando si la sync falla).
const warnOnboarding = (message, error) => {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`[onboarding] ${message}`, error);
  }
};

const LEGACY_STORAGE_KEY = 'eduplay:onboarding-completed';
const SYNC_DEBOUNCE_MS = 500;

/**
 * Determina el track de onboarding según el rol del usuario.
 */
function trackForRole(role) {
  if (role === 'super_admin') return 'super_admin';
  if (role === 'teacher') return 'teacher';
  return null;
}

/**
 * Lee el estado inicial del onboarding desde el `user` autenticado.
 * Si el usuario está cargando o no tiene rol válido, devuelve null.
 */
function readInitialState(user) {
  if (!user) return null;
  const track = trackForRole(user.role);
  if (!track) return null;
  const onboarding = user.profile?.onboarding ?? {};
  const completedFlag = track === 'teacher' ? 'teacherCompleted' : 'superAdminCompleted';
  return {
    track,
    completed: !!onboarding[completedFlag],
    currentStep: onboarding.currentStep ?? 0,
  };
}

export function useOnboarding({ totalSteps = 0 } = {}) {
  const { user, isLoading } = useAuth();

  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [track, setTrack] = useState(null);
  const [hasCompleted, setHasCompleted] = useState(false);

  const initializedRef = useRef(false);
  const syncTimerRef = useRef(null);

  // Inicialización única tras tener `user` disponible. Evita el bug del
  // hook anterior (estado inicial leía localStorage antes de tener user).
  useEffect(() => {
    if (isLoading || !user || initializedRef.current) return;
    initializedRef.current = true;

    const initial = readInitialState(user);
    if (!initial) return;

    setTrack(initial.track);
    setHasCompleted(initial.completed);
    setCurrentStep(initial.completed ? 0 : initial.currentStep);

    // Migración del flag legacy. Si la app < 0.5.0 había marcado
    // localmente el onboarding como completado y el backend aún no lo
    // refleja, hacemos PATCH para sincronizar y borramos el flag local.
    let legacyFlag = null;
    try {
      legacyFlag = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    } catch {
      // Sin localStorage (Safari modo privado) — no hay nada que migrar.
    }

    if (legacyFlag === 'true' && !initial.completed && initial.track === 'teacher') {
      usersAPI
        .updateMyOnboarding({ teacherCompleted: true })
        .then(() => {
          try {
            window.localStorage.removeItem(LEGACY_STORAGE_KEY);
          } catch {
            // Ignorar — el backend ya tiene el estado correcto.
          }
          setHasCompleted(true);
          setIsVisible(false);
          return null;
        })
        .catch((error) => {
          warnOnboarding('migración legacy falló', error);
        });
      return;
    }

    // Si nunca lo completó, mostramos el tour.
    if (!initial.completed) {
      setIsVisible(true);
    }
  }, [user, isLoading]);

  // Sincroniza el paso actual con el backend (debounced 500ms para evitar
  // un PATCH por click). El último paso disparado en la ventana gana.
  const scheduleSync = useCallback((payload) => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = setTimeout(() => {
      usersAPI
        .updateMyOnboarding(payload)
        .catch((error) => warnOnboarding('sync paso falló', error));
    }, SYNC_DEBOUNCE_MS);
  }, []);

  useEffect(() => () => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
  }, []);

  // El efecto secundario (scheduleSync) se hace FUERA del updater de setState:
  // los updaters deben ser puros y en StrictMode se invocan dos veces, lo que
  // dispararía el sync por duplicado. Calcular `next` a partir de `currentStep`
  // (estado, fresco en cada render) mantiene el handler puro y determinista para
  // un click de la barra del tour.
  const nextStep = useCallback(() => {
    const next = currentStep + 1;
    setCurrentStep(next);
    if (track) {
      scheduleSync({ currentStep: next, currentTrack: track });
    }
  }, [currentStep, track, scheduleSync]);

  const prevStep = useCallback(() => {
    const next = Math.max(0, currentStep - 1);
    setCurrentStep(next);
    if (track) {
      scheduleSync({ currentStep: next, currentTrack: track });
    }
  }, [currentStep, track, scheduleSync]);

  const completeOnboarding = useCallback(() => {
    setIsVisible(false);
    setHasCompleted(true);
    if (!track) return;
    const payload = {
      currentStep: 0,
      currentTrack: null,
      ...(track === 'teacher'
        ? { teacherCompleted: true }
        : { superAdminCompleted: true }),
    };
    usersAPI.updateMyOnboarding(payload).catch((error) => {
      warnOnboarding('complete falló', error);
    });
  }, [track]);

  const skipOnboarding = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);

  // Permite al usuario reanudar el tour desde el sidebar (botón
  // "Ver tutorial"). Resetea el paso a 0 y vuelve a mostrar el overlay
  // sin tocar `hasCompleted` — el tour ya completado puede repetirse.
  const resetOnboarding = useCallback(() => {
    if (!track) return;
    setCurrentStep(0);
    setIsVisible(true);
    scheduleSync({ currentStep: 0, currentTrack: track });
  }, [track, scheduleSync]);

  return {
    isVisible,
    currentStep,
    totalSteps,
    track,
    hasCompleted,
    nextStep,
    prevStep,
    completeOnboarding,
    skipOnboarding,
    resetOnboarding,
  };
}
