/**
 * @fileoverview Implementación de FNV-1a de 32-bit para hashing determinístico.
 *
 * Se usa para el cálculo de rollouts por porcentaje en el sistema de feature flags:
 * dado un userId y un rolloutPct, el mismo usuario siempre cae en el mismo bucket
 * (0-99), garantizando consistencia entre reconexiones y entre instancias del backend.
 *
 * @module utils/fnv1a
 */

const FNV_OFFSET_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

/**
 * Calcula el hash FNV-1a de 32-bit de un string.
 * Determinístico: el mismo input siempre produce el mismo output.
 *
 * @param {string} input - String a hashear (típicamente un userId).
 * @returns {number} Hash entero sin signo en rango [0, 2^32 - 1].
 */
const fnv1a32 = input => {
  if (typeof input !== 'string') {
    input = String(input);
  }

  let hash = FNV_OFFSET_32;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiplicación con FNV_PRIME manteniéndolo en 32-bit (usando imul para velocidad)
    hash = Math.imul(hash, FNV_PRIME_32);
  }
  // Convertir a entero sin signo
  return hash >>> 0;
};

/**
 * Devuelve un bucket [0, 99] estable para un input dado.
 * Se usa para decidir si un usuario entra en un rollout parcial.
 *
 * @param {string} input - Input a mapear.
 * @returns {number} Entero en [0, 99].
 */
const bucketPct = input => fnv1a32(input) % 100;

module.exports = {
  fnv1a32,
  bucketPct
};
