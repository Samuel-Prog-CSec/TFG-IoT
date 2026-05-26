/**
 * @fileoverview Utilidades para gestión de sockets y sesiones en tiempo real.
 * @module utils/socketUtils
 */

const logger = require('./logger');

/**
 * Margen entre emit y disconnect para dar tiempo a que el `session_invalidated`
 * llegue al cliente antes de cortar la conexión. Subido de 100→300ms para
 * cubrir el caso multi-instancia con Redis adapter: el `io.to(room).emit()`
 * cruza el adapter y los sockets remotos necesitan ~50-150ms para procesar
 * el evento + repintar UI antes de que el `disconnectSockets` les llegue. Con
 * 100ms se observaba pérdida ocasional del evento (kick "silencioso" desde la
 * perspectiva del cliente). 300ms es un trade-off conservador entre garantía
 * de delivery y latencia percibida en logout.
 */
const DISCONNECT_GRACE_MS = 300;

/**
 * Invalida sesiones WebSocket activas del usuario.
 * Emite un evento y desconecta los sockets para forzar re-autenticación.
 *
 * Patrón: emit con scope a la room del usuario → esperar `DISCONNECT_GRACE_MS`
 * para flush del adapter + handlers del cliente → disconnect duro. Socket.IO
 * no soporta ack para broadcasts, así que la garantía de delivery se modela
 * con un margen temporal calibrado, no con confirmación explícita.
 *
 * @param {import('socket.io').Server|null} io
 * @param {string} userId
 * @param {string} reason
 */
const disconnectUserSockets = (io, userId, reason) => {
  if (!io) {
    return;
  }

  const room = `user_${userId}`;
  io.to(room).emit('session_invalidated', {
    reason,
    timestamp: Date.now()
  });

  setTimeout(() => {
    try {
      io.to(room).disconnectSockets(true);
    } catch (error) {
      logger.warn('disconnectUserSockets: error al cerrar sockets de la room', {
        userId,
        reason,
        message: error.message
      });
    }
  }, DISCONNECT_GRACE_MS);
};

module.exports = {
  disconnectUserSockets,
  DISCONNECT_GRACE_MS
};
