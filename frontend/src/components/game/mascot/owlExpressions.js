/**
 * @fileoverview Tabla declarativa de expresiones de Otto (la mascota búho).
 *
 * Cada `mood` es DATOS, no JSX: describe qué variante de cada capa de la
 * cara dibujar (ojos, cejas, pico, mejillas), hacia dónde mira (pupila),
 * qué alas usar, qué props acompañan y qué animación corporal reproduce.
 * `owlParts.jsx` consume esta tabla y dibuja el rig. La geometría canónica
 * de cada estado vive en `docs/plans/mascota-owl-model-sheet.html`.
 *
 * Diseño de personaje "Otto" (mentor cálido y juguetón): el cuerpo es
 * índigo fijo (identidad de marca); el acento de mecánica solo tiñe el
 * halo. El error (`sad`/`worried`/`surprised`) se resuelve SIEMPRE en
 * clave amable, nunca punitiva — público objetivo 4-8 años.
 *
 * @module components/game/mascot/owlExpressions
 */

/**
 * @typedef {Object} OwlExpression
 * @property {'open'|'wide'|'narrow'|'closedSmile'|'droopy'} eyes  Variante de ojo.
 * @property {{x:number,y:number}} pupil  Desplazamiento de mirada (en unidades del viewBox 200x215).
 * @property {'calm'|'soft'|'raised'|'curious'|'high'|'tense'|'sad'} brows  Forma de cejas.
 * @property {'closed'|'closedSmall'|'openSmile'|'openSmileSmall'|'openO'} beak  Forma del pico.
 * @property {boolean} cheeks  Mostrar rubor en las mejillas.
 * @property {'rest'|'pointing'|'pompom'} wings  Postura de las alas.
 * @property {string[]} props  Props decorativos (sparkle, stars, thoughtCloud, pomPoms, arrow, sweatDrop, tear, exclaim).
 * @property {'float'|'bounce'|'jump'|'nod'|'tilt'|'sway'|'wobble'|'pop'|'point'} body  Variante de animación corporal.
 * @property {'mechanic'|'success'|'warning'|'warningSoft'|'brand'|'error'|'pink'} glow  Familia de color del halo.
 */

/** @type {Record<string, OwlExpression>} */
export const EXPRESSIONS = Object.freeze({
  idle: {
    eyes: 'open', pupil: { x: 0, y: 0 }, brows: 'calm', beak: 'closed',
    cheeks: false, wings: 'rest', props: [], body: 'float', glow: 'mechanic'
  },
  happy: {
    eyes: 'closedSmile', pupil: { x: 0, y: 0 }, brows: 'soft', beak: 'closedSmall',
    cheeks: true, wings: 'rest', props: ['sparkle'], body: 'bounce', glow: 'success'
  },
  celebrating: {
    eyes: 'wide', pupil: { x: 0, y: -2 }, brows: 'raised', beak: 'openSmile',
    cheeks: true, wings: 'rest', props: ['stars'], body: 'jump', glow: 'warning'
  },
  thinking: {
    eyes: 'open', pupil: { x: 7, y: -4 }, brows: 'curious', beak: 'closed',
    cheeks: false, wings: 'rest', props: ['thoughtCloud'], body: 'tilt', glow: 'mechanic'
  },
  encouraging: {
    eyes: 'open', pupil: { x: 0, y: -1 }, brows: 'raised', beak: 'openSmileSmall',
    cheeks: true, wings: 'pompom', props: ['pomPoms'], body: 'nod', glow: 'brand'
  },
  pointing: {
    eyes: 'open', pupil: { x: 9, y: 1 }, brows: 'soft', beak: 'openSmileSmall',
    cheeks: false, wings: 'pointing', props: ['arrow'], body: 'point', glow: 'mechanic'
  },
  surprised: {
    eyes: 'wide', pupil: { x: 0, y: 0 }, brows: 'high', beak: 'openO',
    cheeks: false, wings: 'rest', props: ['exclaim'], body: 'pop', glow: 'pink'
  },
  worried: {
    eyes: 'narrow', pupil: { x: 0, y: 1 }, brows: 'tense', beak: 'closedSmall',
    cheeks: false, wings: 'rest', props: ['sweatDrop'], body: 'wobble', glow: 'error'
  },
  sad: {
    eyes: 'droopy', pupil: { x: 0, y: 2 }, brows: 'sad', beak: 'closedSmall',
    cheeks: false, wings: 'rest', props: ['tear'], body: 'sway', glow: 'warningSoft'
  }
});

/** Moods válidos (orden estable para tests y storybook futuros). */
export const OWL_MOODS = Object.freeze([
  'idle', 'happy', 'celebrating', 'thinking', 'encouraging',
  'pointing', 'surprised', 'worried', 'sad'
]);

/**
 * Mapa mood → familia de animación corporal. Extraído de la tabla para que
 * `CharacterMascot` resuelva la variante sin importar toda la expresión.
 * @param {string} mood
 * @returns {string}
 */
export function bodyAnimFor(mood) {
  return (EXPRESSIONS[mood] || EXPRESSIONS.idle).body;
}
