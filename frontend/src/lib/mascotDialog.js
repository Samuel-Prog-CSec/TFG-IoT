/**
 * @fileoverview Diccionario de diálogo de la mascota por mecánica × evento
 * × tier (ADR-D, sesión 04/05/2026).
 *
 * Hasta esta sesión la mascota usaba un único pool de frases definido
 * dentro del propio `CharacterMascot.jsx`, agnóstico a la mecánica del
 * juego. Ese pool decía exactamente lo mismo cuando el alumno acertaba
 * una pareja (Memoria), atinaba la respuesta (Asociación) o completaba
 * una secuencia (Secuencia) — perdía oportunidad pedagógica.
 *
 * Este módulo expone:
 *   - `MASCOT_DIALOG[mechanic][event]` — array de frases (`mood`-aware).
 *   - `pickMascotMessage(mechanic, event, tier?)` — función pura para
 *     seleccionar una frase aleatoria evitando repetir la última.
 *
 * El consumidor canónico es `useMascotReactions` (hook), que añade
 * cooldown entre eventos y mapea `event → mood`. Aquí solo vivimos las
 * frases. Reglas para añadir nuevas:
 *   - Vocabulario 4–6 años: corto, sin subordinadas, mayúsculas para
 *     celebracion. Evitar imperativos negativos crudos.
 *   - 4–8 frases por evento — suficiente variedad sin que se note el
 *     loop, pero pequeño para que no consuma bundle.
 *   - Sin emojis dentro del texto (la mascota ya tiene accesorios SVG;
 *     mezclar emojis en frases satura QA visual).
 *
 * @module lib/mascotDialog
 */

const MEMORY_DIALOG = Object.freeze({
  roundStart: ['¡A recordar!', '¿Lista para parejas?', '¡Concéntrate!', '¡Vamos!'],
  correctAnswer: [
    '¡Pareja!',
    '¡Lo recordaste!',
    '¡Memoria fina!',
    '¡Otro match!',
    '¡Genial!'
  ],
  errorAnswer: [
    'Mira otra vez',
    'Casi…',
    'Recuerda dónde está',
    '¡Tranqui!',
    '¡Siguiente!'
  ],
  // Balanceado a 3 frases (T-953 Fase 2.4): antes solo había 2,
  // saturando el loop visual cuando el alumno se quedaba en blanco.
  timeout: ['¡Inténtalo!', 'Sigue mirando…', 'Tu turno, ¡ánimo!'],
  streakReached: ['¡MEMORIA TOP!', '¡Imparable!', '¡Cerebro al 100%!', '¡Eres un crack!'],
  // T-953 Fase 2.4 — eventos nuevos:
  // - `streakBroken`: cuando una racha >=3 se rompe; mascota `surprised`.
  // - `worriedRebound`: tras 5+ errores sin acierto; mascota `worried`.
  // - `greeting`: primer saludo al montar la mascota en gameplay.
  streakBroken: ['¡Ay!', '¡Casi seguías!', 'Vuelves a empezar'],
  worriedRebound: ['Respira y mira', 'Vamos paso a paso', 'Un match cada vez'],
  greeting: ['¡Hola crack!', '¿Listo para parejas?', '¡Vamos a recordar!'],
  gameOverHigh: ['¡INCREÍBLE!', '¡MEMORIA DE ELEFANTE!', '¡PERFECTO!'],
  gameOverMid: ['¡Muy bien!', '¡Sigue así!', '¡Buen trabajo!'],
  gameOverLow: ['Otra y mejorarás', 'No te rindas', 'La práctica suma']
});

