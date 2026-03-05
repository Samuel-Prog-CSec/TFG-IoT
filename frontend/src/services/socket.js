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
const RECONNECTION_ATTEMPTS = 5;
const RECONNECTION_DELAY = 1000;
const CONNECTION_TIMEOUT = 10000; // 10 segundos timeout para conexión inicial
const IS_DEV = import.meta.env.DEV;

const socketLog = (level, ...args) => {
  if (!IS_DEV || typeof console === 'undefined') {
    return;
  }

  const logger = console[level] || console.log;
  logger(...args);
};

// ============================================
// EVENTOS SOCKET
// ============================================

export const SOCKET_EVENTS = {
  // Conexión
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  
  // Sesión
  SESSION_INVALIDATED: 'session_invalidated',
  
  // RFID (para futuro uso)
  RFID_EVENT: 'rfid_event',
  RFID_STATUS: 'rfid_status',
  RFID_MODE_CHANGED: 'rfid_mode_changed',
  RFID_SCAN_FROM_CLIENT: 'rfid_scan_from_client',
  
  // Gameplay (para futuro uso)
  JOIN_PLAY: 'join_play',
  LEAVE_PLAY: 'leave_play',
  START_PLAY: 'start_play',
  PAUSE_PLAY: 'pause_play',
  RESUME_PLAY: 'resume_play',
  NEXT_ROUND: 'next_round',
  JOIN_CARD_REGISTRATION: 'join_card_registration',
  LEAVE_CARD_REGISTRATION: 'leave_card_registration',
  JOIN_CARD_ASSIGNMENT: 'join_card_assignment',
  LEAVE_CARD_ASSIGNMENT: 'leave_card_assignment',
  PLAY_STATE: 'play_state',
  NEW_ROUND: 'new_round',
  MEMORY_TURN_STATE: 'memory_turn_state',
  VALIDATION_RESULT: 'validation_result',
  GAME_OVER: 'game_over',
  PLAY_INTERRUPTED: 'play_interrupted',
  PLAY_PAUSED: 'play_paused',
  PLAY_RESUMED: 'play_resumed',
  ERROR: 'error'
};

// ============================================
// CLASE SOCKET SERVICE
// ============================================

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.listeners = new Map();
  }

  /**
   * Conectar al servidor WebSocket
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      if (this.socket) {
        this.disconnect();
      }

      const token = getAccessToken();
      
      this.socket = io(SOCKET_URL, {
        auth: { token },
        reconnection: true,
        reconnectionAttempts: RECONNECTION_ATTEMPTS,
        reconnectionDelay: RECONNECTION_DELAY,
        reconnectionDelayMax: 5000,
        transports: ['websocket', 'polling'],
      });

      // Timeout para conexión inicial
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
          this.socket?.disconnect();
          this.socket = null;
          reject(new Error('Timeout de conexión WebSocket'));
        }
      }, CONNECTION_TIMEOUT);

      // Manejar conexión exitosa
      this.socket.on(SOCKET_EVENTS.CONNECT, () => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          socketLog('warn', '[Socket] Conectado:', this.socket.id);
          this.isConnected = true;
          resolve();
        }
      });

      // Manejar errores de conexión
      this.socket.on(SOCKET_EVENTS.CONNECT_ERROR, (error) => {
        socketLog('error', '[Socket] Error de conexión:', error.message);
        this.isConnected = false;
        
        // Si es error de auth, emitir evento
        if (error.message?.includes('auth') || error.message?.includes('token')) {
          window.dispatchEvent(new CustomEvent(AUTH_EVENTS.UNAUTHORIZED));
        }
        
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(error);
        }
      });

      // Manejar desconexión
      this.socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
        socketLog('warn', '[Socket] Desconectado:', reason);
        this.isConnected = false;
        
        // Si el servidor forzó la desconexión, intentar reconectar
        if (reason === 'io server disconnect') {
          this.socket.connect();
        }
      });

      // Escuchar evento de sesión invalidada (login desde otro dispositivo)
      this.socket.on(SOCKET_EVENTS.SESSION_INVALIDATED, (data) => {
        socketLog('warn', '[Socket] Sesión invalidada:', data);
        window.dispatchEvent(new CustomEvent(AUTH_EVENTS.SESSION_INVALIDATED, { 
          detail: data 
        }));
      });
    });
  }

  /**
   * Desconectar del servidor WebSocket
   */
  disconnect() {
    if (this.socket) {
      // Limpiar todos los listeners registrados antes de desconectar
      this.listeners.forEach((callbacks, event) => {
        callbacks.forEach((cb) => this.socket.off(event, cb));
      });
      this.listeners.clear();
      
      // Remover listeners de sistema
      this.socket.off(SOCKET_EVENTS.CONNECT);
      this.socket.off(SOCKET_EVENTS.CONNECT_ERROR);
      this.socket.off(SOCKET_EVENTS.DISCONNECT);
      this.socket.off(SOCKET_EVENTS.SESSION_INVALIDATED);
      
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  /**
   * Actualizar token de autenticación
   * @param {string} token - Nuevo access token
   */
  updateAuth(token) {
    if (this.socket) {
      this.socket.auth = { token };
      // Reconectar con nuevo token
      if (this.isConnected) {
        this.socket.disconnect();
        this.socket.connect();
      }
    }
  }

  /**
   * Suscribirse a un evento
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Callback a ejecutar
   */
  on(event, callback) {
    if (!this.socket) {
      return;
    }
    
    this.socket.on(event, callback);
    
    // Guardar referencia para limpieza
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * Desuscribirse de un evento
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
   * Emitir un evento
   * @param {string} event - Nombre del evento
   * @param {*} data - Datos a enviar
   * @returns {Promise<*>} Respuesta del servidor (si aplica)
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
   * Emitir un evento sin esperar ACK del servidor.
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
   * Envía un comando socket sin ACK obligatorio y retorna booleano de envío.
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

  /**
   * Verificar si está conectado
   * @returns {boolean}
   */
  isSocketConnected() {
    return this.socket?.connected || false;
  }

  /**
   * Obtener ID del socket
   * @returns {string|null}
   */
  getSocketId() {
    return this.socket?.id || null;
  }
}

// Exportar instancia singleton
export const socketService = new SocketService();
export default socketService;
