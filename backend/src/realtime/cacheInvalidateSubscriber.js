/**
 * @fileoverview Subscriber Redis pub/sub para invalidar caches en memoria
 * cross-instance (T-907 INT5).
 *
 * Problema que resuelve:
 *   Los caches LRU locales (`authUserCache`, `mechanicCache`, `contextCache` en
 *   `utils/inMemoryCache.js`) viven en memoria del proceso. Cuando una instancia
 *   ejecuta `invalidateUserCache(userId)` limpia su LRU + Redis, pero **otras
 *   instancias siguen sirviendo el valor cacheado localmente** hasta que el TTL
 *   (30s slim-user, 60s mechanic/context) lo purga. En multi-instancia esto
 *   puede provocar ventanas de inconsistencia de hasta 30-60 s tras cambios
 *   sensibles (role, status, mecánica/contexto editado).
 *
 * Solución:
 *   La instancia que invalida publica un mensaje en el canal `cache:invalidate`
 *   con `{ namespace, key, from: hostname }`. Las demás instancias están
 *   suscritas y, al recibirlo, vacían la entrada correspondiente de su LRU
 *   local. Los mensajes propios se ignoran (la instancia origen ya invalidó).
 *
 * Reutiliza el patrón de `rfidModeSubscriber.js` para no introducir un nuevo
 * paradigma. Resiliente: si Redis cae, el subscriber se cierra silenciosamente
 * y al reconectar Redis hay que reiniciarlo externamente. Single-instance no
 * requiere este subscriber (el TTL local + invalidación in-process bastan),
 * por lo que el coste se paga solo cuando aporta valor.
 *
 * @module realtime/cacheInvalidateSubscriber
 */

const { getRedis } = require('../config/redis');
const { authUserCache, mechanicCache, contextCache } = require('../utils/inMemoryCache');
const logger = require('../utils/logger').child({ component: 'cacheInvalidateSubscriber' });

/**
 * Canal Redis del pub/sub. Documentado en Arquitectura_Redis.md.
 * @type {string}
 */
const CACHE_INVALIDATE_CHANNEL = 'cache:invalidate';

/**
 * Identificador único de esta instancia. Se incluye en cada mensaje publicado
 * para que el subscriber pueda ignorar sus propios broadcasts (no necesita
 * limpiar el LRU local — ya lo limpió la operación que originó el mensaje).
 * @type {string}
 */
const ownInstanceId = process.env.HOSTNAME || process.env.INSTANCE_NAME || `pid-${process.pid}`;

let subscriberClient = null;

/**
 * Mapea un namespace a la instancia LRU correspondiente. Solo se aceptan los
 * tres caches singleton expuestos por `inMemoryCache.js`. Otros namespaces
 * (Redis-only) se ignoran silenciosamente.
 *
 * @param {string} namespace
 * @returns {InMemoryCache|null}
 */
const resolveLocalCache = namespace => {
  if (namespace === 'auth:user') {
    return authUserCache;
  }
  if (namespace === 'cache:mechanic') {
    return mechanicCache;
  }
  if (namespace === 'cache:context') {
    return contextCache;
  }
  return null;
};

/**
 * Publica un mensaje de invalidación al canal. Usado por callers internos
 * (`invalidateUserCache`, futuros invalidators de mechanic/context). Si Redis
 * no está disponible, falla silenciosamente — la invalidación local ya
 * ocurrió y el TTL purgará el resto de instancias eventualmente.
 *
 * @param {string} namespace - Uno de 'auth:user' | 'cache:mechanic' | 'cache:context'.
 * @param {string} key
 * @returns {Promise<void>}
 */
const publishInvalidate = async (namespace, key) => {
  const client = getRedis();
  if (!client) {
    return;
  }
  try {
    const payload = JSON.stringify({
      namespace,
      key: String(key),
      from: ownInstanceId,
      ts: Date.now()
    });
    await client.publish(CACHE_INVALIDATE_CHANNEL, payload);
  } catch (err) {
    logger.debug('cacheInvalidateSubscriber: publish falló (ignorado)', {
      namespace,
      key,
      error: err.message
    });
  }
};

/**
 * Arranca el subscriber. Idempotente.
 *
 * @returns {Promise<void>}
 */
const startCacheInvalidateSubscriber = async () => {
  if (subscriberClient) {
    return;
  }

  const mainClient = getRedis();
  if (!mainClient) {
    logger.warn('cacheInvalidateSubscriber: Redis no disponible, no se inicia subscriber');
    return;
  }

  subscriberClient = mainClient.duplicate();

  subscriberClient.on('error', err => {
    logger.warn('cacheInvalidateSubscriber: error en cliente subscriber', { error: err.message });
  });

  subscriberClient.on('end', () => {
    logger.info('cacheInvalidateSubscriber: cliente cerrado');
    subscriberClient = null;
  });

  try {
    await subscriberClient.subscribe(CACHE_INVALIDATE_CHANNEL);
    logger.info('cacheInvalidateSubscriber: suscrito al canal', {
      channel: CACHE_INVALIDATE_CHANNEL,
      instance: ownInstanceId
    });
  } catch (err) {
    logger.error('cacheInvalidateSubscriber: fallo al suscribir', { error: err.message });
    subscriberClient = null;
    return;
  }

  subscriberClient.on('message', (channel, raw) => {
    if (channel !== CACHE_INVALIDATE_CHANNEL) {
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      logger.debug('cacheInvalidateSubscriber: mensaje no parseable (ignorado)', {
        error: err.message
      });
      return;
    }

    // Ignorar mensajes propios — la instancia origen ya limpió su LRU local.
    if (payload?.from && payload.from === ownInstanceId) {
      return;
    }

    if (!payload?.namespace || !payload?.key) {
      return;
    }

    const cache = resolveLocalCache(payload.namespace);
    if (!cache) {
      // Namespace que no tiene LRU local — nada que hacer.
      return;
    }

    cache.delete(payload.key);
    logger.debug('cacheInvalidateSubscriber: LRU local invalidado por mensaje remoto', {
      namespace: payload.namespace,
      key: payload.key,
      from: payload.from
    });
  });
};

/**
 * Detiene el subscriber de forma segura. Llamado en gracefulShutdown.
 *
 * @returns {Promise<void>}
 */
const stopCacheInvalidateSubscriber = async () => {
  if (!subscriberClient) {
    return;
  }

  try {
    await subscriberClient.unsubscribe(CACHE_INVALIDATE_CHANNEL);
    await subscriberClient.quit();
  } catch (err) {
    logger.warn('cacheInvalidateSubscriber: error al detener', { error: err.message });
  } finally {
    subscriberClient = null;
  }
};

/**
 * Diagnóstico: ¿está activo el subscriber?
 * @returns {boolean}
 */
const isCacheInvalidateSubscriberActive = () => Boolean(subscriberClient);

module.exports = {
  CACHE_INVALIDATE_CHANNEL,
  publishInvalidate,
  startCacheInvalidateSubscriber,
  stopCacheInvalidateSubscriber,
  isCacheInvalidateSubscriberActive
};
