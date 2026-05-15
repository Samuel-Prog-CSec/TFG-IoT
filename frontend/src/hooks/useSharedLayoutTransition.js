/**
 * @fileoverview useSharedLayoutTransition (T-954 Fase B).
 *
 * Genera un `layoutId` estable para los pares "card → detalle" que usan
 * el shared element transition de Framer Motion. El hook devuelve
 * `undefined` si la preferencia del usuario es `reduced-motion`: así la
 * animación de layout shared no se ejecuta y los pares caen a un fade
 * normal.
 *
 * Uso:
 *   const layoutId = useSharedLayoutTransition('deck', deck.id);
 *   <motion.div layoutId={layoutId} ... />
 *
 * @module hooks/useSharedLayoutTransition
 */

import { useReducedMotion } from './useReducedMotion';

/**
 * @param {string} kind - Etiqueta semántica ('deck', 'session', 'context').
 * @param {string|number|null|undefined} id - ID estable del recurso.
 * @returns {string|undefined}
 */
export function useSharedLayoutTransition(kind, id) {
  const { shouldReduceMotion } = useReducedMotion();
  if (shouldReduceMotion || !kind || id === null || id === undefined) {
    return undefined;
  }
  return `${kind}-${id}`;
}

/**
 * Helper puro (sin hooks) por si se necesita generar el id en un lugar
 * donde no se quiere depender del hook (ej. tests).
 *
 * @param {string} kind
 * @param {string|number} id
 * @returns {string}
 */
export function sharedLayoutId(kind, id) {
  return `${kind}-${id}`;
}

