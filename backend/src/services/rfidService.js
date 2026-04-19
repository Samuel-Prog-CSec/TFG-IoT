/**
 * @fileoverview Servicio RFID centralizado para eventos provenientes del cliente (Web Serial).
 * Administra métricas, buffer de eventos y estado del servicio.
 *
 * Este servicio NO abre puertos serie en el backend. El sensor se conecta al PC del profesor y
 * el navegador envía los eventos al backend por Socket.IO.
 *
 * @module services/rfidService
 */

const logger = require('../utils/logger').child({ component: 'rfidService' });
const { EventEmitter } = require('node:events');

// Constantes de configuración
const EVENT_BUFFER_SIZE = 100;
const VALID_RFID_SOURCES = new Set(['web_serial']);

/**
 * Ventana del scan rate corto (1 min) en ms.
 */
const SCAN_RATE_SHORT_WINDOW_MS = 60_000;

/**
 * Ventana del scan rate medio (5 min) en ms.
 */
const SCAN_RATE_LONG_WINDOW_MS = 5 * 60_000;

/**
 * Antigüedad máxima de timestamps de scan que mantenemos en memoria.
 * Cualquier timestamp más viejo se descarta al calcular tasas.
 */
const SCAN_TIMESTAMPS_RETENTION_MS = SCAN_RATE_LONG_WINDOW_MS + 30_000;

/**
 * Si no llega un scan en este intervalo y antes había actividad, marcamos
 * el sensor como "stale" en el snapshot de salud.
 */
const SENSOR_STALE_THRESHOLD_MS = 90_000;

/**
 * Servicio RFID para eventos entrantes desde el navegador.
 *
 * Emite eventos para notificar cambios de estado y cuando se detectan tarjetas RFID.
 *
 * @class RFIDService
 * @extends EventEmitter
 * @fires RFIDService#rfid_event - Cuando se detecta/retira una tarjeta o hay un error
 * @fires RFIDService#status - Cuando cambia el estado del servicio (client_ready, disabled, misconfigured, stopped)
 */
class RFIDService extends EventEmitter {
  /**
   * Crea una nueva instancia del servicio RFID.
   * Inicializa las propiedades sin establecer conexión inmediata.
   *
   * @constructor
   */
  constructor() {
    super();

    /**
     * Buffer circular para eventos recientes (debugging)
     * @type {Array}
     * @private
     */
    this.eventBuffer = [];

    /**
     * Métricas de rendimiento del servicio
     * @type {Object}
     */
    this.metrics = {
      totalEventsReceived: 0,
      totalCardDetections: 0,
      totalErrors: 0,
      lastEventTimestamp: null,
      lastScanAt: null,
      lastErrorAt: null,
      connectionUptime: 0,
      lastConnectedAt: null,
      /** Total de eventos `dedupe` registrados desde el cliente o servidor. */
      dedupeHits: 0,
      /** Errores agregados por `type` (init_failure, read_failure, ...). */
      errorsByType: {}
    };

    /**
     * Timestamps de scans recientes para calcular tasas. Se trunca al
     * tamaño máximo dictado por SCAN_TIMESTAMPS_RETENTION_MS al consultar.
     * @type {number[]}
     * @private
     */
    this._scanTimestamps = [];

    /**
     * Estado actual del servicio RFID
     * @type {string}
     */
    this.status = 'stopped';

    /**
     * Fuente RFID configurada
     * @type {string|null}
     */
    this.source = null;
  }

  /**
   * Inicia el servicio RFID en modo cliente (Web Serial).
   * @returns {void}
   * @emits status
   */
  start() {
    const source = (process.env.RFID_SOURCE || 'client').trim().toLowerCase();
    this.source = source;

    if (source === 'disabled') {
      this.status = 'disabled';
      this.emit('status', 'disabled');
      return;
    }

    if (source !== 'client') {
      this.status = 'misconfigured';
      logger.error(`RFID_SOURCE inválido: ${source}`);
      this.emit('status', 'misconfigured');
      return;
    }

    this.status = 'client_ready';
    this.metrics.lastConnectedAt = Date.now();
    this.emit('status', 'client_ready');
  }

  /**
   * Detiene el servicio RFID.
   */
  stop() {
    this.status = 'stopped';
    this.emit('status', 'stopped');
  }

