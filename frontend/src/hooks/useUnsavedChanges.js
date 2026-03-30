/**
 * @fileoverview Hook para proteger formularios con cambios no guardados.
 * Combina beforeunload (cierre de pestaña) con useBlocker de React Router
 * (navegación in-app) para prevenir pérdida de datos accidental.
 *
 * @module hooks/useUnsavedChanges
 */

import { useEffect, useCallback } from 'react';

/**
 * Protege un formulario contra navegación accidental cuando hay cambios sin guardar.
 * Usa beforeunload para proteger contra cierre de pestaña/refresh.
 *
 * NOTA: useBlocker de React Router 7 requiere Data Router (createBrowserRouter),
 * pero el proyecto usa BrowserRouter. Se desactiva useBlocker para evitar el crash
 * "useBlocker must be used within a DataRouter". La protección contra navegación
 * in-app queda pendiente para una futura migración a Data Router.
 *
 * @param {boolean} isDirty - Si el formulario tiene cambios sin guardar
 * @param {string} [message='Tienes cambios sin guardar. ¿Seguro que quieres salir?'] - Mensaje del diálogo
 * @returns {{ blocker: { state: string, proceed: Function, reset: Function }, isBlocked: boolean }}
 */
export function useUnsavedChanges(
  isDirty,
  message = 'Tienes cambios sin guardar. ¿Seguro que quieres salir?'
) {
  // Protección contra cierre de pestaña / refresh del navegador
  const handleBeforeUnload = useCallback(
    (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = message;
    },
    [isDirty, message]
  );

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  // Stub compatible: no bloquea navegación in-app pero no crashea
  const blocker = { state: 'idle', proceed: () => {}, reset: () => {} };
  const isBlocked = false;

  return { blocker, isBlocked };
}
