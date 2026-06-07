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
 * - Directrices EDPB 01/2025 sobre seudonimización: técnicas válidas incluyen
 *   funciones hash CON CLAVE (HMAC) y truncamiento.
 *
 * Decisiones técnicas:
 * - HMAC-SHA256 con clave secreta del servidor (`PSEUDONYMIZE_SECRET`),
 *   truncado a 16 caracteres hexadecimales (64 bits efectivos; colisión
 *   despreciable — del orden de 5·10^9 ids por la paradoja del cumpleaños,
 *   muy por encima de cualquier escala realista del proyecto). El truncado a
 *   16 hex conserva como prefijo el de 8 hex previo (mismo HMAC), por lo que el
 *   cambio es compatible con pseudoIds ya almacenados.
 * - La CLAVE evita la re-identificación por fuerza bruta / rainbow table: sin
 *   el secreto, un atacante con acceso a los logs y al espacio de ObjectIds
 *   (enumerables) NO puede recomputar el pseudoId de un id candidato. Un
 *   SHA-256 SIN clave sí es recomputable → re-identificable desde los logs.
 * - Determinista para una misma clave: mismo id → mismo pseudoId, lo que
 *   permite correlacionar registros de distintas operaciones.
 * - Reversibilidad operativa preservada: el docente resuelve la identidad real
 *   vía el endpoint dedicado (que consulta la BD), NO invirtiendo el hash —
 *   coherente con el Art. 4.5 (la "información adicional" se mantiene separada).
 *   La clave refuerza la seudonimización sin afectar a esa reversibilidad.
 * - Fallback sin clave: si `PSEUDONYMIZE_SECRET` no está configurado, se degrada
 *   a SHA-256 sin clave para no romper respuestas. En producción la clave es
 *   OBLIGATORIA (ver `envValidator`), por lo que el fallback solo aplica en
 *   desarrollo/edge.
 *
 * @module utils/pseudonymize
 */

const crypto = require('node:crypto');

/** Longitud del pseudoId generado (caracteres hexadecimales) — 16 hex = 64 bits */
const PSEUDO_ID_LENGTH = 16;

/**
 * Genera un pseudoId determinista a partir de un identificador.
 *
 * @param {string|import('mongoose').Types.ObjectId|null|undefined} id - Identificador a seudonimizar
 * @returns {string|null} PseudoId de 16 caracteres hex, o null si el input es falsy
 *
 * @example
 * pseudonymize('507f1f77bcf86cd799439011') // => '<8 hex>' (HMAC con la clave del servidor)
 * pseudonymize(new ObjectId('507f1f77bcf86cd799439011')) // => mismo resultado (misma clave)
 * pseudonymize(null) // => null
 */
const pseudonymize = id => {
  if (!id) {
    return null;
  }

  const secret = process.env.PSEUDONYMIZE_SECRET;
  // HMAC con clave (recomputación imposible sin el secreto). Si no hay clave,
  // fallback a hash sin clave para no romper respuestas (prod la exige).
  const digest = secret
    ? crypto.createHmac('sha256', secret).update(String(id))
    : crypto.createHash('sha256').update(String(id));

  return digest.digest('hex').slice(0, PSEUDO_ID_LENGTH);
};

module.exports = { pseudonymize, PSEUDO_ID_LENGTH };
