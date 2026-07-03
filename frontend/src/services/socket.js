/**
 * @fileoverview Servicio de WebSocket para comunicación en tiempo real
 * Maneja conexión Socket.IO, autenticación y eventos de sesión
 * 
 * @module services/socket
 */

import { io } from 'socket.io-client';
import { getAccessToken, AUTH_EVENTS } from './api';

// ============================================
// CONFIGURACIÓN
// ============================================

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const RECONNECTION_ATTEMPTS = 15;
const RECONNECTION_DELAY = 1000;
// Tope del backoff: bajado de 15s a 5s para reaccionar antes a redeploys cloud.
// 15 intentos × 5s ≈ 1 minuto de window de reconexión, cubre rolling deploys Koyeb.
const RECONNECTION_DELAY_MAX = 5000;
const CONNECTION_TIMEOUT = 10000; // 10 segundos timeout para conexión inicial
/**
 * Intervalo del heartbeat de modo RFID. El backend lo usa para refrescar
 * el watchdog que libera modos abandonados; debe ser cómodamente menor
 * que `RFID_MODE_IDLE_TIMEOUT_MS` (5 min en backend).
 */
const RFID_HEARTBEAT_INTERVAL_MS = 60_000;
const IS_DEV = import.meta.env.DEV;

/**
 * Códigos de error de handshake (de `makeAuthError` en el backend) que implican
 * que la sesión ya no es válida → forzar logout. `ORIGIN_INVALID` (config) y
 * `CONNECTION_LIMIT` (transitorio) se excluyen: no significan "sesión caducada".
 */
const AUTH_ERROR_CODES = new Set([
  'TOKEN_MISSING',
  'TOKEN_INVALID',
  'USER_NOT_FOUND',
  'USER_INACTIVE',
  'ACCOUNT_NOT_APPROVED',
  'SESSION_INVALID',
  'AUTH_FAILED',
]);

const socketLog = (level, ...args) => {
  if (!IS_DEV || typeof console === 'undefined') {
    return;
  }

  // eslint-disable-next-line no-console -- dev-only dynamic log level
  const logger = console[level] || console.warn;
  logger(...args);
};

// ============================================
// EVENTOS SOCKET — por namespace
// ============================================

/** Eventos del namespace por defecto `/` (sistema) */
export const SYSTEM_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  SESSION_INVALIDATED: 'session_invalidated',
  RFID_MODE_CHANGED: 'rfid_mode_changed',
};

/** Eventos del namespace `/game` (gameplay) */
export const GAME_EVENTS = {
  // Cliente → Servidor
  JOIN_PLAY: 'join_play',
  LEAVE_PLAY: 'leave_play',
  START_PLAY: 'start_play',
  PAUSE_PLAY: 'pause_play',
  RESUME_PLAY: 'resume_play',
  NEXT_ROUND: 'next_round',
  PLAY_STATE_SYNC: 'play_state_sync',
  BOARD_READY: 'board_ready',
  JOIN_CARD_ASSIGNMENT: 'join_card_assignment',
  LEAVE_CARD_ASSIGNMENT: 'leave_card_assignment',
  RFID_SCAN_FROM_CLIENT: 'rfid_scan_from_client',
  RFID_MODE_HEARTBEAT: 'rfid_mode_heartbeat',
  // Servidor → Cliente
  PLAY_STATE: 'play_state',
  NEW_ROUND: 'new_round',
  MEMORY_TURN_STATE: 'memory_turn_state',
  VALIDATION_RESULT: 'validation_result',
  GAME_OVER: 'game_over',
  PLAY_INTERRUPTED: 'play_interrupted',
  PLAY_PAUSED: 'play_paused',
  PLAY_RESUMED: 'play_resumed',
  SCAN_IGNORED: 'scan_ignored',
  RFID_EVENT: 'rfid_event',
  RFID_STATUS: 'rfid_status',
  // Rechazos de escaneo por seguridad (firma HMAC inválida / replay de
  // contador). El backend emite este evento SOLO para RFID_HMAC_INVALID y
  // COUNTER_REPLAY, separado del genérico `error`.
  RFID_SCAN_ERROR: 'rfid_scan_error',
  ERROR: 'error',
  // Mecánica Secuencia (T-921). Server → cliente.
  SEQUENCE_PHASE_MEMORIZING: 'sequence_phase_memorizing',
  SEQUENCE_PHASE_REPRODUCING: 'sequence_phase_reproducing',
  SEQUENCE_CARD_RESULT: 'sequence_card_result',
  SEQUENCE_ROUND_RESULT: 'sequence_round_result',
};

