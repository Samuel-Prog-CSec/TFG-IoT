/**
 * @fileoverview Configuración de rate limiting para eventos WebSocket.
 * Centraliza límites por evento, payload máximo y política de bloqueo.
 * @module config/socketRateLimits
 */

const socketRateLimitDefaults = {
  windowMs: 1000,
  max: 10
};

/**
 * Límites específicos por evento (ventana deslizante).
 *
 * rfid_scan_from_client a 120/min: en modo táctil un niño de 4-8 años puede
 * "mashear" el tablero de Memoria/Asociación (dedupe táctil de solo 250ms → hasta
 * 4 taps/s) y superar los 60/min anteriores, perdiendo respuestas legítimas. 120/min
 * sigue filtrando abuso real y el dedupe cubre el chattering del sensor hardware.
 *
 * @type {Record<string, {windowMs:number, max:number}>}
 */
const socketRateLimits = {
  join_play: { windowMs: 1000, max: 3 },
  leave_play: { windowMs: 1000, max: 3 },
  start_play: { windowMs: 1000, max: 1 },
  pause_play: { windowMs: 1000, max: 2 },
  resume_play: { windowMs: 1000, max: 2 },
  next_round: { windowMs: 1000, max: 5 },
  rfid_scan_from_client: { windowMs: 60 * 1000, max: 120 },
  play_state_sync: { windowMs: 1000, max: 2 }
};

/**
 * Eventos "soft-limit": si superan su ventana, se descartan silenciosamente pero
 * NUNCA contribuyen al bloqueo temporal compartido por usuario. Sin esto, un
 * niño tocando rápido el tablero acumulaba violaciones y, tras 5, congelaba
 * `pause_play`/`resume_play`/`next_round` del PROFESOR durante 15s — la partida
 * quedaba tomada. Un exceso de escaneos es comportamiento infantil normal, no
 * abuso: se descarta la lectura sobrante sin penalizar los controles del docente.
 * @type {Set<string>}
 */
const socketSoftLimitEvents = new Set(['rfid_scan_from_client']);

/**
 * Política de bloqueo temporal tras abuso.
 */
const socketBlockConfig = {
  // Relajado para entorno educativo: profesores pueden doble-escanear accidentalmente
  // sin quedar bloqueados durante una clase (ver ADR-047)
  violationThreshold: 5,
  blockDurationMs: 15 * 1000
};

/**
 * Límites de tamaño de payload por evento (bytes).
 */
const socketPayloadLimits = {
  globalBytes: 16 * 1024,
  perEventBytes: {
    rfid_scan_from_client: 8 * 1024
  }
};

/**
 * Dedupe/cooldown adicional para eventos RFID del cliente.
 *
 * PROP-90 / ADR-090: el cooldown se diferencia por `source` del payload para
 * no penalizar mecánicas táctiles rápidas. El sensor RFID físico (RC522) puede
 * leer el mismo tag dos veces por chattering en ~1s, pero un tap táctil sobre
 * dos cartas distintas en memoria no comparte UID — el dedupe largo causaba
 * falsos positivos. Cada fuente tiene su propio cooldown:
 *
 *  - `web_serial_hardware` (default si falta `source`): 1200ms — protege contra
 *    el chattering del sensor.
 *  - `touch_fallback`: 250ms — fallback táctil del panel de Asociación.
 *  - `touch_memory_flip`: 250ms — taps sobre cartas en mecánica Memoria.
 */
const rfidDedupeConfig = {
  defaultCooldownMs: 1200,
  cooldownMsBySource: {
    web_serial_hardware: 1200,
    web_serial: 1200,
    touch_fallback: 250,
    touch_memory_flip: 250
  }
};

/**
 * Límite máximo de conexiones WebSocket simultáneas por usuario.
 * Previene agotamiento de recursos por apertura masiva de conexiones.
 */
const socketConnectionLimits = {
  maxConnectionsPerUser: Number.parseInt(process.env.SOCKET_MAX_CONNECTIONS_PER_USER, 10) || 5
};

/**
 * Limpieza de estados viejos para evitar fugas de memoria.
 */
const socketStateCleanup = {
  staleEntryTtlMs: 5 * 60 * 1000
};

module.exports = {
  socketRateLimits,
  socketRateLimitDefaults,
  socketSoftLimitEvents,
  socketBlockConfig,
  socketPayloadLimits,
  rfidDedupeConfig,
  socketConnectionLimits,
  socketStateCleanup
};
