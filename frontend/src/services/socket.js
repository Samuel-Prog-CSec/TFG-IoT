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
const RECONNECTION_DELAY_MAX = 15000;
const CONNECTION_TIMEOUT = 10000; // 10 segundos timeout para conexión inicial
const IS_DEV = import.meta.env.DEV;

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
  ERROR: 'error',
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
    /** Listeners registrados en el socket de juego */
    this.gameListeners = new Map();
    this._wasConnected = false;
  }

  // ============================================
  // Opciones de conexión compartidas
  // ============================================

  /**
   * Genera las opciones de conexión compartidas entre namespaces
   * @param {string} token - Token de autenticación
   * @returns {Object}
   * @private
   */
  _connectionOptions(token) {
    return {
      auth: { token },
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
   * @returns {Promise<void>}
   */
  connect() {
    // Si ya están ambos conectados, no hacer nada
    if (this.socket?.connected && this.gameSocket?.connected) {
      return Promise.resolve();
    }

    const token = getAccessToken();
    const opts = this._connectionOptions(token);

    // --- Socket de sistema (namespace /) ---
    const systemPromise = this._connectNamespace('system', SOCKET_URL, opts);

    // --- Socket de juego (namespace /game) ---
    const gamePromise = this._connectNamespace('game', `${SOCKET_URL  }/game`, opts);

    return Promise.all([systemPromise, gamePromise]).then(() => undefined);
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

      // Reconectar socket existente o crear uno nuevo
      if (this[prop]) {
        this[prop].auth = { token: opts.auth.token };
        this[prop].connect();
      } else {
        this[prop] = io(url, opts);
      }

      const sock = this[prop];
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
        }
      });

      // Error de conexión
      sock.on('connect_error', (error) => {
        socketLog('error', `${tag} Error de conexión:`, error.message);

        if (isSystem) {
          this.isConnected = false;

          // Error de auth → evento global
          if (error.message?.includes('auth') || error.message?.includes('token')) {
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

    // Limpiar socket de juego
    if (this.gameSocket) {
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
  }

  /**
   * Actualizar token de autenticación en ambos namespaces
   * @param {string} token - Nuevo access token
   */
  updateAuth(token) {
    if (this.socket) {
      this.socket.auth = { token };
      if (this.socket.connected) {
        this.socket.disconnect();
        this.socket.connect();
      }
    }
    if (this.gameSocket) {
      this.gameSocket.auth = { token };
      if (this.gameSocket.connected) {
        this.gameSocket.disconnect();
        this.gameSocket.connect();
      }
    }
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
    if (!this.socket) {
      return;
    }

    this.socket.on(event, callback);

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * Desuscribirse de un evento del namespace de sistema
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Callback a remover (opcional, si no se pasa, remueve todos)
   */
  off(event, callback) {
    if (!this.socket) return;

    if (callback) {
      this.socket.off(event, callback);
      const callbacks = this.listeners.get(event);
      if (!callbacks) {
        return;
      }

      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    } else {
      this.socket.off(event);
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
    if (!this.gameSocket) {
      return;
    }

    this.gameSocket.on(event, callback);

    if (!this.gameListeners.has(event)) {
      this.gameListeners.set(event, new Set());
    }
    this.gameListeners.get(event).add(callback);
  }

  /**
   * Desuscribirse de un evento del namespace de juego
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Callback a remover (opcional, si no se pasa, remueve todos)
   */
  offGame(event, callback) {
    if (!this.gameSocket) return;

    if (callback) {
      this.gameSocket.off(event, callback);
      const callbacks = this.gameListeners.get(event);
      if (!callbacks) {
        return;
      }

      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.gameListeners.delete(event);
      }
    } else {
      this.gameSocket.off(event);
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
