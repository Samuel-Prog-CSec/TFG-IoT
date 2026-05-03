/**
 * @fileoverview Algoritmo de pistas progresivas para la mecánica Secuencia.
 *
 * En dificultad `easy`, tras cada fallo en una carta el sistema entrega una
 * pista al alumno. La primera pista es *parcial* (palabra con caracteres
 * ocultos por `?`), pensada para alumnos con lectura básica (7-8 años); la
 * segunda pista es *completa* (palabra entera). Tras el tercer fallo la
 * carta queda bloqueada y el cursor avanza a la siguiente posición.
 *
 * Decisión de UX (validada con el usuario): no regalar la respuesta en el
 * primer fallo. La pista parcial debe permitir al niño *inferir* la palabra
 * sin que se la den hecha — eso refuerza el aprendizaje.
 *
 * @module utils/sequenceHints
 */

const ACCENTED_VOWEL = /[áéíóúü]/i;
const HIDDEN_CHAR = '?';

/**
 * Devuelve `true` si el carácter es un espacio que se debe preservar tal cual
 * en la pista (espacios entre palabras, guiones).
 */
const isPreservedChar = char => char === ' ' || char === '-' || char === "'";

/**
 * Construye una pista parcial a partir de la palabra esperada.
 *
 * Algoritmo:
 * - Palabras vacías o de 1 carácter: se devuelven tal cual.
 * - Palabras de 2 caracteres: se muestra la primera; resto oculto.
 * - Palabras con vocales acentuadas: se muestra la primera letra y todas
 *   las vocales acentuadas; el resto se oculta. Ej. `León` → `L?ó?`,
 *   `Águila` → `Á????`.
 * - Palabras sin acentos: se muestra la primera letra y los caracteres en
 *   índices pares no finales (cada 2 chars). Ej. `Caballo` → `C?b?l?o`,
 *   `Tigre` → `T?g?e`. Mantiene una densidad útil sin regalar la palabra.
 * - Espacios y guiones se preservan para que palabras compuestas
 *   (`Oso polar` → `O?o ?o?ar`) sigan siendo legibles como composición.
 *
 * @param {string} word - Palabra esperada.
 * @returns {string} Pista parcial.
 */
function buildPartialHint(word) {
  if (word === undefined || word === null) {
    return '';
  }

  const text = String(word);
  if (text.length === 0) {
    return '';
  }

  if (text.length === 1) {
    return text;
  }

  const chars = [...text];
  const hasAccent = chars.some(char => ACCENTED_VOWEL.test(char));

  if (hasAccent) {
    return chars
      .map((char, index) => {
        if (isPreservedChar(char)) {
          return char;
        }
        if (index === 0) {
          return char;
        }
        if (ACCENTED_VOWEL.test(char)) {
          return char;
        }
        return HIDDEN_CHAR;
      })
      .join('');
  }

  return chars
    .map((char, index) => {
      if (isPreservedChar(char)) {
        return char;
      }
      if (index === 0 || index % 2 === 0) {
        return char;
      }
      return HIDDEN_CHAR;
    })
    .join('');
}

/**
 * Devuelve la pista completa para una palabra (la palabra tal cual). Existe
 * como helper simétrico a `buildPartialHint` para mantener consistencia en
 * los call-sites del strategy.
 *
 * @param {string} word - Palabra esperada.
 * @returns {string}
 */
function buildFullHint(word) {
  return word === undefined || word === null ? '' : String(word);
}

/**
 * Construye el payload de pista para el evento `sequence_card_result`.
 *
 * @param {'partial'|'full'} type - Nivel de pista.
 * @param {string} word - Palabra esperada.
 * @returns {{ type: string, text: string }}
 */
function buildHintPayload(type, word) {
  if (type === 'full') {
    return { type: 'full', text: buildFullHint(word) };
  }
  return { type: 'partial', text: buildPartialHint(word) };
}

module.exports = {
  buildPartialHint,
  buildFullHint,
  buildHintPayload
};
