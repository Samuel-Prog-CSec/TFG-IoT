/**
 * @fileoverview Servicio Web Serial para lectura de RFID desde el navegador.
 * Emite eventos normalizados y los reenvia al backend por Socket.IO.
 *
 * @module services/webSerialService
 */

import { socketService } from './socket';
import * as pendingScansStore from '../lib/pendingScansStore';

const SENSOR_ID_KEY = 'rfid_sensor_id';
const DEFAULT_BAUD_RATE = 115200;
const DEFAULT_DEDUPE_MS = 1200;
const MAX_UID_CACHE_SIZE = 500;
const UID_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_SCANS = 200;
const PENDING_SCAN_TTL_MS = 30 * 1000;
/**
 * TTL para scans persistidos en IndexedDB. Más generoso que el de memoria
 * (30s) porque IDB sobrevive a recargas y queremos recuperar scans de
 * sesiones interrumpidas hasta 10 min.
 */
const PENDING_SCAN_PERSISTENCE_TTL_MS = 10 * 60 * 1000;
// Ventana de frescura: el backend rechaza scans con timestamp de más de 30s
// (debe seguir a RFID_CLIENT_MAX_TIMESTAMP_SKEW_MS del backend). Un scan
// encolado más viejo que esto se descarta en el flush (rechazo garantizado).
const STALE_SCAN_THRESHOLD_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_BASE_MS = 1000;
const HEARTBEAT_TIMEOUT_MS = 20000;
const INIT_TIMEOUT_MS = 8000;
const MAX_BUFFER_SIZE = 4096;
/**
 * Tiempo máximo que un fragmento de línea puede esperar al `\n` antes de
 * considerar el buffer corrupto y vaciarlo. Defiende contra firmware que
 * envía bytes sin terminador (boot ruidoso, fallo eléctrico).
 */
const LINE_TIMEOUT_MS = 2000;
/**
 * Cadencia con la que comprobamos si el buffer lleva más de
 * LINE_TIMEOUT_MS sin recibir un byte nuevo.
 */
const LINE_TIMEOUT_CHECK_INTERVAL_MS = 500;

/**
 * UIDs válidos: hex mayúsculas de 8 (4 bytes) o 14 (7 bytes) caracteres.
 * Compensa la falta de validación CRC en el firmware de fallback
 * anticollision crudo (rfid_scanner/src/main.cpp:96-107).
 */
const UID_FORMAT_REGEX = /^[0-9A-F]{8}$|^[0-9A-F]{14}$/;

/**
 * Patrón del banner de boot del firmware (`Serial.println("RFID Scanner v1.0...")`
 * en rfid_scanner/src/main.cpp:16). El parser lo descarta sin emitir error.
 */
const BOOT_BANNER_REGEX = /^RFID Scanner/i;

const CARD_TYPES = new Set(['MIFARE_1KB', 'MIFARE_4KB', 'NTAG', 'UNKNOWN']);

