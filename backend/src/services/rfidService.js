/**
 * @fileoverview Servicio RFID centralizado para eventos provenientes del cliente (Web Serial).
 * Administra métricas, buffer de eventos y estado del servicio.
 *
 * Este servicio NO abre puertos serie en el backend. El sensor se conecta al PC del profesor y
 * el navegador envía los eventos al backend por Socket.IO.
 *
 * @module services/rfidService
 */

const logger = require('../utils/logger');
const { EventEmitter } = require('events');

// Constantes de configuración
const EVENT_BUFFER_SIZE = 100;
const VALID_RFID_SOURCES = new Set(['web_serial']);

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
      connectionUptime: 0,
      lastConnectedAt: null
    };

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

    this.metrics.totalEventsReceived++;
    this.metrics.lastEventTimestamp = Date.now();

    if (event.event === 'card_detected') {
      this.metrics.totalCardDetections++;
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
