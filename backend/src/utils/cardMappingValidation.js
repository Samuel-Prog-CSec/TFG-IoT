/**
 * @fileoverview Validación compartida de mapeos de tarjetas contra un contexto.
 */

const { ValidationError } = require('./errors');

/**
 * Verifica que todos los `assignedValue` de los mapeos existan entre los assets
 * del contexto (comparando por `value`). Fuente ÚNICA compartida por la creación
 * de mazos (`cardDeckController`) y la sincronización de sesiones desde mazo
 * (`gameSessionService.syncSessionFromDeck`); antes era código byte-idéntico
 * duplicado en ambos sitios, con riesgo de drift.
 *
 * @param {Array<{assignedValue: string}>} cardMappings
 * @param {{assets?: Array<{value: string}>}} context - Contexto ya cargado.
 * @throws {ValidationError} si algún `assignedValue` no pertenece al contexto.
 */
function assertAssignedValuesInContext(cardMappings, context) {
  const allowedValues = new Set((context.assets || []).map(a => a.value));
  const invalidValues = cardMappings.map(m => m.assignedValue).filter(v => !allowedValues.has(v));
  if (invalidValues.length > 0) {
    throw new ValidationError(
      `assignedValue no existe en los assets del contexto: ${[...new Set(invalidValues)].join(', ')}`
    );
  }
}

module.exports = { assertAssignedValuesInContext };
