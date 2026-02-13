/**
 * @fileoverview Servicio Web Serial para lectura de RFID desde el navegador.
 * Emite eventos normalizados y los reenvia al backend por Socket.IO.
 *
 * @module services/webSerialService
 */

import { socketService } from './socket';

const SENSOR_ID_KEY = 'rfid_sensor_id';
const DEFAULT_BAUD_RATE = 115200;
const DEFAULT_DEDUPE_MS = 1200;
const MAX_UID_CACHE_SIZE = 500;
const UID_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_BASE_MS = 1000;

const CARD_TYPES = new Set(['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN']);

const generateSensorId = () => {
  if (globalThis.crypto?.randomUUID) {
    return `sensor-${globalThis.crypto.randomUUID()}`;
  }
  return `sensor-${Math.random().toString(16).slice(2)}-${Date.now()}`;
};

const getOrCreateSensorId = () => {
  try {
    const existing = globalThis.localStorage?.getItem(SENSOR_ID_KEY);
    if (existing) {
      return existing;
    }
    const created = generateSensorId();
    globalThis.localStorage?.setItem(SENSOR_ID_KEY, created);
    return created;
  } catch {
    return generateSensorId();
  }
};

const normalizeCardType = (rawType) => {
  if (!rawType) return 'UNKNOWN';
  const normalized = String(rawType).trim().toUpperCase().replace(/\s+/g, '_');
  if (CARD_TYPES.has(normalized)) {
    return normalized;
  }
  if (normalized.includes('MIFARE_1KB')) return 'MIFARE_1KB';
  if (normalized.includes('MIFARE_4KB')) return 'MIFARE_4KB';
  if (normalized.includes('NTAG')) return 'NTAG';
  return 'UNKNOWN';
};

