/**
 * @fileoverview Métricas runtime en memoria (HTTP + RFID) para observabilidad.
 * Se expone vía endpoint protegido /api/metrics.
 *
 * NOTA: Esto NO sustituye Prometheus/OpenTelemetry; es un MVP interno.
 *
 * @module utils/runtimeMetrics
 */

const DEFAULT_EWMA_ALPHA = 0.2;

const state = {
  startedAt: Date.now(),
  http: {
    totalRequests: 0,
    totalResponses: 0,
    totalErrors: 0,
    totalServerErrors: 0,
    totalDurationMs: 0,
    avgLatencyMs: 0,
    ewmaLatencyMs: null,
    lastRequestAt: null
  },
  rfid: {
    totalEventsProcessed: 0,
    byEvent: {},
    lastEventAt: null
  }
};

/**
 * Registra una request HTTP.
 * @param {Object} data
 * @param {number} data.durationMs
 * @param {number} data.statusCode
 */
function recordHttpRequest({ durationMs, statusCode }) {
  state.http.totalRequests += 1;
  state.http.totalResponses += 1;
  state.http.totalDurationMs += durationMs;
  state.http.lastRequestAt = Date.now();

  if (statusCode >= 400) {
    state.http.totalErrors += 1;
  }
  if (statusCode >= 500) {
    state.http.totalServerErrors += 1;
  }

  state.http.avgLatencyMs = state.http.totalDurationMs / state.http.totalResponses;

  // EWMA para suavizar picos (útil para dashboards)
  if (state.http.ewmaLatencyMs === null) {
    state.http.ewmaLatencyMs = durationMs;
  } else {
    state.http.ewmaLatencyMs =
      DEFAULT_EWMA_ALPHA * durationMs + (1 - DEFAULT_EWMA_ALPHA) * state.http.ewmaLatencyMs;
  }
}

/**
 * Registra un evento RFID que el servidor ha procesado (recibido desde rfidService).
 * @param {Object} event
 * @param {string} [event.event]
 */
function recordRfidEvent(event) {
  state.rfid.totalEventsProcessed += 1;
  state.rfid.lastEventAt = Date.now();

  const eventType = (event && event.event) || 'unknown';
  state.rfid.byEvent[eventType] = (state.rfid.byEvent[eventType] || 0) + 1;
}

/**
 * Snapshot de métricas runtime.
 * @returns {Object}
 */
function getSnapshot() {
  return {
    startedAt: new Date(state.startedAt).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - state.startedAt) / 1000),
    http: {
      ...state.http,
      avgLatencyMs: Math.round(state.http.avgLatencyMs * 100) / 100,
      ewmaLatencyMs:
        state.http.ewmaLatencyMs === null ? null : Math.round(state.http.ewmaLatencyMs * 100) / 100
    },
    rfid: {
      ...state.rfid
    }
  };
}

/**
 * Resetea métricas (útil para tests).
 */
function reset() {
  state.startedAt = Date.now();
  state.http.totalRequests = 0;
  state.http.totalResponses = 0;
  state.http.totalErrors = 0;
  state.http.totalServerErrors = 0;
  state.http.totalDurationMs = 0;
  state.http.avgLatencyMs = 0;
  state.http.ewmaLatencyMs = null;
  state.http.lastRequestAt = null;

  state.rfid.totalEventsProcessed = 0;
  state.rfid.byEvent = {};
  state.rfid.lastEventAt = null;
}

module.exports = {
  recordHttpRequest,
  recordRfidEvent,
  getSnapshot,
  reset
};
