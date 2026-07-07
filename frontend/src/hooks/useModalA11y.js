import { useEffect } from 'react';

/**
 * Accesibilidad de modales custom: foco inicial, focus-trap por Tab,
 * cierre con Escape, bloqueo de scroll del body y restauracion del foco
 * al cerrar. Centraliza el patron que ya implementa `ConfirmationModal`
 * para reutilizarlo en dialogos hand-rolled sin duplicar la logica
 * (evita ademas el `sonarjs/no-identical-functions` entre modales gemelos).
 *
 * @param {Object} opts
 * @param {boolean} opts.isOpen - Si el modal esta visible.
 * @param {() => void} opts.onClose - Callback de cierre (se invoca con Escape).
 * @param {import('react').RefObject<HTMLElement>} opts.panelRef - Contenedor del dialogo (limite del focus-trap).
 * @param {import('react').RefObject<HTMLElement>} [opts.initialFocusRef] - Elemento a enfocar al abrir.
 * @param {boolean} [opts.escapeDisabled=false] - Si es true, Escape no cierra (p.ej. durante un envio en curso).
 */
export default function useModalA11y({
  isOpen,
  onClose,
  panelRef,
  initialFocusRef,
  escapeDisabled = false,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const previousActiveElement = document.activeElement;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => initialFocusRef?.current?.focus(), 50);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !escapeDisabled) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previousActiveElement?.focus?.();
    };
  }, [isOpen, escapeDisabled, onClose, panelRef, initialFocusRef]);
}