  /**
   * Ingiere un evento RFID ya normalizado desde el cliente.
   * @param {Object} event
   */
  ingestEvent(event) {
    if (!event || typeof event !== 'object') {
      this.metrics.totalErrors++;
      logger.warn('Evento RFID inválido (no objeto)');
      return;
    }

    if (event.source && !VALID_RFID_SOURCES.has(event.source)) {
      this.metrics.totalErrors++;
      logger.warn('Fuente RFID no permitida', { source: event.source });
      return;
    }

    const now = Date.now();
    this.metrics.totalEventsReceived++;
    this.metrics.lastEventTimestamp = now;

    if (event.event === 'card_detected') {
      this.metrics.totalCardDetections++;
      this.metrics.lastScanAt = now;
      this._scanTimestamps.push(now);
      this._pruneScanTimestamps(now);
    } else if (event.event === 'error') {
      this.metrics.totalErrors++;
      this.metrics.lastErrorAt = now;
      const type = String(event.type || 'unknown');
      this.metrics.errorsByType[type] = (this.metrics.errorsByType[type] || 0) + 1;
    }

    this.eventBuffer.push({
      ...event,
      receivedAt: Date.now()
    });

    if (this.eventBuffer.length > EVENT_BUFFER_SIZE) {
      this.eventBuffer.shift();
    }

    this.emit('rfid_event', event);
  }

  /**
   * Registra un evento de deduplicación (rechazado por dedupe upstream).
   * El frontend no debe llamarlo directamente; se invoca desde el rate
   * limiter o desde paths donde detectamos duplicados.
   */
  recordDedupeHit() {
    this.metrics.dedupeHits++;
  }

  /**
   * Devuelve un snapshot de salud del sensor RFID con tasas computadas
   * y un rating cualitativo (ok | degraded | down) consumible por la UI.
   *
   * @returns {Object}
   */
  getHealthSnapshot() {
    const now = Date.now();
    this._pruneScanTimestamps(now);
    const scansLast1m = this._scanTimestamps.filter(
      t => now - t <= SCAN_RATE_SHORT_WINDOW_MS
    ).length;
    const scansLast5m = this._scanTimestamps.length;

    let health;
    if (
      this.status === 'disabled' ||
      this.status === 'misconfigured' ||
      this.status === 'stopped'
    ) {
      health = 'down';
    } else if (
      this.metrics.lastScanAt &&
      now - this.metrics.lastScanAt > SENSOR_STALE_THRESHOLD_MS
    ) {
      health = 'degraded';
    } else {
      health = 'ok';
    }

    return {
      service: { status: this.status, source: this.source },
      health,
      counters: {
        totalEvents: this.metrics.totalEventsReceived,
        totalScans: this.metrics.totalCardDetections,
        totalErrors: this.metrics.totalErrors,
        dedupeHits: this.metrics.dedupeHits,
        errorsByType: { ...this.metrics.errorsByType }
      },
      rates: {
        scanRate1m: scansLast1m,
        scanRate5m: scansLast5m
      },
      timestamps: {
        lastScanAt: this.metrics.lastScanAt,
        lastErrorAt: this.metrics.lastErrorAt,
        lastEventAt: this.metrics.lastEventTimestamp,
        connectedAt: this.metrics.lastConnectedAt
      }
    };
  }

  /**
   * Elimina del buffer interno los timestamps de scan más antiguos que
   * SCAN_TIMESTAMPS_RETENTION_MS.
   *
   * @param {number} now Timestamp actual (en ms epoch).
   * @private
   */
  _pruneScanTimestamps(now) {
    const cutoff = now - SCAN_TIMESTAMPS_RETENTION_MS;
    while (this._scanTimestamps.length > 0 && this._scanTimestamps[0] < cutoff) {
      this._scanTimestamps.shift();
    }
  }

  /**
   * Obtiene el estado actual del servicio RFID con métricas.
   *
   * @returns {Object} Estado actual del servicio
   * @property {string} status - Estado del servicio
   * @property {string|null} source - Fuente configurada
   * @property {Object} metrics - Métricas de rendimiento
   * @property {Array} recentEvents - Últimos eventos recibidos (buffer)
   */
  getStatus() {
    const uptime = this.metrics.lastConnectedAt ? Date.now() - this.metrics.lastConnectedAt : 0;

    return {
      status: this.status,
      source: this.source,
      metrics: {
        ...this.metrics,
        connectionUptime: uptime,
        uptimeFormatted: this.formatUptime(uptime)
      },
      recentEvents: this.eventBuffer.slice(-10)
    };
  }

  /**
   * Formatea el uptime a string legible.
   *
   * @private
   * @param {number} ms - Milisegundos
   * @returns {string} Uptime formateado
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Obtiene el buffer de eventos recientes para debugging.
   *
   * @returns {Array} Buffer de eventos
   */
  getEventBuffer() {
    return this.eventBuffer;
  }

  /**
   * Limpia el buffer de eventos.
   */
  clearEventBuffer() {
    this.eventBuffer = [];
    logger.info('Buffer de eventos RFID limpiado');
  }
}

/**
 * Instancia singleton del servicio RFID.
 * Se exporta una única instancia compartida por toda la aplicación.
 *
 * @type {RFIDService}
 */
const rfidService = new RFIDService();

module.exports = rfidService;
