/**
 * @fileoverview Generador de planes de secuencia para la mecánica Secuencia.
 *
 * El plan se persiste en `GameSession.sequencePlan[]` al crear/editar la
 * sesión, igual que `boardLayout` (Memoria) y `associationChallengePlan`
 * (Asociación). Esto garantiza que todos los alumnos asignados a la sesión
 * jueguen las mismas secuencias y rondas (consistencia evaluativa).
 *
 * El generador admite una semilla opcional para tests deterministas.
 *
 * @module services/sequencePlanGenerator
 */

/**
 * Generador pseudo-aleatorio LCG (Linear Congruential Generator). Suficiente
 * para la aleatoriedad de gameplay (no es CSPRNG, pero no se necesita).
 * Permite tests deterministas pasando una semilla.
 *
 * @param {number} [seed]
 * @returns {() => number} Función que devuelve floats en `[0, 1)`.
 */
function createRng(seed) {
  if (seed === undefined || seed === null) {
    return Math.random;
  }
  let state = Number(seed) >>> 0 || 1;
  return () => {
    // Parámetros LCG (Numerical Recipes).
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const randomInt = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;

/**
 * Devuelve una copia barajada del array vía Fisher-Yates.
 *
 * @template T
 * @param {T[]} list
 * @param {() => number} rng
 * @returns {T[]}
 */
const shuffle = (list, rng) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Construye el plan de secuencias para una sesión.
 *
 * Cada ronda recibe una secuencia de longitud aleatoria entre `[minLength,
 * maxLength]`, formada por cartas distintas del mazo (sin repetición dentro
 * de la misma secuencia). Si el mazo no contiene suficientes cartas para
 * cubrir la longitud máxima, la secuencia se acorta al tamaño del mazo.
 *
 * @param {Array<{ uid: string, assignedValue: string, displayData?: object }>} cardMappings
 * @param {object} options
 * @param {number} options.numberOfRounds - Cantidad de rondas a generar.
 * @param {number} options.minLength - Longitud mínima de cada secuencia.
 * @param {number} options.maxLength - Longitud máxima de cada secuencia.
 * @param {number} [options.seed] - Semilla opcional para tests deterministas.
 * @returns {Array<{ roundNumber: number, length: number, sequence: object[] }>}
 */
function generateSequencePlan(cardMappings, options = {}) {
  const mappings = Array.isArray(cardMappings) ? cardMappings : [];
  const rounds = Number(options.numberOfRounds) || 0;
  const requestedMin = Number(options.minLength) || 3;
  const requestedMax = Number(options.maxLength) || requestedMin;

  if (mappings.length === 0 || rounds < 1) {
    return [];
  }

  const minLen = Math.max(1, Math.min(requestedMin, mappings.length));
  const maxLen = Math.max(minLen, Math.min(requestedMax, mappings.length));
  const rng = createRng(options.seed);

  const plan = [];
  for (let round = 1; round <= rounds; round += 1) {
    const length = randomInt(rng, minLen, maxLen);
    const sequence = shuffle(mappings, rng)
      .slice(0, length)
      .map(mapping => ({
        uid: mapping.uid,
        assignedValue: mapping.assignedValue,
        displayData: mapping.displayData ? { ...mapping.displayData } : {}
      }));
    plan.push({
      roundNumber: round,
      length: sequence.length,
      sequence
    });
  }

  return plan;
}

/**
 * Verifica que un plan existente sigue siendo válido para el mazo y la
 * configuración actuales. Útil al editar una sesión: si el profesor cambia
 * `numberOfRounds`, `minLength` o el mazo, el plan debe regenerarse.
 *
 * @param {Array} plan - Plan a validar.
 * @param {Array} cardMappings - Mazo actual.
 * @param {object} options - { numberOfRounds, minLength, maxLength }
 * @returns {boolean}
 */
function isPlanCompatible(plan, cardMappings, options = {}) {
  if (!Array.isArray(plan) || plan.length === 0) {
    return false;
  }

  const rounds = Number(options.numberOfRounds) || 0;
  if (plan.length !== rounds) {
    return false;
  }

  const mappings = Array.isArray(cardMappings) ? cardMappings : [];
  const validUids = new Set(mappings.map(mapping => mapping.uid));
  const minLen = Number(options.minLength) || 3;
  const maxLen = Number(options.maxLength) || minLen;

  return plan.every((round, index) => {
    if (Number(round.roundNumber) !== index + 1) {
      return false;
    }
    if (!Array.isArray(round.sequence) || round.sequence.length === 0) {
      return false;
    }
    const len = round.sequence.length;
    if (len < minLen || len > maxLen) {
      return false;
    }
    if (Number(round.length) !== len) {
      return false;
    }
    const uids = new Set();
    for (const item of round.sequence) {
      if (!validUids.has(item.uid)) {
        return false;
      }
      if (uids.has(item.uid)) {
        return false;
      }
      uids.add(item.uid);
    }
    return true;
  });
}

module.exports = {
  generateSequencePlan,
  isPlanCompatible
};
