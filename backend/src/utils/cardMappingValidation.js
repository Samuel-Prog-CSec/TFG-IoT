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

/**
 * Reconstruye el `displayData` de cada mapeo desde el asset REAL del contexto
 * (emparejando por `value`), descartando cualquier URL/campo que venga del
 * cliente. `displayData` era `z.any()` en el schema, así que un cliente podía
 * inyectar URLs arbitrarias (imageUrl/audioUrl) que luego se pintan a menores
 * vía <img>/<Audio>. Al derivar las URLs server-side desde el contexto ya
 * validado, cerramos la inyección y además evitamos el drift (el snapshot del
 * mazo siempre refleja el asset del contexto). Devuelve un array NUEVO de
 * objetos planos (no muta el original ni subdocumentos Mongoose).
 *
 * Debe llamarse DESPUÉS de `assertAssignedValuesInContext` (garantiza que cada
 * assignedValue tiene asset correspondiente).
 *
 * @param {Array<{uid: string, assignedValue: string}>} cardMappings
 * @param {{assets?: Array<Object>}} context - Contexto ya cargado.
 * @returns {Array<Object>} Mapeos con displayData server-authoritative.
 */
function rebuildDisplayDataFromContext(cardMappings, context) {
  const assetByValue = new Map((context.assets || []).map(a => [a.value, a]));
  return cardMappings.map(mapping => {
    const asset = assetByValue.get(mapping.assignedValue);
    const displayData = asset
      ? {
          key: asset.key || '',
          value: asset.value,
          display: asset.display || '',
          imageUrl: asset.imageUrl || null,
          thumbnailUrl: asset.thumbnailUrl || null,
          audioUrl: asset.audioUrl || null,
          dominantColor: asset.dominantColor || null
        }
      : {};
    return {
      uid: mapping.uid,
      assignedValue: mapping.assignedValue,
      displayData
    };
  });
}

module.exports = { assertAssignedValuesInContext, rebuildDisplayDataFromContext };
