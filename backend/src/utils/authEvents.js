/**
 * @fileoverview Bus de eventos interno para comunicación entre el middleware
 * de autenticación y el layer de WebSockets.
 *
 * Permite invalidar caches in-memory de Socket.IO inmediatamente cuando
 * un token se revoca, eliminando la ventana de 30s del TTL del cache.
 *
 * @module utils/authEvents
 */

const { EventEmitter } = require('node:events');

const authEventBus = new EventEmitter();

// Limitar listeners para evitar memory leaks (1 emisor + 1 receptor es suficiente)
authEventBus.setMaxListeners(5);

/**
 * Eventos emitidos:
 *
 * - 'token_revoked': Un token específico fue revocado (logout individual).
 *   Payload: { jti: string }
 *
 * - 'all_tokens_revoked': Todos los tokens de un usuario fueron revocados (seguridad).
 *   Payload: { userId: string, reason: string }
 */

module.exports = { authEventBus };
