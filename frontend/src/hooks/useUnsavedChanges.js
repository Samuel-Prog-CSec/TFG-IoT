/**
 * @fileoverview Hook para proteger formularios con cambios no guardados.
 * Combina beforeunload (cierre de pestaña) con useBlocker de React Router
 * (navegación in-app) para prevenir pérdida de datos accidental.
 *
 * @module hooks/useUnsavedChanges
 */

import { useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Protege un formulario contra navegación accidental cuando hay cambios sin guardar.
 *
 * @param {boolean} isDirty - Si el formulario tiene cambios sin guardar
 * @param {string} [message='Tienes cambios sin guardar. ¿Seguro que quieres salir?'] - Mensaje del diálogo
 * @returns {{ blocker: import('react-router-dom').Blocker, isBlocked: boolean }}
 *
 * @example
 * const { blocker, isBlocked } = useUnsavedChanges(formIsDirty);
 *
 * // Renderizar modal de confirmación cuando isBlocked === true
 * <ConfirmationModal
 *   open={isBlocked}
 *   onConfirm={() => blocker.proceed()}
 *   onClose={() => blocker.reset()}
 *   title="Cambios sin guardar"
 *   description="Tienes cambios sin guardar. ¿Seguro que quieres salir?"
 *   variant="warning"
 *   confirmText="Salir sin guardar"
 *   cancelText="Seguir editando"
 * />
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
      // Navegadores modernos ignoran el mensaje personalizado pero requieren returnValue
      e.returnValue = message;
    },
    [isDirty, message]
  );

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  // Protección contra navegación in-app (React Router)
  const blocker = useBlocker(isDirty);
  const isBlocked = blocker.state === 'blocked';

  return { blocker, isBlocked };
}
