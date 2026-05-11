/**
 * @fileoverview Hook de atajos de teclado globales (T-951 Fase 5).
 *
 * Características:
 *  - Soporta atajos simples (`Shift+?`, `Esc`) y chords (`g s` → "ir a
 *    sesiones") con buffer interno y timeout entre teclas.
 *  - Guard automático: si el foco está dentro de un input, textarea,
 *    contenteditable o select, NO se disparan los atajos. El usuario que
 *    escribe "g d" en un input no quiere navegar al Dashboard.
 *  - Acepta una lista de definiciones; cada una con `key` (string como
 *    'Shift+?', 'Escape', 'g d') y `handler` (función) y opcional
 *    `description` (para el overlay de ayuda).
 *
 * No incluye `aria-keyshortcuts` automático en los nodos — los atajos
 * son globales y se documentan en el overlay accesible vía `Shift+?`.
 */
import { useEffect, useRef } from 'react';

const CHORD_TIMEOUT_MS = 1500;

/**
 * Determina si el evento ocurrió en un campo de entrada de texto. En ese
 * caso, no disparamos atajos globales para no interferir con la
 * escritura del usuario.
 */
function isTypingTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return !!target.closest(
    'input, textarea, select, [contenteditable="true"], [role="textbox"]',
  );
}

/**
 * Normaliza una combinación a la forma canónica usada en `key`.
 *
 * Casos cubiertos:
 *   - Letras sin Shift: lowercase. `g` → `'g'`.
 *   - Letras con Shift: UPPERCASE preservado. `Shift+T` → `'Shift+T'`.
 *   - Caracteres especiales con Shift (?, /, etc.): el carácter ya viene
 *     shifteado, prefijamos `Shift+` para forma canónica explícita.
 *     `Shift+?` → `'Shift+?'`.
 *   - Combinaciones con otros modificadores se prefijan como
 *     `Ctrl+`, `Meta+`, `Alt+`.
 *
 * Bug histórico corregido en T-952: la versión anterior NO añadía
 * `Shift+` cuando la tecla era una letra, lo que hacía que atajos como
 * `Shift+T` o `Shift+N` quedaran canonical = `'t'` / `'n'` y nunca
 * se disparaban. La regla ahora distingue letras (que ya cambian de
 * caso con Shift, así que NO bajamos a minúscula) de caracteres
 * especiales.
 */
function eventToCanonical(event) {
  // Tecla principal — preferimos `event.key` (representación lógica del
  // carácter, ya respeta el layout del teclado).
  let { key } = event;
  if (!key) return null;

  const isLetter = /^[a-zA-Z]$/.test(key);
  // Si es una letra SIN shift, normalizamos a minúscula para que el
  // canonical sea estable (`'g'` independientemente de Caps Lock). Si hay
  // Shift, preservamos la mayúscula que ya viene de event.key para que el
  // canonical termine como `'Shift+T'` y no `'Shift+t'`.
  if (isLetter && !event.shiftKey) key = key.toLowerCase();

  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.metaKey) parts.push('Meta');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(key);

  return parts.join('+');
}

/**
 * Hook genérico de atajos.
 *
 * @param {Array<{ key: string, handler: function, description?: string, allowInInput?: boolean }>} shortcuts
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true] — deshabilita el hook (útil cuando un modal está abierto).
 */
export function useKeyboardShortcuts(shortcuts, { enabled = true } = {}) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const chordBufferRef = useRef('');
  const chordTimerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event) => {
      const inTyping = isTypingTarget(event.target);

      const canonical = eventToCanonical(event);
      if (!canonical) return;

      const list = shortcutsRef.current ?? [];

      // Match directo: Shift+?, Escape, etc. Atajos con `allowInInput`
      // sí se disparan dentro de inputs (e.g. Esc para cerrar dialog).
      const direct = list.find((s) => s.key === canonical);
      if (direct && (!inTyping || direct.allowInInput)) {
        event.preventDefault();
        direct.handler(event);
        chordBufferRef.current = '';
        return;
      }

      // Chord matching (e.g. `g s`). Solo letras solas sin modificadores.
      const isPlainLetter =
        /^[a-z]$/.test(event.key) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey;

      if (isPlainLetter && !inTyping) {
        const buffer = (chordBufferRef.current + event.key).slice(-3);
        const candidate = list.find((s) => {
          if (!s.key.includes(' ')) return false;
          return s.key === `${buffer.charAt(0)} ${buffer.charAt(1)}`;
        });
        if (candidate) {
          event.preventDefault();
          candidate.handler(event);
          chordBufferRef.current = '';
          if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
          return;
        }
        // Inicia/extiende el buffer y reinicia el timeout.
        chordBufferRef.current = buffer;
        if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
        chordTimerRef.current = setTimeout(() => {
          chordBufferRef.current = '';
        }, CHORD_TIMEOUT_MS);
        return;
      }

      // Cualquier otra tecla rompe el chord en curso.
      chordBufferRef.current = '';
      if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
    };
  }, [enabled]);
}