class WebSerialService {
  constructor() {
    this.port = null;
    this.reader = null;
    this.keepReading = false;
    this.buffer = '';
    this.listeners = new Map();
    this.status = 'disconnected';
    this.sensorId = getOrCreateSensorId();
    this.dedupeCooldownMs = DEFAULT_DEDUPE_MS;
    this.lastScanByUid = new Map();
    this.forwardToServer = true;
    this.hasSerialDisconnectListener = false;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.lastPort = null;
    this.reconnectTimerId = null;
    this.autoReconnectEnabled = true;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);
  }

  off(eventName, callback) {
    if (!this.listeners.has(eventName)) return;
    if (!callback) {
      this.listeners.delete(eventName);
      return;
    }
    this.listeners.get(eventName).delete(callback);
  }

  emit(eventName, payload) {
    const callbacks = this.listeners.get(eventName);
    if (!callbacks) return;
    callbacks.forEach((cb) => cb(payload));
  }

  setForwarding(enabled) {
    this.forwardToServer = Boolean(enabled);
  }

  setStatus(nextStatus, details = null) {
    this.status = nextStatus;
    this.emit('status', { status: nextStatus, details });
  }

  async connect() {
    if (!this.isSupported()) {
      this.setStatus('unsupported');
      throw new Error('Web Serial API no soportada en este navegador');
    }

    if (this.port) {
      return;
    }

    this.autoReconnectEnabled = true;

    this.setStatus('connecting');
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: DEFAULT_BAUD_RATE });
    this.setStatus('connected');
    this.reconnectAttempts = 0;
    this.reconnecting = false;

    if (navigator.serial?.addEventListener && !this.hasSerialDisconnectListener) {
      navigator.serial.addEventListener('disconnect', this.handleDisconnect);
      this.hasSerialDisconnectListener = true;
    }
  }

  handleDisconnect = () => {
    if (!this.autoReconnectEnabled) {
      return;
    }

    this.stopReading();
    this.lastPort = this.port;
    this.port = null;
    this.setStatus('disconnected', 'device_disconnected');

    if (navigator.serial?.removeEventListener && this.hasSerialDisconnectListener) {
      navigator.serial.removeEventListener('disconnect', this.handleDisconnect);
      this.hasSerialDisconnectListener = false;
    }

    // Intentar reconectar automáticamente
    this.attemptReconnect();
  };

  async attemptReconnect() {
    if (!this.autoReconnectEnabled) {
      return;
    }

    if (this.reconnecting || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        this.emit('error', {
          message: 'Máximo de intentos de reconexión alcanzado',
          details: 'Por favor, reconecta el sensor manualmente.'
        });
      }
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;
    this.setStatus('reconnecting', { attempt: this.reconnectAttempts });

    const delay = RECONNECT_DELAY_BASE_MS * Math.pow(2, this.reconnectAttempts - 1);

    if (this.reconnectTimerId) {
      clearTimeout(this.reconnectTimerId);
    }

    this.reconnectTimerId = setTimeout(async () => {
      try {
        // En Web Serial, no podemos "reabrir" el mismo objeto puerto fácilmente si se desconectó físicamente
        // Pero si fue un error lógico o temporal, intentamos.
        // Si fue una desconexión física, el usuario debe interactuar de nuevo (seguridad del navegador).
        // Sin embargo, si el puerto vuelve a aparecer, podemos intentar buscarlo en getPorts().
        const ports = await navigator.serial.getPorts();
        // Intentar encontrar un puerto que coincida si es posible, o usar el último conocido si sigue ahí
        const portToTry = ports.find(p => p === this.lastPort) || ports[0];

        if (portToTry) {
           this.port = portToTry;
           await this.port.open({ baudRate: DEFAULT_BAUD_RATE });
           this.setStatus('connected');
           this.reconnectAttempts = 0;
           this.reconnecting = false;
           this.startReading(); // Reiniciar lectura
        } else {
          throw new Error('No se encontró el puerto para reconectar');
        }
      } catch (error) {
        this.reconnecting = false;
        this.attemptReconnect(); // Reintentar
      }
    }, delay);
  }

  async disconnect() {
    this.autoReconnectEnabled = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;

    if (this.reconnectTimerId) {
      clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }

    await this.stopReading();

    if (this.port) {
      try {
        await this.port.close();
      } catch (error) {
        this.emit('error', {
          message: 'Error al cerrar el puerto serial',
          details: error?.message
        });
      }
    }

    this.port = null;
    this.setStatus('disconnected');

    if (navigator.serial?.removeEventListener && this.hasSerialDisconnectListener) {
      navigator.serial.removeEventListener('disconnect', this.handleDisconnect);
      this.hasSerialDisconnectListener = false;
    }
  }

  async startReading() {
    if (!this.port) {
      throw new Error('No hay puerto serial conectado');
    }

    if (this.keepReading) {
      return;
    }

    this.keepReading = true;
    this.setStatus('reading');

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.buffer += value;
          this.processBuffer();
        }
      }
    } catch (error) {
      this.emit('error', {
        message: 'Error leyendo del puerto serial',
        details: error?.message
      });
    } finally {
      try {
        this.reader?.releaseLock();
        await readableStreamClosed.catch(() => null);
      } catch {
        // No hacer nada
      }
      this.reader = null;
    }
  }

  async stopReading() {
    this.keepReading = false;
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // No hacer nada
      }
    }
    if (this.status === 'reading') {
      this.setStatus('connected');
    }
  }

  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) {
        return;
      }

      try {
        const event = JSON.parse(trimmed);
        this.handleRawEvent(event);
      } catch (error) {
        this.emit('error', {
          message: 'Evento RFID invalido (JSON)',
          details: error?.message
        });
      }
    });
  }

  handleRawEvent(event) {
    if (!event || event.event !== 'card_detected') {
      return;
    }

    const uid = String(event.uid || '').trim().toUpperCase();
    if (!uid) {
      return;
    }

    const now = Date.now();
    const last = this.lastScanByUid.get(uid);
    if (last && now - last < this.dedupeCooldownMs) {
      this.emit('dedupe', { uid });
      return;
    }
    if (this.lastScanByUid.has(uid)) {
      this.lastScanByUid.delete(uid);
    }
    this.lastScanByUid.set(uid, now);
    this.cleanupUidCache(now);

    const payload = {
      uid,
      type: normalizeCardType(event.type),
      sensorId: this.sensorId,
      timestamp: now,
      source: 'web_serial'
    };

    this.emit('scan', payload);

    if (this.forwardToServer && socketService.isSocketConnected()) {
      try {
        socketService.emitFireAndForget('rfid_scan_from_client', payload);
      } catch (error) {
        this.emit('error', {
          message: 'Error enviando evento RFID al servidor',
          details: error?.message
        });
      }
    }
  }

  cleanupUidCache(now) {
    if (this.lastScanByUid.size <= MAX_UID_CACHE_SIZE) {
      return;
    }

    for (const [cachedUid, timestamp] of this.lastScanByUid.entries()) {
      if (now - timestamp > UID_CACHE_TTL_MS) {
        this.lastScanByUid.delete(cachedUid);
      }
    }

    while (this.lastScanByUid.size > MAX_UID_CACHE_SIZE) {
      const oldestKey = this.lastScanByUid.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.lastScanByUid.delete(oldestKey);
    }
  }
}

export const webSerialService = new WebSerialService();
export default webSerialService;
