const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const logger = require('../utils/logger');
const { EventEmitter } = require('events'); // Mucho más limpio y estándar para manejar estados

class RFIDService extends EventEmitter {
  constructor() {
    super();
    this.port = null;
    this.parser = null;
    this.isConnected = false;
    this.isReconnecting = false; // Flag para evitar múltiples intentos de reconexión simultáneos
    this.isShuttingDown = false; // Flag para evitar reconexión al cerrar app
  }

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
      // SI FALLA, volver a intentarlo en 5 segundos
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

  // Método para manejar la desconexión
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

  getStatus() {
    return {
      isConnected: this.isConnected,
      port: this.port?.path,
      baudRate: this.port?.baudRate
    };
  }
}

// Instancia singleton
const rfidService = new RFIDService();

module.exports = rfidService;