/** Merge de ambos para retrocompatibilidad */
export const SOCKET_EVENTS = { ...SYSTEM_EVENTS, ...GAME_EVENTS };

// ============================================
// CLASE SOCKET SERVICE
// ============================================

class SocketService {
  constructor() {
    /** Socket del namespace por defecto `/` (eventos de sistema) */
    this.socket = null;
    /** Socket del namespace `/game` (eventos de gameplay) */
    this.gameSocket = null;
    this.isConnected = false;
    /** Listeners registrados en el socket de sistema */
    this.listeners = new Map();
    /**
     * Listeners registrados vía `on()` ANTES de que el socket de sistema exista
     * (race del render inicial: el effect de `useNotifications` corre antes que
     * `connect()` cree el socket). Sin esto se descartaban en silencio y las
     * notificaciones push no llegaban en tiempo real. Se aplican en
     * `_connectNamespace` en cuanto el socket de sistema se crea.
     * @type {Array<{event: string, callback: Function}>}
     */
    this.pendingListeners = [];
    /** Listeners registrados en el socket de juego */
    this.gameListeners = new Map();
    /**
     * Listeners registrados vía `onGame()` ANTES de que el socket de juego
     * exista (mismo race que `pendingListeners` en el namespace de sistema: si
     * se registran antes de `connect()`, el `if (!this.gameSocket) return` los
     * descartaba en silencio y el gameplay se quedaba sin eventos en tiempo real
     * sin error visible). Se aplican en `_connectNamespace` al crear el socket
     * de juego.
     * @type {Array<{event: string, callback: Function}>}
     */
    this.pendingGameListeners = [];
    this._wasConnected = false;
    /**
     * Igual que `_wasConnected` pero para el socket de /game. Al ser una
     * conexión io() independiente, puede reconectar por su cuenta; este flag
     * distingue la PRIMERA conexión de una RECONEXIÓN para, en esta última,
     * re-registrar el modo RFID gameplay (ver `_connectNamespace`).
     */
    this._wasGameConnected = false;
    /** Timer del heartbeat de modo RFID (refresca watchdog del backend). */
    this._rfidHeartbeatTimerId = null;
    /**
     * B.8 (pre-v1.0.0): timer de refresh proactivo del JWT. Se programa
     * tras cada `connect` exitoso del socket de sistema y se cancela en
     * `disconnect()`. Evita que el token expire silenciosamente durante
     * partidas largas (>15 min) sin que el cliente lo sepa.
     */
    this._proactiveRefreshTimerId = null;
    /**
     * Promise del `connect()` en vuelo. Evita handshakes paralelos cuando
     * dos llamadores casi-simultáneos invocan connect() (ej. login +
     * useGameSocket inmediatamente después de la redirección post-login).
     * Ver BUG-WS-1 en memoria del proyecto.
     */
    this._connectPromise = null;
  }

  /**
   * Refresco proactivo del socket — DESACTIVADO (consolidación de cadenas).
   *
   * `AuthContext.scheduleTokenRefresh` es ahora el ÚNICO refresco proactivo:
   * refresca con un lead mayor (≈5 min vs el 1 min de aquí) y propaga el token
   * nuevo al socket vía `socketService.updateAuth`, de modo que el socket
   * siempre tiene un token fresco para el siguiente handshake de reconexión.
   * El refresco proactivo propio del socket era redundante — un segundo POST
   * `/auth/refresh` por ciclo de token, desincronizado del de AuthContext y
   * consumiendo cuota del rate-limit del refresh. El path reactivo (interceptor
   * 401) sigue siendo el fallback si algo fallara. Se conserva el método como
   * no-op para no tocar los puntos de llamada de connect/disconnect.
   * @private
   */
  _scheduleProactiveRefresh() {
    // Intencionalmente vacío — ver doc arriba.
  }

