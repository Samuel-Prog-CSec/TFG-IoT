/**
 * @fileoverview Hook para proteger formularios con cambios no guardados.
 *
 * Combina `beforeunload` (cierre de pestaña, refresh) con un helper
 * `confirmExit(callback)` que abre un `ConfirmationModal` (variant warning)
 * cuando el usuario intenta una navegación in-app programática
 * (`navigate()`, click en un botón "Volver" / "Cancelar" / "X").
 *
 * NOTA SOBRE LA COBERTURA: `useBlocker` de React Router 7 requiere un
 * Data Router (`createBrowserRouter`), pero el proyecto usa el
 * `BrowserRouter` clásico — usarlo crashea con "useBlocker must be used
 * within a DataRouter". Mientras no migremos a Data Router (PROP futura),
 * el blocker queda como stub y la cobertura efectiva es:
 *
 * - ✅ Refresh y cierre de pestaña (`beforeunload`)
 * - ✅ Navegación programática que pasa por `confirmExit(callback)`
 *      (botones "Volver", "Cancelar", "X", cerrar wizard, etc.)
 * - ❌ Click en un `<Link>` / `<NavLink>` del sidebar o breadcrumb
 *      (no se intercepta — requiere Data Router para bloquear sin envolver
 *      manualmente cada Link)
 *
 * @module hooks/useUnsavedChanges
 */

import { useCallback, useEffect } from 'react';
import { useConfirmationModal } from '../components/ui/ConfirmationModal';

/**
 * Protege un formulario contra navegación accidental cuando hay cambios
 * sin guardar.
 *
 * @param {boolean} isDirty - Si el formulario tiene cambios sin guardar.
 * @param {string} [message] - Mensaje del diálogo nativo (beforeunload) y
 *   default del modal in-app.
 * @returns {{
 *   blocker: { state: 'idle', proceed: Function, reset: Function },
 *   isBlocked: false,
 *   confirmExit: (callback: Function, options?: Object) => void,
 *   confirmExitModalProps: Object
 * }}
 *
 * @example
 * const { confirmExit, confirmExitModalProps } = useUnsavedChanges(isDirty);
 *
 * // En el JSX:
 * <ConfirmationModal {...confirmExitModalProps} />
 *
 * // En el handler:
 * const handleBack = () => confirmExit(() => navigate(ROUTES.LIST));
 */
export function useUnsavedChanges(
  isDirty,
  message = 'Tienes cambios sin guardar. ¿Seguro que quieres salir?'
) {
  // ============================================
  // Protección beforeunload (cierre / refresh)
  // ============================================
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

  // ============================================
  // T-957: confirmación in-app vía ConfirmationModal
  // ============================================
  const confirmModal = useConfirmationModal();

  /**
   * Si no hay cambios, ejecuta el callback inmediatamente. Si los hay,
   * abre un `ConfirmationModal` warning; el callback solo se invoca tras
   * confirmar. El modal se cierra automáticamente en ambos casos (lo
   * gestiona `useConfirmationModal`).
   *
   * @param {Function} callback - Acción a ejecutar si el usuario confirma
   *   (típicamente `() => navigate(ROUTES.X)`).
   * @param {Object} [options] - Personalización opcional del modal:
   *   `{ title, description, confirmText, cancelText, variant }`.
   */
  const confirmExit = useCallback(
    (callback, options = {}) => {
      if (typeof callback !== 'function') return;
      if (!isDirty) {
        callback();
        return;
      }
      confirmModal.openModal({
        title: options.title || 'Cambios sin guardar',
        description: options.description || message,
        variant: options.variant || 'warning',
        confirmText: options.confirmText || 'Salir sin guardar',
        cancelText: options.cancelText || 'Seguir editando',
        onConfirm: callback,
      });
    },
    [isDirty, message, confirmModal]
  );

  // Stub compatible: no bloquea navegación in-app por <Link> pero no crashea.
  const blocker = { state: 'idle', proceed: () => {}, reset: () => {} };
  const isBlocked = false;

  return {
    blocker,
    isBlocked,
    confirmExit,
    confirmExitModalProps: confirmModal.modalProps,
  };
}
