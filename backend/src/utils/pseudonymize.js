/**
 * @fileoverview Utilidad de seudonimización para datos de menores.
 *
 * Genera identificadores pseudónimos deterministas a partir de ObjectIds,
 * permitiendo correlacionar registros en logs y analytics sin exponer
 * datos identificativos directos de los estudiantes.
 *
 * Fundamentación normativa:
 * - Art. 25 RGPD: Protección de datos desde el diseño y por defecto.
 * - Art. 4.5 RGPD: Definición de seudonimización.
 * - Directrices EDPB 01/2025 sobre seudonimización: técnicas válidas
 *   incluyen funciones hash con sal y truncamiento.
 *
 * Decisiones técnicas:
 * - SHA-256 truncado a 8 caracteres hexadecimales (32 bits efectivos).
 * - Determinista: mismo ID siempre produce el mismo pseudoId,
 *   permitiendo correlación entre logs de distintas operaciones.
 * - 4.294.967.296 combinaciones posibles: suficiente para escala de aula
 *   (riesgo de colisión negligible en grupos de < 10.000 estudiantes).
 * - Sin salt externo: la seudonimización es reversible con acceso al
 *   sistema (el profesor puede resolver la identidad vía endpoint dedicado).
 *   Esto es intencional: el Art. 4.5 RGPD contempla que la información
 *   adicional se mantenga separada, no que sea irrecuperable.
 *
 * @module utils/pseudonymize
 */

const crypto = require('node:crypto');

/** Longitud del pseudoId generado (caracteres hexadecimales) */
const PSEUDO_ID_LENGTH = 8;

/**
 * Genera un pseudoId determinista a partir de un identificador.
 *
 * @param {string|import('mongoose').Types.ObjectId|null|undefined} id - Identificador a seudonimizar
 * @returns {string|null} PseudoId de 8 caracteres hex, o null si el input es falsy
 *
 * @example
 * pseudonymize('507f1f77bcf86cd799439011') // => 'a1b2c3d4'
 * pseudonymize(new ObjectId('507f1f77bcf86cd799439011')) // => 'a1b2c3d4' (mismo resultado)
 * pseudonymize(null) // => null
 */
const pseudonymize = id => {
  if (!id) {
    return null;
  }

  return crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, PSEUDO_ID_LENGTH);
};

module.exports = { pseudonymize, PSEUDO_ID_LENGTH };
