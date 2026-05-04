/**
 * @fileoverview Microcopy contextual del GameOver por mecánica × tier
 * (ADR-F, sesión 04/05/2026).
 *
 * Antes esta sesión, GameOverScreen mostraba 4 frases fijas para todas
 * las mecánicas:
 *   - 3⭐ "¡INCREÍBLE!" / "¡Eres un crack!"
 *   - 2⭐ "¡MUY BIEN!"  / "¡Sigue así!"
 *   - 1⭐ "¡BUEN INTENTO!" / "¡Vas por buen camino!"
 *   - 0⭐ "¡NO TE RINDAS!" / "¡La práctica hace al maestro!"
 *
 * Este módulo extrae esa lógica y le añade variantes por mecánica para
 * que un 3⭐ en Memoria diga "¡Memoria de elefante!" mientras que un
 * 3⭐ en Secuencia diga "¡Sigues el ritmo!". Esto cumple el spirit del
 * ADR-D (mascota viva): la pantalla de cierre sigue el mismo idioma
 * pedagógico que la mascota usa durante la partida.
 *
 * Uso:
 *   const { title, subtitle } = getGameOverCopy(stars, mechanicMode);
 *
 * @module lib/gameOverCopy
 */

const FALLBACK_COPY = Object.freeze({
  3: { title: '¡INCREÍBLE!', subtitle: '¡Eres un crack!' },
  2: { title: '¡MUY BIEN!', subtitle: '¡Sigue así!' },
  1: { title: '¡BUEN INTENTO!', subtitle: '¡Vas por buen camino!' },
  0: { title: '¡NO TE RINDAS!', subtitle: '¡La práctica hace al maestro!' }
});

const MEMORY_COPY = Object.freeze({
  3: { title: '¡MEMORIA DE ELEFANTE!', subtitle: '¡Lo recordaste todo!' },
  2: { title: '¡MEMORIA AFINADA!', subtitle: '¡Cada vez mejor!' },
  1: { title: '¡BUEN PRINCIPIO!', subtitle: 'La práctica te hará un crack' },
  0: { title: '¡NO TE RINDAS!', subtitle: 'Recuerda dónde estaba cada carta' }
});

const ASSOCIATION_COPY = Object.freeze({
  3: { title: '¡CONEXIÓN PERFECTA!', subtitle: '¡Eres un genio!' },
  2: { title: '¡MUY BIEN ASOCIADO!', subtitle: '¡Sigue conectando!' },
  1: { title: '¡BUEN INTENTO!', subtitle: 'Lee la pista con calma' },
  0: { title: '¡NO TE RINDAS!', subtitle: 'Cada error enseña algo' }
});

const SEQUENCE_COPY = Object.freeze({
  3: { title: '¡SIGUES EL RITMO!', subtitle: '¡Secuencia perfecta!' },
  2: { title: '¡BUEN ORDEN!', subtitle: '¡Casi lo bordas!' },
  1: { title: '¡BUEN INTENTO!', subtitle: 'Memoriza la secuencia paso a paso' },
  0: { title: '¡NO TE RINDAS!', subtitle: 'La memoria mejora con la práctica' }
});

const COPY_BY_MECHANIC = Object.freeze({
  memory: MEMORY_COPY,
  association: ASSOCIATION_COPY,
  sequence: SEQUENCE_COPY
});

const VALID_STAR_COUNTS = new Set([0, 1, 2, 3]);

/**
 * Devuelve el copy contextual del GameOver según estrellas y mecánica.
 *
 * @param {number} stars     - 0–3 estrellas calculadas en cliente.
 * @param {string} mechanic  - 'memory' | 'association' | 'sequence'.
 * @returns {{title: string, subtitle: string}}
 */
export function getGameOverCopy(stars, mechanic) {
  const safeStars = VALID_STAR_COUNTS.has(stars) ? stars : 0;
  const dictionary = COPY_BY_MECHANIC[mechanic] || FALLBACK_COPY;
  return dictionary[safeStars] || FALLBACK_COPY[safeStars];
}

export const COPY_FALLBACK = FALLBACK_COPY;

export default getGameOverCopy;
