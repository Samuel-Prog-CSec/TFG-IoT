/**
 * @fileoverview Servicio optimizado para gestionar comunicación con el sensor RFID.
 * Implementa reconexión automática, buffer de eventos y métricas de rendimiento.
 *
 * LIMITACIÓN ACTUAL (duda #1): Este servicio usa SerialPort, lo que limita la conexión a UN SOLO
 * dispositivo ESP8266 conectado físicamente al servidor. Esto significa que todos los jugadores
 * comparten el mismo lector RFID.
 *
 * MEJORA FUTURA - MQTT (duda #1): Considerar migrar a MQTT para permitir:
 * - Múltiples ESP8266 (uno por usuario/aula)
 * - Comunicación inalámbrica más escalable
 * - Menor acoplamiento hardware-servidor
 * - Cada estudiante podría tener su propio lector RFID
 * - Despliegue en múltiples ubicaciones físicas
 *
 * Implementación sugerida:
 * - ESP8266 publica mensajes a topics MQTT: "rfid/reader_{id}/card_detected"
 * - Backend suscrito a topics y procesa eventos por reader_id
 * - Asociar reader_id con playId en gameEngine
 *
 * @module services/rfidService
 */

const logger = require('../utils/logger');
const { EventEmitter } = require('events');

// Constantes de configuración
const MAX_RECONNECT_ATTEMPTS = parseInt(process.env.RFID_MAX_RECONNECT_ATTEMPTS) || 10;
const RECONNECT_DELAY_MS = parseInt(process.env.RFID_RECONNECT_DELAY_MS) || 5000;
const EVENT_BUFFER_SIZE = 100;