const generateSensorId = () => {
  if (globalThis.crypto?.randomUUID) {
    return `sensor-${globalThis.crypto.randomUUID()}`;
  }
  // eslint-disable-next-line sonarjs/pseudo-random -- fallback para generar ID de sensor, no requiere seguridad criptografica
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

const normalizeCardType = rawType => {
  if (!rawType) return 'UNKNOWN';
  const normalized = String(rawType).trim().toUpperCase().replace(/\s+/g, '_');
  if (CARD_TYPES.has(normalized)) {
    return normalized;
  }
  // El firmware MFRC522 envía formatos como "MIFARE Classic 1K" → "MIFARE_CLASSIC_1K"
  // que no matchea directamente con "MIFARE_1KB". Usamos patrones más amplios.
  if (normalized.includes('1K') && normalized.includes('MIFARE')) return 'MIFARE_1KB';
  if (normalized.includes('4K') && normalized.includes('MIFARE')) return 'MIFARE_4KB';
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
    this.deviceState = 'unknown';
    this.firmwareVersion = null;
    // Modo seguro: el firmware (v1.x) anuncia `hmac:"enabled"` en el init de
    // éxito cuando firma cada scan con HMAC. Lo capturamos para que la UI pueda
    // mostrar el indicador "Firma activa" al docente.
    this.hmacEnabled = false;
    this.sensorId = getOrCreateSensorId();
    this.dedupeCooldownMs = DEFAULT_DEDUPE_MS;
    this.lastScanByUid = new Map();
    this.pendingScans = [];
    this.forwardToServer = true;
    this.hasSerialDisconnectListener = false;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.lastPort = null;
    this.reconnectTimerId = null;
    this.autoReconnectEnabled = true;
    this.heartbeatTimerId = null;
    this.initTimeoutId = null;
    this._connectInProgress = false;
    /**
     * Timestamp del último byte recibido del puerto. Se usa junto a
     * `lineTimeoutTimerId` para detectar buffer estancado.
     * @type {number|null}
     */
    this.lastByteAt = null;
    /**
     * Interval que comprueba LINE_TIMEOUT_MS sin nuevos bytes.
     * @type {number|null}
     */
    this.lineTimeoutTimerId = null;
    /**
     * Marca si ya se emitió `device_banner` para no spamearlo (sólo se
     * espera UN banner por sesión de conexión).
     */
    this._bannerEmitted = false;
    /**
     * Flag de cancelación del bucle de reconexión. `disconnect()` lo pone a
     * true para garantizar que un `port.open` en vuelo no concluya como
     * conexión activa tras una desconexión explícita del usuario.
     */
    this._reconnectAborted = false;
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

  setDeviceState(nextState) {
    if (this.deviceState === nextState) return;
    this.deviceState = nextState;
    this.emit('device_state_change', {
      state: nextState,
      firmwareVersion: this.firmwareVersion,
      hmacEnabled: this.hmacEnabled
    });
  }

  _clearDeviceTimers() {
    if (this.heartbeatTimerId) {
      clearTimeout(this.heartbeatTimerId);
      this.heartbeatTimerId = null;
    }
    if (this.initTimeoutId) {
      clearTimeout(this.initTimeoutId);
      this.initTimeoutId = null;
    }
    if (this.lineTimeoutTimerId) {
      clearInterval(this.lineTimeoutTimerId);
      this.lineTimeoutTimerId = null;
    }
  }

  /**
   * Arranca un interval periódico que vacía el buffer si lleva más de
   * LINE_TIMEOUT_MS sin recibir bytes (firmware corrupto o cuelgue).
   * @private
   */
  _armLineTimeoutWatchdog() {
    if (this.lineTimeoutTimerId) {
      clearInterval(this.lineTimeoutTimerId);
    }
    this.lineTimeoutTimerId = setInterval(() => {
      if (this.buffer.length === 0 || !this.lastByteAt) {
        return;
      }
      if (Date.now() - this.lastByteAt > LINE_TIMEOUT_MS) {
        const dropped = this.buffer.length;
        this.buffer = '';
        this.lastByteAt = null;
        this.emit('error', {
          message: 'Línea serial incompleta descartada por timeout',
          details: `${dropped} bytes pendientes sin newline en ${LINE_TIMEOUT_MS}ms`,
          type: 'line_timeout'
        });
      }
    }, LINE_TIMEOUT_CHECK_INTERVAL_MS);
  }

  _armHeartbeatWatchdog() {
    if (this.heartbeatTimerId) {
      clearTimeout(this.heartbeatTimerId);
    }
    this.heartbeatTimerId = setTimeout(() => {
      if (this.deviceState === 'ready') {
        this.setDeviceState('stale');
      }
    }, HEARTBEAT_TIMEOUT_MS);
  }

  _armInitTimeout() {
    if (this.initTimeoutId) {
      clearTimeout(this.initTimeoutId);
    }
    this.initTimeoutId = setTimeout(() => {
      if (this.deviceState === 'initializing') {
        this.setDeviceState('stale');
      }
    }, INIT_TIMEOUT_MS);
  }

  async connect() {
    if (!this.isSupported()) {
      this.setStatus('unsupported');
      throw new Error('Web Serial API no soportada en este navegador');
    }

    if (this.port || this._connectInProgress) {
      return;
    }

    this._connectInProgress = true;
    try {
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
    } finally {
      this._connectInProgress = false;
    }
    // Tras conectar, recuperar scans pendientes de sesiones previas (F5 / cierre).
    this.hydratePendingScansFromStorage().catch(() => {});
  }

  handleDisconnect = () => {
    if (!this.autoReconnectEnabled) {
      return;
    }

    this.stopReading();
    this._clearDeviceTimers();
    this.firmwareVersion = null;
    this.hmacEnabled = false;
    this.setDeviceState('unknown');
    this.lastPort = this.port;
    this.port = null;
    // Cada desconexión empieza con presupuesto fresco de reintentos
    this.reconnectAttempts = 0;
    this.setStatus('disconnected', 'device_disconnected');

    if (navigator.serial?.removeEventListener && this.hasSerialDisconnectListener) {
      navigator.serial.removeEventListener('disconnect', this.handleDisconnect);
      this.hasSerialDisconnectListener = false;
    }

    // Intentar reconectar automáticamente
    this.attemptReconnect();
  };

  /**
   * Sleep cancelable con setTimeout. La promesa se resuelve cuando expira
   * el delay; si `_reconnectAborted` se activa antes, el caller comprueba
   * el flag y aborta el siguiente paso del bucle.
   *
   * @param {number} ms
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => {
      this.reconnectTimerId = setTimeout(() => {
        this.reconnectTimerId = null;
        resolve();
      }, ms);
    });
  }

  /**
   * Intenta UNA reconexión: busca un puerto autorizado y lo abre.
   * Aborta limpiamente si `_reconnectAborted` se activa entre fases.
   *
   * @returns {Promise<'success'|'no_port'|'aborted'|'error'>}
   * @private
   */
  async _attemptReconnectOnce() {
    let ports;
    try {
      ports = await navigator.serial.getPorts();
    } catch {
      return 'error';
    }

    const portToTry = ports.find(p => p === this.lastPort) || ports[0];
    if (!portToTry) {
      return 'no_port';
    }

    try {
      this.port = portToTry;
      await this.port.open({ baudRate: DEFAULT_BAUD_RATE });
    } catch {
      this.port = null;
      return 'error';
    }

    if (this._reconnectAborted || !this.autoReconnectEnabled) {
      try {
        await this.port.close();
      } catch {
        // Best effort.
      }
      this.port = null;
      return 'aborted';
    }

    this.setStatus('connected');
    this.reconnectAttempts = 0;
    this.startReading();
    return 'success';
  }

  /**
   * Bucle iterativo de reconexión con backoff exponencial. Reemplaza la
   * versión recursiva previa que podía ejecutar varios intentos en
   * paralelo si `setTimeout` solapaba con un nuevo trigger.
   *
   * Comprueba `_reconnectAborted` en cada iteración para que un
   * `disconnect()` durante el reintento no concluya con port.open exitoso
   * tras la desconexión.
   *
   * @returns {Promise<void>}
   */
  async attemptReconnect() {
    if (this.reconnecting || !this.autoReconnectEnabled) {
      return;
    }
    this.reconnecting = true;
    this._reconnectAborted = false;

    try {
      while (
        this.autoReconnectEnabled &&
        !this._reconnectAborted &&
        this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS
      ) {
        this.reconnectAttempts += 1;
        this.setStatus('reconnecting', { attempt: this.reconnectAttempts });

        const delay = RECONNECT_DELAY_BASE_MS * Math.pow(2, this.reconnectAttempts - 1);
        await this._sleep(delay);

        if (this._reconnectAborted || !this.autoReconnectEnabled) {
          return;
        }

        const outcome = await this._attemptReconnectOnce();
        if (outcome === 'success' || outcome === 'aborted') {
          return;
        }
      }

      if (
        this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS &&
        !this._reconnectAborted
      ) {
        this.emit('error', {
          message: 'Máximo de intentos de reconexión alcanzado',
          details: 'Por favor, reconecta el sensor manualmente.'
        });
      }
    } finally {
      this.reconnecting = false;
    }
  }

  async disconnect() {
    this.autoReconnectEnabled = false;
    this._reconnectAborted = true;
    this.reconnecting = false;
    this.reconnectAttempts = 0;

    if (this.reconnectTimerId) {
      clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }

    await this.stopReading();
    this._clearDeviceTimers();
    this.firmwareVersion = null;
    this.hmacEnabled = false;
    this.setDeviceState('unknown');

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
    this._bannerEmitted = false;
    this.lastByteAt = null;
    this.setStatus('reading');
    this.setDeviceState('initializing');
    this._armInitTimeout();
    this._armLineTimeoutWatchdog();

    // `fatal: false` evita que un byte UTF-8 inválido del firmware (boot
    // ruidoso, fluctuación eléctrica) tire toda la pipeline de lectura.
    // En su lugar, el decodificador inserta U+FFFD y seguimos leyendo;
    // el parser de líneas descarta el fragmento corrupto y conserva el
    // siguiente JSON válido. Sin este flag, una sola excepción hacía
    // necesario reconectar el sensor manualmente.
    const textDecoder = new TextDecoderStream('utf-8', { fatal: false });
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.lastByteAt = Date.now();
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
      this._clearDeviceTimers();
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
    // Protección contra buffer overflow (datos sin newline del sensor corrupto)
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.emit('error', {
        message: 'Buffer serial desbordado, reiniciando',
        details: `${this.buffer.length} bytes descartados`
      });
      this.buffer = '';
      return;
    }

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      // El firmware emite un banner de boot en texto plano antes del primer
      // JSON (rfid_scanner/src/main.cpp:16). Lo silenciamos como "banner"
      // y no como error para no asustar a la UI en cada conexión.
      if (BOOT_BANNER_REGEX.test(trimmed)) {
        if (!this._bannerEmitted) {
          this._bannerEmitted = true;
          this.emit('device_banner', { line: trimmed });
        }
        return;
      }

      if (!trimmed.startsWith('{')) {
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
    if (!event?.event) {
      return;
    }

    switch (event.event) {
      case 'card_detected':
        this._handleCardDetected(event);
        break;
      case 'card_removed': {
        const removedUid = String(event.uid || '').trim().toUpperCase();
        // Invalidar el cooldown de dedupe del UID retirado: una retirada REAL de
        // la carta no es chattering del RC522, así que el próximo acercamiento —
        // aunque ocurra en <DEDUPE_MS— es una lectura legítima que NO debe
        // tragarse. Sin esto, si el niño levanta y reacerca la misma carta rápido
        // (Secuencia con carta repetida, reintento tras fallo), el 2º escaneo se
        // descartaba en silencio y parecía que el juego "no reacciona".
        if (removedUid) {
          this.lastScanByUid.delete(removedUid);
        }
        this.emit('card_removed', { uid: removedUid });
        break;
      }
      case 'init':
        // Modo seguro: el init de éxito incluye `hmac:"enabled"` cuando el
        // firmware firma cada scan. Lo capturamos ANTES de emitir para que
        // tanto `device_init` como el `device_state_change` posterior lo lleven.
        this.hmacEnabled = event.hmac === 'enabled';
        this.emit('device_init', {
          status: event.status,
          version: event.version,
          hmacEnabled: this.hmacEnabled
        });
        if (this.initTimeoutId) {
          clearTimeout(this.initTimeoutId);
          this.initTimeoutId = null;
        }
        if (event.status === 'success') {
          this.firmwareVersion = event.version || null;
          this.setDeviceState('ready');
          this._armHeartbeatWatchdog();
        } else if (event.status === 'starting') {
          // El firmware (v1.1) emite un init "starting" antes del "success".
          // Es arranque normal, no un fallo: estado de inicialización + re-armar timeout.
          this.setDeviceState('initializing');
          this._armInitTimeout();
        } else {
          this.setDeviceState('error');
        }
        break;
      case 'error':
        this.emit('device_error', {
          type: event.type,
          message: event.message
        });
        if (event.type === 'init_failure') {
          this.setDeviceState('error');
        }
        break;
      case 'status':
        this.emit('device_status', {
          uptime: event.uptime,
          cardsDetected: event.cards_detected,
          freeHeap: event.free_heap
        });
        if (this.deviceState === 'ready' || this.deviceState === 'stale') {
          this.setDeviceState('ready');
          this._armHeartbeatWatchdog();
        }
        break;
      default:
        this.emit('error', {
          message: 'Evento RFID desconocido del sensor',
          details: `event.event = "${event.event}"`
        });
        break;
    }
  }

  _handleCardDetected(event) {
    const uid = String(event.uid || '').trim().toUpperCase();
    if (!uid) {
      return;
    }

    // Validar formato (8 ó 14 hex) — el firmware en su path de fallback
    // anticollision crudo no garantiza CRC, así que filtramos UIDs corruptos.
    if (!UID_FORMAT_REGEX.test(uid)) {
      this.emit('device_error', {
        type: 'invalid_uid',
        message: `UID con formato inválido: ${uid}`
      });
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

    // T-905 B8: adjuntar la firma anti-replay del firmware si la trama la trae.
    // Solo si AMBOS campos llegan bien formados — el backend rechazaría un parcial.
    // El UID ya va canónico en mayúsculas (igual que el firmware firma), así que
    // el HMAC recalculado en el servidor coincide.
    if (Number.isInteger(event.counter) && /^[0-9a-f]{64}$/i.test(event.hmac || '')) {
      payload.counter = event.counter;
      payload.hmac = String(event.hmac).toLowerCase();
    }

    this.emit('scan', payload);

    if (!this.forwardToServer) {
      return;
    }

    if (socketService.isGameSocketConnected()) {
      this.flushPendingScans();

      try {
        socketService.emitGameFireAndForget('rfid_scan_from_client', payload);
      } catch (error) {
        this.enqueuePendingScan(payload);
        this.emit('error', {
          message: 'Error enviando evento RFID al servidor',
          details: error?.message
        });
      }
      return;
    }

    this.enqueuePendingScan(payload);
  }

  enqueuePendingScan(payload) {
    const now = Date.now();
    this.prunePendingScans(now);

    this.pendingScans.push({ payload, queuedAt: now, persistedId: null });

    while (this.pendingScans.length > MAX_PENDING_SCANS) {
      this.pendingScans.shift();
    }

    // Persistencia best-effort en IndexedDB para sobrevivir a F5 o pérdida
    // de conexión larga; el pendingScans en memoria sigue siendo el primario.
    pendingScansStore
      .add(payload)
      .then(persistedId => {
        if (persistedId !== null && persistedId !== undefined) {
          const entry = this.pendingScans.find(p => p.payload === payload);
          if (entry) {
            entry.persistedId = persistedId;
          }
        }
        return persistedId;
      })
      .catch(() => {
        // IDB no disponible (modo incógnito, etc.) — degradación silenciosa.
      });

    this.emit('queue_status', {
      pending: this.pendingScans.length
    });
  }

  prunePendingScans(now = Date.now()) {
    if (this.pendingScans.length === 0) {
      return;
    }

    this.pendingScans = this.pendingScans.filter(
      item => now - item.queuedAt <= PENDING_SCAN_TTL_MS
    );
  }

  /**
   * Descarta los scans cuyo `timestamp` cae fuera de la ventana de frescura
   * del backend (>STALE_SCAN_THRESHOLD_MS). Reenviarlos sería un rechazo
   * garantizado, así que los borramos localmente (memoria + IndexedDB) y
   * emitimos `scan_expired` por cada uno para dar feedback a la UI.
   *
   * Se ejecuta justo antes del flush para no enviar scans condenados.
   *
   * @param {number} [now]
   * @private
   */
  discardStalePendingScans(now = Date.now()) {
    if (this.pendingScans.length === 0) {
      return;
    }

    const fresh = [];
    for (const entry of this.pendingScans) {
      if (now - entry.payload.timestamp > STALE_SCAN_THRESHOLD_MS) {
        if (entry.persistedId !== null && entry.persistedId !== undefined) {
          pendingScansStore.remove(entry.persistedId).catch(() => {});
        }
        this.emit('scan_expired', { uid: entry.payload.uid });
      } else {
        fresh.push(entry);
      }
    }
    this.pendingScans = fresh;
  }

  flushPendingScans() {
    if (!socketService.isGameSocketConnected()) {
      return { sent: 0, pending: this.pendingScans.length };
    }

    this.prunePendingScans();
    this.discardStalePendingScans();

    let sent = 0;
    while (this.pendingScans.length > 0 && socketService.isGameSocketConnected()) {
      const next = this.pendingScans[0];

      try {
        socketService.emitGameFireAndForget('rfid_scan_from_client', next.payload);
        this.pendingScans.shift();
        sent += 1;
        // Eliminar el entry persistido en IDB (best-effort).
        if (next.persistedId !== null && next.persistedId !== undefined) {
          pendingScansStore.remove(next.persistedId).catch(() => {});
        }
      } catch {
        break;
      }
    }

    this.emit('queue_flush', {
      sent,
      pending: this.pendingScans.length
    });

    return { sent, pending: this.pendingScans.length };
  }

  /**
   * Recupera scans persistidos en IndexedDB y los mergea con el buffer
   * en memoria. Llamar tras `connect()` para resucitar scans pendientes
   * de una sesión previa (recarga de página o desconexión larga).
   *
   * @returns {Promise<number>} Número de scans recuperados.
   */
  async hydratePendingScansFromStorage() {
    try {
      await pendingScansStore.purgeOlderThan(PENDING_SCAN_PERSISTENCE_TTL_MS);
      const persisted = await pendingScansStore.getAll();
      const knownIds = new Set(
        this.pendingScans.flatMap(p => p.persistedId !== null && p.persistedId !== undefined ? [p.persistedId] : [])
      );
      let added = 0;
      for (const entry of persisted) {
        if (this.pendingScans.length >= MAX_PENDING_SCANS) {
          break;
        }
        if (!knownIds.has(entry.id)) {
          this.pendingScans.push({
            payload: entry.payload,
            queuedAt: entry.queuedAt,
            persistedId: entry.id
          });
          added += 1;
        }
      }
      if (added > 0) {
        this.emit('queue_status', { pending: this.pendingScans.length });
      }
      return added;
    } catch {
      return 0;
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

// ---------------------------------------------------------------------------
// Helper de simulación para QA / desarrollo sin sensor físico
// ---------------------------------------------------------------------------
// Expone `window.__rfidSim` que inyecta eventos en el mismo punto que el
// firmware real (`handleRawEvent`), de modo que recorran el pipeline
// completo (validación de UID, dedupe, persistencia IDB, forwarding a
// socket). Sólo se monta en builds no-production para no exponer un canal
// de inyección en producción.
//
// Uso desde DevTools:
//   __rfidSim.init();                          // emula el handshake del sensor
//   __rfidSim.detect('04A1B2C3', 'MIFARE_1KB'); // emula card_detected
//   __rfidSim.heartbeat();                     // mantiene deviceState='ready'
//   __rfidSim.removed('04A1B2C3');             // emula card_removed
if (typeof globalThis !== 'undefined' && typeof window !== 'undefined') {
  const env = (import.meta?.env?.MODE || import.meta?.env?.NODE_ENV || 'development').toLowerCase();
  if (env !== 'production') {
    // QA del enforcement HMAC (T-905 B8) sin firmware real. El secret se inyecta
    // en runtime (__rfidSim.setSecret), NUNCA va en el bundle. Dev-only.
    const SIM_SENSOR_ID = 'sensor-sim-dev';
    const SIM_COUNTER_KEY = 'rfid-sim-counter';
    // El secret SOLO se inyecta en runtime vía __rfidSim.setSecret() — nunca desde
    // una env var (evita cualquier riesgo de embeberlo en el bundle).
    let simSecret = null;

    const simNextCounter = () => {
      let n = Number.parseInt(globalThis.localStorage?.getItem(SIM_COUNTER_KEY) || '0', 10);
      if (!Number.isFinite(n) || n < 0) n = 0;
      n += 1;
      try { globalThis.localStorage?.setItem(SIM_COUNTER_KEY, String(n)); } catch { /* best-effort */ }
      return n;
    };

    const simSign = async (uidUpper, counter) => {
      const enc = new TextEncoder();
      const key = await globalThis.crypto.subtle.importKey(
        'raw', enc.encode(simSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(`${uidUpper}:${counter}`));
      return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
    };

    window.__rfidSim = Object.freeze({
      setSecret(secret) {
        simSecret = String(secret || '').trim() || null;
        // eslint-disable-next-line no-console -- helper de QA dev-only
        console.info('[__rfidSim] secret HMAC cargado; detect() firmará los scans.');
      },
      init() {
        // sensorId dedicado: aísla el counter del simulador del sensor físico.
        webSerialService.sensorId = SIM_SENSOR_ID;
        webSerialService.handleRawEvent({ event: 'init', status: 'success', version: 'sim-1.0' });
      },
      async detect(uid, type = 'MIFARE_1KB') {
        const normalizedUid = String(uid || '').trim().toUpperCase();
        if (!normalizedUid) {
          console.warn('[__rfidSim] detect() llamado sin UID válido — scan ignorado.');
          return;
        }
        // QA 2026-05-06: si `init()` no se llamó previamente o el sensor
        // está en estado distinto de 'ready', el `_handleCardDetected` no
        // forwardea el scan al socket (queda encolado en `pendingScans`).
        // Avisamos al QA en consola para evitar la confusión "el detect no
        // hace nada" — antes había que adivinarlo del flujo.
        if (webSerialService.deviceState !== 'ready') {
          console.warn(
            '[__rfidSim] El sensor simulado no está en estado "ready". Llama __rfidSim.init() antes de detect(), o el scan se encolará en pendingScans.'
          );
        }
        const raw = { event: 'card_detected', uid: normalizedUid, type };
        // Con secret cargado, firmamos como el firmware (UID mayúsculas + counter).
        if (simSecret) {
          const counter = simNextCounter();
          raw.counter = counter;
          raw.hmac = await simSign(normalizedUid, counter);
        } else {
          console.warn(
            '[__rfidSim] Sin secret. Con RFID_HMAC_ENABLED=true el scan será rechazado. Llama __rfidSim.setSecret("<secret>") primero.'
          );
        }
        webSerialService.handleRawEvent(raw);
      },
      removed(uid) {
        webSerialService.handleRawEvent({
          event: 'card_removed',
          uid: String(uid || '').trim().toUpperCase()
        });
      },
      heartbeat() {
        webSerialService.handleRawEvent({
          event: 'status',
          // ms desde la carga de la página, análogo al millis() del firmware
          // (NO Date.now(): epoch daría un "uptime" de décadas en la UI).
          uptime: Math.floor(performance.now()),
          cards_detected: 0,
          free_heap: 32768
        });
      },
      // Devuelve un snapshot del estado interno para diagnóstico — útil
      // cuando un detect "no parece hacer nada" (encolado vs forwardado).
      status() {
        return {
          deviceState: webSerialService.deviceState,
          pendingScans: webSerialService.pendingScans.length,
          sensorId: webSerialService.sensorId,
          firmwareVersion: webSerialService.firmwareVersion
        };
      }
    });
  }
}
