/**
 * @fileoverview Códigos de error y razones estables del pipeline RFID.
 *
 * Centralizar estos valores evita strings mágicos dispersos por el backend
 * y permite a la UI ofrecer feedback granular ("Sensor no responde" vs
 * "Tarjeta no registrada" vs "Tarjeta fuera de la sesión") consumiendo
 * las mismas constantes vía contrato documentado.
 *
 * Los VALORES de las constantes NO deben cambiar tras el primer despliegue
 * — son contrato público que el frontend serializa en switches/maps de
 * mensajes UI. Si hace falta deprecar uno, añadir uno nuevo y mantener
 * el viejo durante una versión.
 *
 * @module constants/errorCodes
 */

/**
 * Códigos de error RFID emitidos por el servidor en eventos `error`.
 * Cada valor identifica una situación accionable distinta para el cliente.
 */
const RFID_ERROR_CODES = Object.freeze({
  /** El servicio RFID está deshabilitado por configuración del servidor. */
  SENSOR_DISABLED: 'RFID_DISABLED',
  /** El sensor declarado por el cliente no coincide con el ligado al modo. */
  SENSOR_MISMATCH: 'RFID_SENSOR_MISMATCH',
  /** El sensorId del payload no está autorizado para esta sesión. */
  SENSOR_UNAUTHORIZED: 'RFID_SENSOR_UNAUTHORIZED',
  /** Otro socket del mismo usuario tomó el control del modo RFID. */
  MODE_TAKEN_OVER: 'RFID_MODE_TAKEN_OVER',
  /** El modo solicitado no es válido o no coincide con el room actual. */
  MODE_INVALID: 'RFID_MODE_INVALID',
  /** El socket no está marcado como dueño activo del modo. */
  SOCKET_NOT_ACTIVE: 'RFID_SOCKET_NOT_ACTIVE'
});

/**
 * Razones del evento `scan_ignored` (servidor → cliente).
 * Estos VALORES son consumidos por el frontend para UI feedback diferenciado.
 *
 * - `play_paused`: la partida está pausada; el scan se descarta sin penalizar.
 * - `not_awaiting_response`: scan llegó entre rondas, sin respuesta esperada.
 * - `card_not_in_play`: el UID está mapeado a la partida pero no encontrado
 *   en `uidToMapping` (estado interno desincronizado, no debería ocurrir).
 * - `uid_unknown`: el UID no está mapeado a ninguna partida activa
 *   (tarjeta desconocida o de otra sesión).
 */
const SCAN_IGNORED_REASONS = Object.freeze({
  PLAY_PAUSED: 'play_paused',
  NOT_AWAITING: 'not_awaiting_response',
  CARD_NOT_IN_PLAY: 'card_not_in_play',
  UID_UNKNOWN: 'uid_unknown'
});

/**
 * Razones del evento `play_interrupted` (servidor → cliente).
 * Indica que la partida ha sido detenida por el servidor y por qué.
 */
const PLAY_INTERRUPTED_REASONS = Object.freeze({
  /** Error interno fatal procesando un scan (BD caída, excepción inesperada). */
  INTERNAL_ERROR: 'internal_error',
  /** Restauración tras reinicio del servidor sin estado recuperable. */
  RECONCILIATION_FAILED: 'reconciliation_failed'
});

module.exports = {
  RFID_ERROR_CODES,
  SCAN_IGNORED_REASONS,
  PLAY_INTERRUPTED_REASONS
};
