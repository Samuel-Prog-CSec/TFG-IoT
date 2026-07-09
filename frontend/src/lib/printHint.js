/**
 * @fileoverview Pista de "imprimir cartas" para el detalle del mazo.
 * Tras crear o editar un mazo, se marca una pista por-mazo; la primera vez que se
 * abre su detalle, el botón de imprimir se resalta (parte del flujo "Ambos": el
 * profesor ve el CTA al terminar y también un recordatorio en el detalle).
 * @module lib/printHint
 */

const keyFor = deckId => `deck-print-hint-${deckId}`;

/**
 * Marca que el detalle del mazo debe resaltar el botón de imprimir la próxima vez.
 * @param {string} deckId
 */
export function setPrintHint(deckId) {
  if (!deckId) {
    return;
  }
  try {
    localStorage.setItem(keyFor(deckId), '1');
  } catch {
    // localStorage no disponible (modo privado): degradar silenciosamente.
  }
}

/**
 * Consume la pista: devuelve true una sola vez (y la elimina) si estaba marcada.
 * @param {string} deckId
 * @returns {boolean}
 */
export function consumePrintHint(deckId) {
  if (!deckId) {
    return false;
  }
  try {
    const key = keyFor(deckId);
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      return true;
    }
  } catch {
    // Ignorar
  }
  return false;
}
