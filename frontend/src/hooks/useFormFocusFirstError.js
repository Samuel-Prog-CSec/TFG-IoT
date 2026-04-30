import { useEffect, useRef } from 'react';

/**
 * useFormFocusFirstError
 *
 * Hook de accesibilidad (WCAG 3.3.1 + Material Design focus management) que,
 * al cambiar el objeto `errors`, localiza el primer elemento con
 * `aria-invalid="true"` dentro del formulario y le transfiere el foco.
 * Ayuda a profesores usando lector de pantalla o navegando por teclado a
 * corregir formularios sin tener que buscar visualmente el primer campo
 * invalido.
 *
 * Uso:
 *   const formRef = useFormFocusFirstError(validationErrors);
 *   return <form ref={formRef} onSubmit={handleSubmit}>...</form>;
 *
 * @param {Object<string, any>} errors - Objeto de errores de validación.
 *   Solo se consideran claves con valor truthy.
 * @returns {React.MutableRefObject<HTMLFormElement | null>} Ref que se engancha al form.
 */
export function useFormFocusFirstError(errors) {
  const formRef = useRef(null);
  const lastFocusedSignature = useRef('');

  useEffect(() => {
    if (!errors || typeof errors !== 'object') return undefined;

    const activeErrorKeys = Object.entries(errors)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key)
      .sort((a, b) => a.localeCompare(b));

    if (activeErrorKeys.length === 0) {
      lastFocusedSignature.current = '';
      return undefined;
    }

    const signature = activeErrorKeys.join('|');
    if (signature === lastFocusedSignature.current) return undefined;
    lastFocusedSignature.current = signature;

    // Esperamos al siguiente frame para que aria-invalid se refleje en el DOM.
    const rafId = window.requestAnimationFrame(() => {
      const container = formRef.current;
      if (!container) return;
      const firstInvalid = container.querySelector('[aria-invalid="true"]');
      if (firstInvalid && typeof firstInvalid.focus === 'function') {
        firstInvalid.focus({ preventScroll: false });
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [errors]);

  return formRef;
}

export default useFormFocusFirstError;
