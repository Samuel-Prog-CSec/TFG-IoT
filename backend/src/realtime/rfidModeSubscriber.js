/**
 * @fileoverview Subscriber Redis para cambios de RFID mode entre instancias
 * (ADR-077, PROP-64).
 *
 * Conecta un cliente Redis dedicado en modo SUBSCRIBE al canal
 * `RFID_MODE_PUBSUB_CHANNEL` y, cuando recibe un mensaje, invalida el cache
 * local de la instancia para que la siguiente lectura de
 * `getRfidModeState(userId)` vaya al Redis compartido.
 *
 * Esto garantiza que múltiples instancias del backend (modo HA detrás de un
 * balanceador) ven el mismo estado RFID en milisegundos, sin tener que esperar
 * a la próxima fetch.
 *
 * Resilencia: si Redis cae, el subscriber se cierra silenciosamente. La
 * lógica del socketHandlers ya está preparada para operar sin Redis (cache
 * local actúa como source of truth) — al reconectar Redis, hay que reiniciar
 * el subscriber externamente.
 *
 * @module realtime/rfidModeSubscriber
 */

const { getRedis } = require('../config/redis');
const { RFID_MODE_PUBSUB_CHANNEL, applyRemoteRfidModeChange } = require('./socketHandlers');
const { isMultiInstanceEnabled } = require('../config/scaling');
const logger = require('../utils/logger').child({ component: 'rfidModeSubscriber' });

let subscriberClient = null;
const ownInstanceId = process.env.HOSTNAME || 'unknown';

/**
 * Arranca el subscriber. Idempotente: si ya está activo no hace nada.
 *
 * En single-instance (invariante scale=1) no hay otras instancias que publiquen
 * en el canal, así que el subscriber sería una conexión SUBSCRIBE permanentemente
 * ociosa contra el límite de conexiones de Upstash free-tier. Solo se activa con
 * escalado horizontal (ver config/scaling.js), en paralelo con el publisher de
 * persistRfidModeToRedis y el adapter Socket.IO.
 *
 * @returns {Promise<void>}
 */
const startRfidModeSubscriber = async () => {
  if (!isMultiInstanceEnabled()) {
    return;
  }
  if (subscriberClient) {
    return;
  }

  const mainClient = getRedis();
  if (!mainClient) {
    logger.warn('rfidModeSubscriber: Redis no disponible, no se inicia subscriber');
    return;
  }

  // Duplicar para no mezclar pub/sub con comandos normales.
  subscriberClient = mainClient.duplicate();

  subscriberClient.on('error', err => {
    logger.warn('rfidModeSubscriber: error en cliente subscriber', { error: err.message });
  });

  subscriberClient.on('end', () => {
    logger.info('rfidModeSubscriber: cliente cerrado');
    subscriberClient = null;
  });

  try {
    await subscriberClient.subscribe(RFID_MODE_PUBSUB_CHANNEL);
    logger.info('rfidModeSubscriber: suscrito al canal', {
      channel: RFID_MODE_PUBSUB_CHANNEL
    });
  } catch (err) {
    logger.error('rfidModeSubscriber: fallo al suscribir', { error: err.message });
    subscriberClient = null;
    return;
  }

  subscriberClient.on('message', (channel, raw) => {
    if (channel !== RFID_MODE_PUBSUB_CHANNEL) {
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      logger.warn('rfidModeSubscriber: mensaje no parseable', { error: err.message });
      return;
    }

    // Ignorar mensajes propios: la instancia que publicó ya tiene el cache
    // actualizado a la versión nueva.
    if (payload?.from && payload.from === ownInstanceId) {
      return;
    }

    if (!payload?.userId) {
      return;
    }

    applyRemoteRfidModeChange(payload.userId, payload.state || null);
    logger.debug('rfidModeSubscriber: cache invalidado por mensaje remoto', {
      userId: payload.userId,
      from: payload.from
    });
  });
};

/**
 * Detiene el subscriber de forma segura.
 *
 * @returns {Promise<void>}
 */
const stopRfidModeSubscriber = async () => {
  if (!subscriberClient) {
    return;
  }

  try {
    await subscriberClient.unsubscribe(RFID_MODE_PUBSUB_CHANNEL);
    await subscriberClient.quit();
  } catch (err) {
    logger.warn('rfidModeSubscriber: error al detener', { error: err.message });
  } finally {
    subscriberClient = null;
  }
};

/**
 * Diagnóstico: ¿está activo el subscriber?
 * @returns {boolean}
 */
const isRfidModeSubscriberActive = () => Boolean(subscriberClient);

module.exports = {
  startRfidModeSubscriber,
  stopRfidModeSubscriber,
  isRfidModeSubscriberActive
};
