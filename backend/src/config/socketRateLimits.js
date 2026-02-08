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
 * - rfid_scan_from_client: 2 eventos cada 3s (≈ 1 evento cada 1.5s) con burst corto.
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
  rfid_scan_from_client: { windowMs: 3000, max: 2 }
};

/**
 * Política de bloqueo temporal tras abuso.
 */
const socketBlockConfig = {
  violationThreshold: 3,
  blockDurationMs: 60 * 1000
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
 */
const rfidDedupeConfig = {
  cooldownMs: 1200
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
  socketBlockConfig,
  socketPayloadLimits,
  rfidDedupeConfig,
  socketStateCleanup
};