const ASSOCIATION_DIALOG = Object.freeze({
  roundStart: ['¡A asociar!', '¿Cuál será?', '¡Buscando!', '¡Atento!'],
  correctAnswer: [
    '¡Esa es!',
    '¡Bien asociado!',
    '¡Crack!',
    '¡Eso es!',
    '¡Genial!'
  ],
  // No incluir frases que prometan "pista": en Asociación NO hay sistema de
  // pistas (eso solo existe en Secuencia con dificultad fácil). La frase
  // "Lee la pista" se eliminó tras QA 2026-05-06: prometía algo que la
  // mecánica no entrega y rompía la confianza del alumno con la mascota.
  errorAnswer: [
    'Fíjate bien',
    'Casi…',
    'Otra es',
    '¡Tranqui!',
    'Mira de nuevo'
  ],
  timeout: ['¡A elegir!', '¡Decídete!', '¿Cuál es?'],
  streakReached: ['¡CONEXIÓN TOTAL!', '¡IMPARABLE!', '¡Genio!', '¡Tú mandas!'],
  streakBroken: ['¡Casi seguías!', 'Vuelve a conectar', '¡Otra ronda!'],
  worriedRebound: ['Respira, hay tiempo', 'Mira con calma', 'Una a una'],
  greeting: ['¡Hola crack!', '¿Listo para asociar?', '¡A conectar!'],
  gameOverHigh: ['¡INCREÍBLE!', '¡CONEXIÓN PERFECTA!', '¡ERES UN GENIO!'],
  gameOverMid: ['¡Muy bien!', '¡Sigue así!', '¡Vas creciendo!'],
  gameOverLow: ['Otra y mejorarás', 'No te rindas', 'A practicar']
});

const SEQUENCE_DIALOG = Object.freeze({
  roundStart: ['¡Memoriza!', '¿Listo?', '¡Atento al orden!', '¡Vamos!'],
  correctAnswer: [
    '¡Sigue!',
    '¡Vas perfecto!',
    '¡Otro paso!',
    '¡Esa es!',
    '¡Genial!'
  ],
  errorAnswer: [
    'Recuerda el orden',
    'Casi…',
    '¡Tranqui!',
    'Otra ronda',
    'Mira otra vez'
  ],
  timeout: ['¡Tu turno!', '¡Reproduce!', '¡Vamos!'],
  streakReached: ['¡SIGUES EL RITMO!', '¡SECUENCIA EPICA!', '¡Imparable!', '¡Tú mandas!'],
  streakBroken: ['¡Vaya!', 'Se rompió el ritmo', 'A retomar el compás'],
  worriedRebound: ['Respira, escucha', 'Una a una', 'Recupera el orden'],
  greeting: ['¡Hola crack!', '¿Listo para el ritmo?', '¡Vamos a memorizar!'],
  gameOverHigh: ['¡SECUENCIA PERFECTA!', '¡INCREÍBLE!', '¡RITMO TOTAL!'],
  gameOverMid: ['¡Muy bien!', '¡Cada vez mejor!', '¡Buen trabajo!'],
  gameOverLow: ['Otra y mejorarás', 'No te rindas', 'La práctica suma']
});

export const MASCOT_DIALOG = Object.freeze({
  memory: MEMORY_DIALOG,
  association: ASSOCIATION_DIALOG,
  sequence: SEQUENCE_DIALOG
});

const FALLBACK_DIALOG = MEMORY_DIALOG;

const VALID_TIERS = new Set(['high', 'mid', 'low']);

/**
 * Selecciona una frase aleatoria del pool correspondiente a (mechanic,
 * event), opcionalmente afinada por tier para `gameOver`. Es una función
 * pura — el consumidor (hook) gestiona el estado de "última frase" para
 * evitar repeticiones consecutivas.
 *
 * @param {string} mechanic - 'memory' | 'association' | 'sequence'
 * @param {string} event    - Una clave de event ('roundStart', 'correctAnswer', …)
 * @param {string} [tier]   - Solo aplica a `gameOver`: 'high' | 'mid' | 'low'.
 * @param {number} [seed]   - Semilla numérica (test-friendly). Si se omite,
 *                            usa Math.random().
 * @returns {string|null} La frase elegida, o `null` si no hay pool.
 */
export function pickMascotMessage(mechanic, event, tier, seed) {
  const dialog = MASCOT_DIALOG[mechanic] || FALLBACK_DIALOG;
  const resolvedEvent = event === 'gameOver' && VALID_TIERS.has(tier)
    ? `gameOver${tier.charAt(0).toUpperCase()}${tier.slice(1)}`
    : event;
  const pool = dialog[resolvedEvent];
  if (!Array.isArray(pool) || pool.length === 0) {
    return null;
  }
  if (pool.length === 1) {
    return pool[0];
  }
  const random =
    typeof seed === 'number' && Number.isFinite(seed)
      ? Math.abs(seed) % pool.length
      : // eslint-disable-next-line sonarjs/pseudo-random -- selección visual de mensaje, no requiere CSPRNG
        Math.floor(Math.random() * pool.length);
  return pool[random];
}

