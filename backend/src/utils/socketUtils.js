/**
 * @fileoverview Utilidades para gestión de sockets y sesiones en tiempo real.
 * @module utils/socketUtils
 */

/**
 * Invalida sesiones WebSocket activas del usuario.
 * Emite un evento y desconecta los sockets para forzar re-autenticación.
 * @param {import('socket.io').Server|null} io
 * @param {string} userId
 * @param {string} reason
 */
const disconnectUserSockets = (io, userId, reason) => {
  if (!io) {
    return;
  }

  io.to(`user_${userId}`).emit('session_invalidated', {
    reason,
    timestamp: Date.now()
  });

  setTimeout(() => {
    io.to(`user_${userId}`).disconnectSockets(true);
  }, 100);
};

module.exports = {
  disconnectUserSockets
};
