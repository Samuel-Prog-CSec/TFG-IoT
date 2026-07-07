/**
 * @fileoverview Generador de planes de secuencia (frontend).
 *
 * Espejo del generador backend (`backend/src/services/sequencePlanGenerator.js`).
 * Se usa en el wizard para que el profesor pueda previsualizar el plan antes
 * de guardar y para que `Generar plan aleatorio` produzca resultados
 * inmediatos sin round-trip al servidor.
 *
 * El backend regenera el plan al crear/actualizar la sesión si detecta
 * incompatibilidad con el mazo (resilience), por lo que aquí no es crítico
 * usar la misma semilla que el backend; basta con producir un plan válido.
 */

const shuffle = (list, rng) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const randomInt = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;

export function generateSequencePlan(cardMappings, options = {}) {
  const mappings = Array.isArray(cardMappings) ? cardMappings : [];
  const rounds = Number(options.numberOfRounds) || 0;
  const requestedMin = Number(options.minLength) || 3;
  const requestedMax = Number(options.maxLength) || requestedMin;

  if (mappings.length === 0 || rounds < 1) return [];

  const minLen = Math.max(1, Math.min(requestedMin, mappings.length));
  const maxLen = Math.max(minLen, Math.min(requestedMax, mappings.length));
  const rng = Math.random;

  return Array.from({ length: rounds }, (_, index) => {
    const length = randomInt(rng, minLen, maxLen);
    const sequence = shuffle(mappings, rng)
      .slice(0, length)
      .map(mapping => ({
        uid: mapping.uid,
        assignedValue: mapping.assignedValue,
        displayData: mapping.displayData ? { ...mapping.displayData } : {}
      }));
    return { roundNumber: index + 1, length: sequence.length, sequence };
  });
}

