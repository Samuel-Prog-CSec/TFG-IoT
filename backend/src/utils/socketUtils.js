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
const disconnectUserSockets = async (io, userId, reason) => {
  if (!io) {
    return;
  }

  const room = `user_${userId}`;

  // Los sockets del usuario viven en DOS namespaces: el por defecto `/` (sistema)
  // y `/game` (gameplay), ambos unidos a `user_<id>` en el middleware de auth.
  // Antes solo se cubría `/`: al revocar la sesión (logout, cambio de password,
  // rechazo/borrado de cuenta) el socket de `/game` SOBREVIVÍA y seguía
  // recibiendo eventos de partida (new_round, validation_result, game_over…) con
  // un token ya revocado — la revalidación por evento cierra el path de comandos
  // pero no el de escucha pasiva. `io` es el Server (tiene `.of()`), así que
  // recogemos ambos namespaces. Mismo patrón que ya usa el kick por-socketId de
  // takeover en socketHandlers.
  const namespaces = [io, io.of('/game')];

  // Snapshot de los sockets ACTUALES de la room ANTES de esperar el grace
  // (OBS-2). En el login, esta función se llama al crear la sesión nueva —
  // ANTES de que el cliente reciba la respuesta y conecte su socket nuevo. Si
  // re-consultáramos la room dentro del setTimeout (comportamiento anterior),
  // el socket recién conectado —que entra en `user_<id>` dentro de la ventana
  // de 300ms— caería en la redada y se auto-expulsaría (churn
  // connect→disconnect→reconnect). Con el snapshot, en un login fresco la
  // lista está vacía y no se desconecta a nadie; solo se expulsan los sockets
  // del dispositivo ANTERIOR (los que ya estaban). `fetchSockets()` es async y
  // cubre todas las instancias vía el adapter de Redis.
  const staleSockets = [];
  for (const nsp of namespaces) {
    try {
      const sockets = await nsp.in(room).fetchSockets();
      staleSockets.push(...sockets);
    } catch (error) {
      logger.warn('disconnectUserSockets: error al obtener sockets de la room', {
        userId,
        reason,
        namespace: nsp.name,
        message: error.message
      });
    }
    // El cliente escucha `session_invalidated` en ambos namespaces; emitimos en
    // los dos para que reaccione sea cual sea el que tenga vivo.
    nsp.to(room).emit('session_invalidated', {
      reason,
      timestamp: Date.now()
    });
  }

  setTimeout(() => {
    for (const socket of staleSockets) {
      try {
        socket.disconnect(true);
      } catch (error) {
        logger.warn('disconnectUserSockets: error al cerrar socket', {
          userId,
          reason,
          message: error.message
        });
      }
    }
  }, DISCONNECT_GRACE_MS);
};

module.exports = {
  disconnectUserSockets,
  DISCONNECT_GRACE_MS
};
