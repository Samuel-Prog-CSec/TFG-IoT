/**
 * @fileoverview Puente Redis pub/sub para emitir notificaciones en TIEMPO REAL
 * desde procesos SIN servidor Socket.IO (el worker BullMQ).
 *
 * Problema que resuelve:
 *   `notificationService.notify()` persiste la notificación y llama a
 *   `emitNotificationCreated`, que hace `io.to(user_<id>).emit('notification:created')`.
 *   Pero `setSocketServer(io)` SOLO se invoca en `server.js` (proceso HTTP). El
 *   **worker** (donde corre el cron de detección de SmartAlerts y de system-alerts)
 *   no tiene `io`, así que `emitNotificationCreated` era un no-op allí: las
 *   notificaciones de alerta se persistían pero NUNCA llegaban en tiempo real al
 *   docente/super_admin — solo aparecían al refrescar o al recuperar el foco.
 *
 * Solución:
 *   El worker (sin io) publica `{ userId, dto }` en el canal `notification:emit`.
 *   El proceso HTTP está suscrito y, al recibir el mensaje, re-emite por su
 *   Socket.IO al room `user_<id>`. El `@socket.io/redis-adapter` ya configurado
 *   en `server.js` propaga ese emit a la instancia donde el cliente esté conectado.
 *
 *   En multi-instancia HTTP cada instancia re-emitiría (N copias), pero el cliente
 *   deduplica por `id` de notificación, así que el efecto es exactly-once percibido.
 *   En single-instance (caso típico) es exactly-once real.
 *
 * Reutiliza el patrón de `cacheInvalidateSubscriber.js` (no introduce paradigma
 * nuevo ni dependencias). Resiliente: si Redis cae, falla en silencio y la
 * notificación —ya persistida— se ve al refrescar.
 *
 * @module realtime/notificationEmitSubscriber
 */

const { getRedis } = require('../config/redis');
const logger = require('../utils/logger').child({ component: 'notificationEmitSubscriber' });

/**
 * Canal Redis del pub/sub. Documentado en Arquitectura_Redis.md.
 * @type {string}
 */
const NOTIFICATION_EMIT_CHANNEL = 'notification:emit';

let subscriberClient = null;

/**
 * Publica una orden de emisión de notificación. La invoca
 * `notificationService.emitNotificationCreated` SOLO cuando el proceso no tiene
 * `io` (worker). Si Redis no está disponible, falla en silencio.
 *
 * @param {string} userId
 * @param {object} dto - DTO V1 serializado de la notificación.
 * @returns {Promise<void>}
 */
const publishNotificationEmit = async (userId, dto) => {
  const client = getRedis();
  if (!client) {
    return;
  }
  try {
    await client.publish(
      NOTIFICATION_EMIT_CHANNEL,
      JSON.stringify({ userId: String(userId), dto })
    );
  } catch (err) {
    logger.debug('notificationEmitSubscriber: publish falló (ignorado)', {
      userId,
      error: err.message
    });
  }
};

/**
 * Arranca el subscriber en el proceso HTTP (el que tiene `io`). Idempotente.
 * Solo tiene sentido donde `getSocketServer()` devuelve un servidor Socket.IO.
 *
 * @returns {Promise<void>}
 */
const startNotificationEmitSubscriber = async () => {
  if (subscriberClient) {
    return;
  }

  const mainClient = getRedis();
  if (!mainClient) {
    logger.warn('notificationEmitSubscriber: Redis no disponible, no se inicia subscriber');
    return;
  }

  subscriberClient = mainClient.duplicate();

  subscriberClient.on('error', err => {
    logger.warn('notificationEmitSubscriber: error en cliente subscriber', { error: err.message });
  });

  subscriberClient.on('end', () => {
    logger.info('notificationEmitSubscriber: cliente cerrado');
    subscriberClient = null;
  });

  try {
    await subscriberClient.subscribe(NOTIFICATION_EMIT_CHANNEL);
    logger.info('notificationEmitSubscriber: suscrito al canal', {
      channel: NOTIFICATION_EMIT_CHANNEL
    });
  } catch (err) {
    logger.error('notificationEmitSubscriber: fallo al suscribir', { error: err.message });
    try {
      await subscriberClient.quit();
    } catch {
      // ignorar — el subscriber se descarta igualmente.
    }
    subscriberClient = null;
    return;
  }

  subscriberClient.on('message', (channel, raw) => {
    if (channel !== NOTIFICATION_EMIT_CHANNEL) {
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      logger.debug('notificationEmitSubscriber: mensaje no parseable (ignorado)', {
        error: err.message
      });
      return;
    }

    const { userId, dto } = payload || {};
    if (!userId || !dto) {
      return;
    }

    // Lazy require para evitar ciclo (notificationService → este módulo).
    const io = require('../services/notificationService').getSocketServer();
    if (!io) {
      // Este proceso no tiene io (no debería suscribirse). No-op seguro.
      return;
    }
    try {
      io.to(`user_${userId}`).emit('notification:created', dto);
    } catch (err) {
      logger.warn('notificationEmitSubscriber: re-emisión falló', {
        userId,
        error: err.message
      });
    }
  });
};

/**
 * Detiene el subscriber de forma segura. Llamado en gracefulShutdown.
 *
 * @returns {Promise<void>}
 */
const stopNotificationEmitSubscriber = async () => {
  if (!subscriberClient) {
    return;
  }
  try {
    await subscriberClient.unsubscribe(NOTIFICATION_EMIT_CHANNEL);
    await subscriberClient.quit();
  } catch (err) {
    logger.warn('notificationEmitSubscriber: error al detener', { error: err.message });
  } finally {
    subscriberClient = null;
  }
};

module.exports = {
  NOTIFICATION_EMIT_CHANNEL,
  publishNotificationEmit,
  startNotificationEmitSubscriber,
  stopNotificationEmitSubscriber
};
