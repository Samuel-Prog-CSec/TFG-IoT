/**
 * @fileoverview Servicio para gestionar la comunicación con el sensor RFID vía puerto serie.
 * Mantiene conexión persistente con el ESP8266 y emite eventos cuando se detectan tarjetas.
 * @module services/rfidService
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const logger = require('../utils/logger');
const { EventEmitter } = require('events');

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
  }

  /**
   * Establece la conexión con el sensor RFID vía puerto serie.
   * Si la conexión falla, programa un reintento automático tras 5 segundos.
   *
   * Este método puede ser llamado múltiples veces de forma segura gracias a los flags de estado.
   *
   * @async
   * @returns {Promise<void>}
   * @emits status - 'reconnecting' cuando intenta conectar, 'connected' cuando tiene éxito
   */
  async connect() {
    // Si ya está conectado, intentando reconectar o cerrándose, no hacer nada
    if (this.isConnected || this.isReconnecting || this.isShuttingDown) {
      return;
    }

    // Activar flag de reconexión
    this.isReconnecting = true;
    this.emit('status', 'reconnecting'); // Informar a la app

    try {
      const portPath = process.env.SERIAL_PORT || 'COM3';
      const baudRate = parseInt(process.env.SERIAL_BAUD_RATE) || 115200;

      logger.info(`Intentando reconectar al sensor RFID en ${portPath} a ${baudRate} baudios`);

      this.port = new SerialPort({
        path: portPath,
        baudRate: baudRate,
        autoOpen: false
      });

      // Crear parser para lectura basada en líneas
      this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

      // Open port
      await new Promise((resolve, reject) => {
        this.port.open((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.isConnected = true;
      this.isReconnecting = false; // Resetear flag de reconexión
      logger.info('Sensor RFID conectado exitosamente');
      this.emit('status', 'connected'); // Informar a la app que estamos conectados

      // Setup listeners (SOLO después de conectar)
      this.parser.on('data', (line) => this.handleSerialData(line));

      // Manejo de errores y cierre
      this.port.on('error', (err) => {
        logger.error(`Error en el puerto serie: ${err.message}`);
        this.isConnected = false;
        this.handleDisconnection();
      });

      this.port.on('close', () => {
        logger.warn('Puerto serie cerrado');
        this.isConnected = false;
        this.handleDisconnection();
      });

    } catch (error) {
      // Si falla, volver a intentarlo en 5 segundos
      logger.error(`Fallo al conectar con el sensor RFID: ${error.message}`);

      // Limpiar el puerto si se llegó a crear
      if (this.port) {
        if (this.port.isOpen) {
          this.port.close();
          this.port = null;
        }
      }
      this.isReconnecting = false; // Resetear para que handleDisconnection funcione
      this.handleDisconnection();
    }
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
    if (this.isReconnecting || this.isShuttingDown) return;

    this.isConnected = false;
    this.emit('status', 'disconnected');
    logger.info('RFID desconectado. Reintentando en 5 segundos...');

    // Activar el flag y reintentar conexión
    this.isReconnecting = true;
    setTimeout(() => {
      this.isReconnecting = false; // Resetear el flag antes de llamar
      this.connect(); // Volver a intentar la conexión
    }, 5000); // 5 segundos de espera
  }

  /**
   * Procesa los datos recibidos del puerto serie.
   * Parsea JSON y emite eventos RFID al sistema.
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
      logger.debug(`Evento RFID recibido:`, event);

      // Emitir evento a interesados (server.js)
      this.emit('rfid_event', event);
    } catch (error) {
      logger.error(`Error al analizar el evento RFID: ${trimmed}`, error);
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

    if (this.port && this.port.isOpen) {
      this.port.close((err) => {
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
   * Obtiene el estado actual del servicio RFID.
   *
   * @returns {Object} Estado actual del servicio
   * @property {boolean} isConnected - Si está actualmente conectado
   * @property {string} [port] - Ruta del puerto serie (ej: 'COM3')
   * @property {number} [baudRate] - Velocidad de baudios configurada
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      port: this.port?.path,
      baudRate: this.port?.baudRate
    };
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