/**
 * Servicio RFID con reconexión automática y gestión de estado.
 *
 * Este servicio establece y mantiene la conexión con el sensor RFID RC522 conectado
 * al ESP8266 NodeMCU vía puerto serie. Emite eventos para notificar cambios de estado
 * y cuando se detectan tarjetas RFID.
 *
 * El servicio implementa reconexión automática en caso de desconexión inesperada.
 *
 * @class RFIDService
 * @extends EventEmitter
 * @fires RFIDService#rfid_event - Cuando se detecta/retira una tarjeta o hay un error
 * @fires RFIDService#status - Cuando cambia el estado de conexión (connected, disconnected, reconnecting)
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
     * Implementaciones inyectables para facilitar testing.
     * En producción se resuelven vía require dinámico.
     * @private
     */
    this._serialImpl = {
      SerialPort: null,
      ReadlineParser: null
    };

    /**
     * Instancia del puerto serie
     * @type {SerialPort|null}
     * @private
     */
    this.port = null;

    /**
     * Parser de líneas para lectura del puerto serie
     * @type {ReadlineParser|null}
     * @private
     */
    this.parser = null;

    /**
     * Indica si el sensor está actualmente conectado
     * @type {boolean}
     */
    this.isConnected = false;

    /**
     * Flag para evitar múltiples intentos de reconexión simultáneos
     * @type {boolean}
     * @private
     */
    this.isReconnecting = false;

    /**
     * Flag para evitar reconexión durante el cierre de la aplicación
     * @type {boolean}
     * @private
     */
    this.isShuttingDown = false;

    /**
     * Contador de intentos de reconexión
     * @type {number}
     * @private
     */
    this.reconnectAttempts = 0;

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
     * Timer para reconexión
     * @type {NodeJS.Timeout|null}
     * @private
     */
    this.reconnectTimer = null;
  }

  /**
   * Establece la conexión con el sensor RFID vía puerto serie.
   * Si la conexión falla, programa un reintento automático con backoff exponencial.
   *
   * Este método puede ser llamado múltiples veces de forma segura gracias a los flags de estado.
   *
   * @async
   * @returns {Promise<void>}
   * @emits status - 'reconnecting' cuando intenta conectar, 'connected' cuando tiene éxito
   */
  async connect() {
    // Sprint 1.5: RFID deshabilitado por defecto salvo RFID_ENABLED=true
    if (process.env.RFID_ENABLED !== 'true') {
      this.emit('status', 'disabled');
      return;
    }

    // Configuración obligatoria cuando RFID está habilitado
    if (!process.env.SERIAL_PORT) {
      // Sub-tarea T-016.3: detección informativa de puertos disponibles
      const availablePorts = await this._listAvailablePortsSafe();
      logger.error('RFID_ENABLED=true pero SERIAL_PORT no está configurado.', {
        availablePorts
      });
      this.emit('status', 'misconfigured');
      return;
    }

    // Si ya está conectado, intentando reconectar o cerrándose, no hacer nada
    if (this.isConnected || this.isReconnecting || this.isShuttingDown) {
      return;
    }

    // Verificar límite de intentos
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error(
        `Máximo de intentos de reconexión alcanzado (${MAX_RECONNECT_ATTEMPTS}). Deteniendo.`
      );
      this.emit('status', 'failed');
      return;
    }

    // Activar flag de reconexión
    this.isReconnecting = true;
    this.reconnectAttempts++;
    this.emit('status', 'reconnecting'); // Informar a la app

    try {
      const portPath = process.env.SERIAL_PORT;
      const baudRate = parseInt(process.env.SERIAL_BAUD_RATE) || 115200;

      const SerialPortCtor = this._serialImpl.SerialPort || require('serialport').SerialPort;
      const ReadlineParserCtor =
        this._serialImpl.ReadlineParser || require('@serialport/parser-readline').ReadlineParser;

      logger.info(
        `Intentando conectar al sensor RFID (intento ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
        {
          port: portPath,
          baudRate
        }
      );

      this.port = new SerialPortCtor({
        path: portPath,
        baudRate,
        autoOpen: false
      });

      // Crear parser para lectura basada en líneas
      this.parser = this.port.pipe(new ReadlineParserCtor({ delimiter: '\n' }));

      // Open port
      await new Promise((resolve, reject) => {
        this.port.open(err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      this.isConnected = true;
      this.isReconnecting = false; // Resetear flag de reconexión
      this.reconnectAttempts = 0; // Resetear contador en conexión exitosa
      this.metrics.lastConnectedAt = Date.now();

      logger.info('Sensor RFID conectado exitosamente');
      this.emit('status', 'connected'); // Informar a la app que estamos conectados

      // Setup listeners (SOLO después de conectar)
      this.parser.on('data', line => this.handleSerialData(line));

      // Manejo de errores y cierre
      this.port.on('error', err => {
        logger.error(`Error en el puerto serie: ${err.message}`);
        this.metrics.totalErrors++;
        this.isConnected = false;
        this.handleDisconnection();
      });

      this.port.on('close', () => {
        logger.warn('Puerto serie cerrado');
        this.isConnected = false;
        this.handleDisconnection();
      });
    } catch (error) {
      // Si falla, volver a intentarlo con backoff exponencial
      const delay = Math.min(RECONNECT_DELAY_MS * this.reconnectAttempts, 60000); // Max 60s

      logger.error(
        `Fallo al conectar con el sensor RFID (intento ${this.reconnectAttempts}): ${error.message}`
      );
      this.metrics.totalErrors++;

      // Limpiar el puerto si se llegó a crear
      if (this.port) {
        if (this.port.isOpen) {
          this.port.close();
        }
        this.port = null;
      }

      this.isReconnecting = false; // Resetear para que handleDisconnection funcione

      // Programar reintento
      logger.info(`Reintentando conexión en ${delay / 1000}s...`);
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, delay);
    }
  }

  /**
   * Lista puertos serie disponibles (informativo) sin lanzar errores.
   * - No requiere hardware, solo consulta al SO.
   * - Si falla o no está disponible, devuelve un array vacío.
   * @private
   * @returns {Promise<Array<{path?: string, friendlyName?: string, manufacturer?: string}>>}
   */
  async _listAvailablePortsSafe() {
    try {
      const SerialPortCtor = this._serialImpl.SerialPort || require('serialport').SerialPort;
      if (!SerialPortCtor?.list) {
        return [];
      }

      const ports = await SerialPortCtor.list();
      if (!Array.isArray(ports)) {
        return [];
      }

      // Reducir el payload del log (suficiente para debug)
      return ports.map(p => ({
        path: p.path,
        friendlyName: p.friendlyName,
        manufacturer: p.manufacturer
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Inyecta implementaciones de SerialPort/ReadlineParser (útil en tests).
   * @param {Object} impl
   * @param {Function|null} [impl.SerialPort]
   * @param {Function|null} [impl.ReadlineParser]
   */
  setSerialImplementations({ SerialPort, ReadlineParser }) {
    if (SerialPort !== undefined) this._serialImpl.SerialPort = SerialPort;
    if (ReadlineParser !== undefined) this._serialImpl.ReadlineParser = ReadlineParser;
  }

  /**
   * Maneja la desconexión del sensor y programa reconexión automática.
   * Si el servicio está cerrándose o ya reconectando, no hace nada.
   *
   * @private
   * @emits status - 'disconnected' cuando se pierde la conexión
   */
  handleDisconnection() {
    // Si se está reconectando O si se está cerrando la app, no hacer nada
    if (this.isReconnecting || this.isShuttingDown) {
      return;
    }

    this.isConnected = false;
    this.emit('status', 'disconnected');
    logger.info('RFID desconectado. Reintentando en 5 segundos...');

    // Activar el flag y reintentar conexión
    this.isReconnecting = true;
    this.reconnectTimer = setTimeout(() => {
      this.isReconnecting = false; // Resetear el flag antes de llamar
      this.connect(); // Volver a intentar la conexión
    }, 5000); // 5 segundos de espera
  }

  /**
   * Procesa los datos recibidos del puerto serie.
   * Parsea JSON y emite eventos RFID al sistema.
   * Implementa buffer circular para debugging.
   *
   * @private
   * @param {string} line - Línea de texto recibida del puerto serie
   * @emits rfid_event - Con los datos del evento parseados (card_detected, card_removed, error, etc.)
   */
  handleSerialData(line) {
    const trimmed = line.trim();

    // Ignorar líneas vacías o no JSON
    if (!trimmed.startsWith('{')) {
      logger.debug(`Datos serie no JSON: ${trimmed}`);
      return;
    }

    try {
      const event = JSON.parse(trimmed);

      // Actualizar métricas
      this.metrics.totalEventsReceived++;
      this.metrics.lastEventTimestamp = Date.now();

      if (event.event === 'card_detected') {
        this.metrics.totalCardDetections++;
      }

      // Añadir al buffer circular
      this.eventBuffer.push({
        ...event,
        receivedAt: Date.now()
      });

      if (this.eventBuffer.length > EVENT_BUFFER_SIZE) {
        this.eventBuffer.shift(); // Eliminar el más antiguo
      }

      logger.debug(`Evento RFID recibido:`, event);

      // Emitir evento a interesados (server.js)
      this.emit('rfid_event', event);
    } catch (error) {
      logger.error(`Error al analizar el evento RFID: ${trimmed}`, {
        error: error.message
      });
      this.metrics.totalErrors++;
    }
  }

  /**
   * Cierra la conexión con el sensor RFID.
   * Activa el flag de shutdown para evitar reconexión automática.
   *
   * @returns {void}
   */
  disconnect() {
    // Activar el flag para que handleDisconnection no intente reconectar
    this.isShuttingDown = true;
    
    if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }

    if (this.port && this.port.isOpen) {
      this.port.close(err => {
        if (err) {
          logger.error(`Error cerrando el puerto serie: ${err.message}`);
        } else {
          logger.info('Sensor RFID desconectado');
        }
      });
    }
    this.isConnected = false;
  }

  /**
   * Obtiene el estado actual del servicio RFID con métricas.
   *
   * @returns {Object} Estado actual del servicio
   * @property {boolean} isConnected - Si está actualmente conectado
   * @property {string} [port] - Ruta del puerto serie (ej: 'COM3')
   * @property {number} [baudRate] - Velocidad de baudios configurada
   * @property {Object} metrics - Métricas de rendimiento
   * @property {number} reconnectAttempts - Intentos de reconexión actuales
   * @property {Array} recentEvents - Últimos eventos recibidos (buffer)
   */
  getStatus() {
    const uptime = this.metrics.lastConnectedAt ? Date.now() - this.metrics.lastConnectedAt : 0;

    return {
      isConnected: this.isConnected,
      port: this.port?.path,
      baudRate: this.port?.baudRate,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      metrics: {
        ...this.metrics,
        connectionUptime: uptime,
        uptimeFormatted: this.formatUptime(uptime)
      },
      recentEvents: this.eventBuffer.slice(-10) // Últimos 10 eventos
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