  /**
   * B.8: cancela el timer de refresh proactivo. Se llama en disconnect().
   * @private
   */
  _cancelProactiveRefresh() {
    if (this._proactiveRefreshTimerId) {
      clearTimeout(this._proactiveRefreshTimerId);
      this._proactiveRefreshTimerId = null;
    }
  }

  /**
   * Inicia el heartbeat periódico que refresca el watchdog del modo RFID
   * en el backend. Idempotente: si ya está corriendo, no duplica.
   * @private
   */
  _startRfidHeartbeat() {
    if (this._rfidHeartbeatTimerId || !this.gameSocket) {
      return;
    }

    this._rfidHeartbeatTimerId = setInterval(() => {
      if (!this.gameSocket?.connected) {
        return;
      }
      // volatile: si el socket cae justo entre intervals, no encolamos.
      this.gameSocket.volatile.emit(GAME_EVENTS.RFID_MODE_HEARTBEAT);
    }, RFID_HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Detiene el heartbeat de modo RFID.
   * @private
   */
  _stopRfidHeartbeat() {
    if (this._rfidHeartbeatTimerId) {
      clearInterval(this._rfidHeartbeatTimerId);
      this._rfidHeartbeatTimerId = null;
    }
  }

  // ============================================
  // Opciones de conexión compartidas
  // ============================================

  /**
   * Genera las opciones de conexión compartidas entre namespaces.
   *
   * BUG-WS-1 (~0.6 reconexiones/navegación documentadas en memoria 2026-05-14):
   * `auth` se entrega como **función** en lugar de objeto estático para que
   * socket.io-client llame a `getAccessToken()` en CADA intento de handshake
   * (conexión inicial y cada reconexión). Antes, con `{ token }` estático,
   * tras un `/auth/refresh` el access token rotaba pero el socket usaba
   * el token original en sus reconnects → `SESSION_MISMATCH` server-side →
   * `io server disconnect` → reconexión forzada. Con la forma funcional el
   * socket nunca queda "anclado" a un token caducado.
   *
   * @returns {Object}
   * @private
   */
  _connectionOptions() {
    return {
      auth: cb => cb({ token: getAccessToken() }),
      reconnection: true,
      reconnectionAttempts: RECONNECTION_ATTEMPTS,
      reconnectionDelay: RECONNECTION_DELAY,
      reconnectionDelayMax: RECONNECTION_DELAY_MAX,
      transports: ['websocket', 'polling'],
    };
  }

  // ============================================
  // Conexión / Desconexión
  // ============================================

  /**
   * Conectar ambos namespaces (sistema y juego) al servidor WebSocket.
   * La promesa se resuelve cuando AMBOS están conectados.
   *
   * Idempotencia (BUG-WS-1): si ya hay un `connect()` en vuelo, devolvemos
   * la promesa existente en lugar de crear handshakes paralelos. Antes, dos
   * llamadores casi-simultáneos (ej. AuthContext.login + useGameSocket al
   * mismo tiempo durante la navegación post-login) abrían dos handshakes,
   * el server cerraba uno por SESSION_MISMATCH y veíamos `io server
   * disconnect` + reconexión inmediata.
   *
   * @returns {Promise<void>}
   */
  connect() {
    // Si ya están ambos conectados, no hacer nada
    if (this.socket?.connected && this.gameSocket?.connected) {
      return Promise.resolve();
    }

    // Si hay un connect() en vuelo, devolverlo: evita handshakes duplicados
    // que provocan SESSION_MISMATCH server-side.
    if (this._connectPromise) {
      return this._connectPromise;
    }

    const opts = this._connectionOptions();

    // --- Socket de sistema (namespace /) ---
    const systemPromise = this._connectNamespace('system', SOCKET_URL, opts);

    // --- Socket de juego (namespace /game) ---
    const gamePromise = this._connectNamespace('game', `${SOCKET_URL  }/game`, opts);

    this._connectPromise = Promise.all([systemPromise, gamePromise])
      .then(() => undefined)
      .finally(() => {
        this._connectPromise = null;
      });
    return this._connectPromise;
  }

  /**
   * Conecta (o reconecta) un namespace individual.
   * @param {'system'|'game'} ns - Nombre lógico del namespace
   * @param {string} url - URL completa del namespace
   * @param {Object} opts - Opciones de socket.io-client
   * @returns {Promise<void>}
   * @private
   */
  _connectNamespace(ns, url, opts) {
    const isSystem = ns === 'system';
    const prop = isSystem ? 'socket' : 'gameSocket';
    const tag = isSystem ? '[Socket]' : '[Socket/game]';

    return new Promise((resolve, reject) => {
      // Si ya está conectado, resolver inmediatamente
      if (this[prop]?.connected) {
        resolve();
        return;
      }

      // Reconectar socket existente o crear uno nuevo. Con `auth` funcional
      // (BUG-WS-1) no necesitamos asignar `sock.auth` manualmente: socket.io
      // llama al resolver en cada handshake.
      if (this[prop]) {
        this[prop].connect();
      } else {
        this[prop] = io(url, opts);
      }

      const sock = this[prop];

      // Aplicar listeners pendientes (registrados vía on() antes de que el socket
      // de sistema existiera — race del render inicial). Solo el namespace de
      // sistema usa on()/listeners; tras aplicarlos se vacía la cola para no
      // re-registrarlos en reconexiones (socket.io conserva los handlers).
      if (isSystem && this.pendingListeners.length > 0) {
        for (const pending of this.pendingListeners) {
          sock.on(pending.event, pending.callback);
        }
        this.pendingListeners = [];
      } else if (!isSystem && this.pendingGameListeners.length > 0) {
        // Aplicar listeners de juego registrados vía onGame() antes de que el
        // socket de /game existiera. Ya están en gameListeners (tracking); aquí
        // solo se enganchan al socket. Se vacía la cola para no re-registrarlos
        // en reconexiones (socket.io conserva los handlers).
        for (const pending of this.pendingGameListeners) {
          sock.on(pending.event, pending.callback);
        }
        this.pendingGameListeners = [];
      }
      // (F1) Al REUTILIZAR un socket existente (reconexión vía connect() explícito,
      // p. ej. remount de GameSession con WiFi inestable), sus handlers internos
      // previos siguen enganchados. Registrar de nuevo los de abajo sin quitarlos
      // acumulaba N handlers 'connect'/'disconnect'/'connect_error' → N eventos
      // 'game_socket_reconnected', N JOIN_PLAY + N requestPlayStateSync (que chocan
      // con el rate-limit) y N toasts. Los quitamos antes de re-registrar; NO afecta
      // a los listeners de usuario (van por otros eventos vía on()/onGame()).
      sock.off('connect');
      sock.off('connect_error');
      sock.off('disconnect');
      if (isSystem) {
        sock.off(SYSTEM_EVENTS.SESSION_INVALIDATED);
      }

      let timeoutId = null;
      let isResolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          sock.disconnect();
          this[prop] = null;
          reject(new Error(`Timeout de conexión WebSocket (${ns})`));
        }
      }, CONNECTION_TIMEOUT);

      // Conexión exitosa
      sock.on('connect', () => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          socketLog('warn', `${tag} Conectado:`, sock.id);

          if (isSystem) {
            this.isConnected = true;
            // B.8: arrancar timer de refresh proactivo JWT.
            this._scheduleProactiveRefresh();
          } else {
            // Arrancamos heartbeat de modo RFID en el namespace /game.
            this._startRfidHeartbeat();
          }
          resolve();
        }

        // Reconexión detectada (solo en el socket de sistema para emitir el evento global)
        if (isSystem) {
          if (this._wasConnected) {
            socketLog('warn', `${tag} Reconectado tras desconexión`);
            window.dispatchEvent(new CustomEvent('socket_reconnected'));
          }
          this._wasConnected = true;
        } else {
          // Reasegurar heartbeat tras reconexión.
          this._startRfidHeartbeat();

          // El socket de /game es una conexión io() independiente del de
          // sistema: puede caerse y reconectar (con un socket.id nuevo) sin que
          // el de sistema lo haga. Al desconectar el socket viejo, el backend
          // limpia su modo RFID gameplay (clearRfidModeState); el socket nuevo
          // debe re-emitir JOIN_PLAY para re-registrarlo. Sin esto, tras la
          // reconexión los escaneos del sensor y los taps del fallback táctil se
          // rechazan con RFID_MODE_INVALID ("El lector no está listo") hasta
          // recargar la página. Avisamos con un evento global que useGameSocket
          // escucha para re-unirse a la partida activa.
          if (this._wasGameConnected) {
            socketLog('warn', `${tag} Reconectado tras desconexión`);
            window.dispatchEvent(new CustomEvent('game_socket_reconnected'));
          }
          this._wasGameConnected = true;
        }
      });

