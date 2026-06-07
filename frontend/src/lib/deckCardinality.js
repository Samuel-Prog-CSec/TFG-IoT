/**
 * Validación de cardinalidad de recursos de un mazo (QA 2026-06-04).
 *
 * El backend (`cardDeckController.validateDeckMappingsStructure`) exige que la
 * distribución de valores asignados sea UNA de estas dos:
 *   - todos los valores aparecen exactamente 1 vez  → Asociación / Secuencia (1:1)
 *   - todos los valores aparecen exactamente 2 veces → Memoria (parejas)
 * Cualquier distribución "mixta" se rechaza con 400. Validamos en el frontend
 * ANTES de llamar al backend para dar un mensaje claro y no técnico en vez del
 * error del servidor (caso típico: añadir una carta de más a un mazo 1:1 y
 * reutilizar un recurso ya usado).
 *
 * @param {Array<{uid:string}>} selectedCards
 * @param {Object<string, {value?:string}>} cardAssignments - uid → recurso asignado
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateAssignmentCardinality(selectedCards, cardAssignments) {
  const counts = {};
  selectedCards.forEach((card) => {
    const value = cardAssignments[card.uid]?.value;
    if (value) counts[value] = (counts[value] || 0) + 1;
  });
  const tallies = Object.values(counts);
  if (tallies.length === 0) return { valid: true };

  const allUnique = tallies.every((n) => n === 1);
  const allPairs = tallies.every((n) => n === 2);
  if (allUnique || allPairs) return { valid: true };

  return {
    valid: false,
    reason:
      'Cada recurso debe usarse una sola vez (juego normal) o exactamente en parejas (para Memoria). ' +
      'Hay algún recurso repetido sin su pareja: asígnale un recurso distinto o completa todas las parejas.',
  };
}
