/**
 * @fileoverview Hook para edición inline con autosave debounced
 * (T-952 Fase C).
 *
 * Encapsula el patrón "click → editar → blur/Enter → guardar":
 *  - El consumidor pasa el `value` externo (string), un `onSave(value)`
 *    asíncrono y una función opcional `validate(value) => null | string`
 *    (devuelve mensaje de error o null si válido).
 *  - El hook gestiona el draft local, isEditing, isSaving, error.
 *  - `commit()` valida y dispara `onSave`. Si todo OK, vuelve a no-edit;
 *    si error, muestra el mensaje y deja el draft abierto para corregir.
 *  - `cancel()` descarta el draft y vuelve al valor externo.
 *  - `start()` entra en modo edición copiando el valor actual al draft.
 *
 * Diseñado para usarse desde `<InlineEditableText>` pero también
 * directamente si el consumidor quiere un control UI custom.
 *
 * @module hooks/useInlineEdit
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @typedef {Object} UseInlineEditOptions
 * @property {string} value — Valor externo (fuente de verdad).
 * @property {(value: string) => Promise<void> | void} onSave
 * @property {(value: string) => string | null} [validate]
 * @property {number} [debounceMs=800] — Debounce para autosave al
 *   escribir. Si es 0, no hay autosave (solo guarda al commit explícito).
 * @property {boolean} [autosave=true] — Si true, llama a `onSave`
 *   automáticamente al pasar el debounce. Si false, solo guarda al
 *   commit explícito (blur/Enter).
 *
 * @returns {{
 *   draft: string,
 *   isEditing: boolean,
 *   isSaving: boolean,
 *   error: string|null,
 *   start: () => void,
 *   cancel: () => void,
 *   commit: () => Promise<boolean>,
 *   setDraft: (value: string) => void,
 * }}
 */
export function useInlineEdit({
  value,
  onSave,
  validate,
  debounceMs = 800,
  autosave = true,
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const validateRef = useRef(validate);
  validateRef.current = validate;
  const debounceRef = useRef(null);

  // Sincroniza draft con value externo cuando NO se está editando.
  // Si el usuario está editando, NO sobrescribimos su input.
  useEffect(() => {
    if (!isEditing) setDraft(value ?? '');
  }, [value, isEditing]);

  const start = useCallback(() => {
    setDraft(value ?? '');
    setError(null);
    setIsEditing(true);
  }, [value]);

  const cancel = useCallback(() => {
    if (debounceRef.current) {
      globalThis.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setDraft(value ?? '');
    setError(null);
    setIsEditing(false);
  }, [value]);

  const performSave = useCallback(
    async (nextValue) => {
      const fn = validateRef.current;
      const validationError = typeof fn === 'function' ? fn(nextValue) : null;
      if (validationError) {
        setError(validationError);
        return false;
      }
      if (nextValue === value) {
        setError(null);
        setIsEditing(false);
        return true;
      }
      setIsSaving(true);
      setError(null);
      try {
        await onSaveRef.current?.(nextValue);
        setIsSaving(false);
        setIsEditing(false);
        return true;
      } catch (err) {
        setIsSaving(false);
        setError(err?.message || 'No se pudo guardar el cambio. Inténtalo de nuevo.');
        return false;
      }
    },
    [value],
  );

  const commit = useCallback(() => performSave(draft), [draft, performSave]);

  // Autosave debounced: cuando el draft cambia y autosave=true, programa
  // un commit pasado el delay. Si el usuario sigue escribiendo, se
  // reinicia el temporizador.
  //
  // Importante: NO programamos autosave si `draft === value`. Sin este
  // guard, al entrar a editar (draft=value inicial), el efecto programa
  // un performSave que detecta "sin cambios" y cierra el editor a los
  // 800ms sin que el usuario haya escrito nada (bug detectado en QA T-952).
  useEffect(() => {
    if (!autosave || !isEditing) return undefined;
    if (debounceMs <= 0) return undefined;
    if (draft === value) return undefined;
    if (debounceRef.current) globalThis.clearTimeout(debounceRef.current);
    debounceRef.current = globalThis.setTimeout(() => {
      performSave(draft);
    }, debounceMs);
    return () => {
      if (debounceRef.current) {
        globalThis.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
    // performSave incluye `value` en deps; lo omitimos aquí porque el
    // estado deseado es "guardar el draft actual tras pausa", no
    // re-armar el timer al cambiar value externo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, value, autosave, debounceMs, isEditing]);

  return {
    draft,
    isEditing,
    isSaving,
    error,
    start,
    cancel,
    commit,
    setDraft,
  };
}