      // Error de conexión
      sock.on('connect_error', (error) => {
        socketLog('error', `${tag} Error de conexión:`, error.message);

        if (isSystem) {
          this.isConnected = false;

          // Error de auth → evento global. El backend adjunta un `code` estable en
          // `error.data` (contrato con makeAuthError en socketHandlers). Antes se
          // comparaba `error.message` contra 'auth'/'token' en inglés, pero los
          // mensajes del handshake van en español ('Token inválido', 'Sesión
          // inválida'...) → el match nunca ocurría y el usuario quedaba en un bucle
          // de reconexión sin redirigir a login. Ahora decidimos por código.
          if (AUTH_ERROR_CODES.has(error?.data?.code)) {
            window.dispatchEvent(new CustomEvent(AUTH_EVENTS.UNAUTHORIZED));
          }
        }

        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(error);
        }
      });

      // Desconexión — solo el socket de sistema maneja reconexión forzada
      sock.on('disconnect', (reason) => {
        socketLog('warn', `${tag} Desconectado:`, reason);

        if (isSystem) {
          this.isConnected = false;
        } else {
          // El namespace /game cae: parar heartbeat hasta reconexión.
          this._stopRfidHeartbeat();
        }

        if (reason === 'io server disconnect') {
          sock.connect();
        }
      });

      // Evento de sesión invalidada — solo en el socket de sistema
      if (isSystem) {
        sock.on(SYSTEM_EVENTS.SESSION_INVALIDATED, (data) => {
          socketLog('warn', `${tag} Sesión invalidada:`, data);
          window.dispatchEvent(new CustomEvent(AUTH_EVENTS.SESSION_INVALIDATED, {
            detail: data
          }));
        });
      }
    });
  }

  /**
   * Desconectar ambos namespaces del servidor WebSocket
   */
  disconnect() {
    // Limpiar socket de sistema
    if (this.socket) {
      this.listeners.forEach((callbacks, event) => {
        callbacks.forEach((cb) => this.socket.off(event, cb));
      });
      this.listeners.clear();

      this.socket.off('connect');
      this.socket.off('connect_error');
      this.socket.off('disconnect');
      this.socket.off(SYSTEM_EVENTS.SESSION_INVALIDATED);

      this.socket.disconnect();
      this.socket = null;
    }

    // B.8: cancelar refresh proactivo al desconectar.
    this._cancelProactiveRefresh();

    // Limpiar socket de juego
    if (this.gameSocket) {
      this._stopRfidHeartbeat();

      this.gameListeners.forEach((callbacks, event) => {
        callbacks.forEach((cb) => this.gameSocket.off(event, cb));
      });
      this.gameListeners.clear();

      this.gameSocket.off('connect');
      this.gameSocket.off('connect_error');
      this.gameSocket.off('disconnect');

      this.gameSocket.disconnect();
      this.gameSocket = null;
    }

    this.isConnected = false;
    this._wasConnected = false;
    this._wasGameConnected = false;
    this._connectPromise = null;
  }

  /**
   * Actualizar token de autenticación en ambos namespaces.
   * Si el token no ha cambiado, no hace nada (evita reconectar innecesariamente).
   * Si el socket estaba conectado con un token distinto, se reconecta con el nuevo.
   * Si no estaba conectado aún, solo actualiza el auth y un `connect()` posterior
   * usará el token nuevo — evita el patrón conectar→disconnect→reconectar
   * observado al hacer login cuando el socket ya tenía un token viejo inyectado
   * del listener previo (QA 22/04/2026).
   */
  updateAuth(token) {
    // Con el `auth: cb => cb({ token: getAccessToken() })` funcional del
    // `_connectionOptions()`, el socket resuelve el token dinámicamente en
    // cada handshake — ya no es necesario sobreescribir `sock.auth` ni
    // forzar disconnect+connect aquí. `setTokens(token)` (caller anterior)
    // ya actualizó el getter al token nuevo, y cualquier reconnect futuro
    // lo usará automáticamente.
    //
    // Esta función queda como hook de cara a observabilidad (logging, métricas)
    // y para mantener su semántica explícita: "el token ha rotado". Si el
    // socket no estaba conectado, la próxima conexión usará el nuevo.
    //
    // Cuando el token cambia Y el socket está conectado, dejamos que el
    // server invalide vía SESSION_INVALIDATED o que el siguiente refresh
    // del backend acepte el sid actual; no forzamos disconnect — antes era
    // la causa del flicker conectado→desconectado→reconectado tras login.
    if (!this.socket && !this.gameSocket) {
      return;
    }
    socketLog('info', '[Socket] Token actualizado (auth dinámico)', {
      hasToken: Boolean(token),
    });
  }

  // ============================================
  // Métodos para el namespace de SISTEMA (/)
  // ============================================

  /**
   * Suscribirse a un evento del namespace de sistema
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Callback a ejecutar
   */
  on(event, callback) {
    // Registrar SIEMPRE en el tracking, aunque el socket aún no exista: así un
    // on() llamado durante el render inicial (antes de que connect() cree el
    // socket) NO se pierde — antes el `if (!this.socket) return` lo descartaba en
    // silencio y los push (p. ej. notification:created) no llegaban en vivo.
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    } else {
      // Pendiente: se aplica cuando _connectNamespace cree el socket de sistema.
      this.pendingListeners.push({ event, callback });
    }
  }

  /**
   * Desuscribirse de un evento del namespace de sistema
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Callback a remover (opcional, si no se pasa, remueve todos)
   */
  off(event, callback) {
    // Limpiar también pendientes (listeners aún no aplicados al socket): un
    // off() durante el render inicial, antes de que el socket exista, debe
    // poder cancelar una suscripción pendiente para no aplicarla luego.
    if (this.pendingListeners.length > 0) {
      this.pendingListeners = this.pendingListeners.filter(
        p => p.event !== event || (callback && p.callback !== callback)
      );
    }

    if (callback) {
      if (this.socket) {
        this.socket.off(event, callback);
      }
      const callbacks = this.listeners.get(event);
      if (!callbacks) {
        return;
      }

      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    } else {
      if (this.socket) {
        this.socket.off(event);
      }
      this.listeners.delete(event);
    }
  }

  /**
   * Emitir un evento en el namespace de sistema (con ACK)
   * @param {string} event - Nombre del evento
   * @param {*} data - Datos a enviar
   * @returns {Promise<*>} Respuesta del servidor
   */
  emit(event, data) {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Socket no conectado'));
        return;
      }

      this.socket.emit(event, data, (response) => {
        if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Emitir un evento en el namespace de sistema sin esperar ACK.
   * @param {string} event - Nombre del evento
   * @param {*} data - Datos a enviar
   */
  emitFireAndForget(event, data) {
    if (!this.socket?.connected) {
      throw new Error('Socket no conectado');
    }
    this.socket.emit(event, data);
  }

  /**
   * Envía un comando en el namespace de sistema sin ACK y retorna booleano.
   * @param {string} event
   * @param {*} data
   * @returns {boolean}
   */
  sendCommand(event, data) {
    if (!this.socket?.connected) {
      return false;
    }

    this.socket.emit(event, data);
    return true;
  }

  // ============================================
  // Métodos para el namespace de JUEGO (/game)
  // ============================================

  /**
   * Suscribirse a un evento del namespace de juego
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Callback a ejecutar
   */
  onGame(event, callback) {
    // Registrar SIEMPRE en el tracking, aunque el socket de juego aún no exista:
    // así un onGame() llamado antes de que connect() cree el socket de /game NO
    // se pierde (mismo race que on()/pendingListeners en sistema; antes el
    // `if (!this.gameSocket) return` lo descartaba en silencio y el gameplay se
    // quedaba sin eventos en tiempo real, sin error visible).
    if (!this.gameListeners.has(event)) {
      this.gameListeners.set(event, new Set());
    }
    this.gameListeners.get(event).add(callback);

    if (this.gameSocket) {
      this.gameSocket.on(event, callback);
    } else {
      // Pendiente: se aplica cuando _connectNamespace cree el socket de juego.
      this.pendingGameListeners.push({ event, callback });
    }
  }

  /**
   * Desuscribirse de un evento del namespace de juego
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Callback a remover (opcional, si no se pasa, remueve todos)
   */
  offGame(event, callback) {
    // Limpiar también pendientes (listeners aún no aplicados al socket de juego):
    // un offGame() antes de que el socket de /game exista debe poder cancelar una
    // suscripción pendiente para no aplicarla luego.
    if (this.pendingGameListeners.length > 0) {
      this.pendingGameListeners = this.pendingGameListeners.filter(
        p => p.event !== event || (callback && p.callback !== callback)
      );
    }

    if (callback) {
      if (this.gameSocket) {
        this.gameSocket.off(event, callback);
      }
      const callbacks = this.gameListeners.get(event);
      if (!callbacks) {
        return;
      }

      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.gameListeners.delete(event);
      }
    } else {
      if (this.gameSocket) {
        this.gameSocket.off(event);
      }
      this.gameListeners.delete(event);
    }
  }

  /**
   * Emitir un evento en el namespace de juego (con ACK)
   * @param {string} event - Nombre del evento
   * @param {*} data - Datos a enviar
   * @returns {Promise<*>} Respuesta del servidor
   */
  emitGame(event, data) {
    return new Promise((resolve, reject) => {
      if (!this.gameSocket?.connected) {
        reject(new Error('Socket de juego no conectado'));
        return;
      }

      this.gameSocket.emit(event, data, (response) => {
        if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Emitir un evento en el namespace de juego sin esperar ACK.
   * @param {string} event - Nombre del evento
   * @param {*} data - Datos a enviar
   */
  emitGameFireAndForget(event, data) {
    if (!this.gameSocket?.connected) {
      throw new Error('Socket de juego no conectado');
    }
    this.gameSocket.emit(event, data);
  }

  /**
   * Envía un comando en el namespace de juego sin ACK y retorna booleano.
   * @param {string} event
   * @param {*} data
   * @returns {boolean}
   */
  sendGameCommand(event, data) {
    if (!this.gameSocket?.connected) {
      return false;
    }

    this.gameSocket.emit(event, data);
    return true;
  }

  /**
   * Solicita al servidor el estado actual de una partida para sincronización tras reconexión.
   * Usa fire-and-forget porque el rate limiter no reenvía callbacks de ACK a los comandos.
   * La respuesta llega como evento `play_state` separado, que el listener existente maneja.
   * @param {string} playId - ID de la partida
   * @returns {boolean} true si se envió el evento
   */
  requestPlayStateSync(playId) {
    return this.sendGameCommand(GAME_EVENTS.PLAY_STATE_SYNC, { playId });
  }

  // ============================================
  // Utilidades
  // ============================================

  /**
   * Verificar si el socket de sistema está conectado
   * @returns {boolean}
   */
  isSocketConnected() {
    return this.socket?.connected || false;
  }

  /**
   * Verificar si el socket de juego está conectado
   * @returns {boolean}
   */
  isGameSocketConnected() {
    return this.gameSocket?.connected || false;
  }

  /**
   * Obtener ID del socket de sistema
   * @returns {string|null}
   */
  getSocketId() {
    return this.socket?.id || null;
  }

  /**
   * Obtener ID del socket de juego
   * @returns {string|null}
   */
  getGameSocketId() {
    return this.gameSocket?.id || null;
  }
}

// Exportar instancia singleton
export const socketService = new SocketService();
export default socketService;
