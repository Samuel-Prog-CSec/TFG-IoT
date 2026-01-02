/**
 * @fileoverview Configuración y conexión a Redis.
 *
 * Este módulo gestiona la conexión a Redis para:
 * - Blacklist de tokens JWT revocados
 * - Almacenamiento de refresh tokens con rotación
 * - Estado de partidas activas (para recuperación tras reinicio)
 * - Mapeo de tarjetas RFID a partidas
 *
 * @module config/redis
 * @author Samuel Blanchart Pérez
 * @version 0.2.0
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * Cliente Redis singleton.
 * @type {Redis|null}
 */
let redisClient = null;

/**
 * Estado de conexión.
 * @type {boolean}
 */
let isConnected = false;

/**
 * Prefijo para todas las keys del proyecto.
 * @type {string}
 */
const KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'rfid-games:';

/**
 * Opciones de configuración de Redis.
 * @type {Object}
 */
const getRedisConfig = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  // Parsear URL para extraer componentes
  const url = new URL(redisUrl);

  return {
    host: url.hostname || 'localhost',
    port: parseInt(url.port) || 6379,
    password: url.password || process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: KEY_PREFIX,

    // Configuración de reconexión
    retryStrategy: times => {
      if (times > 10) {
        logger.error('Redis: Máximo de reintentos alcanzado, abandonando conexión');
        return null; // Dejar de reintentar
      }
      const delay = Math.min(times * 200, 3000); // Max 3 segundos entre reintentos
      logger.warn(`Redis: Reintentando conexión en ${delay}ms (intento ${times})`);
      return delay;
    },

    // Timeouts
    connectTimeout: 10000, // 10 segundos para conectar
    commandTimeout: 5000, // 5 segundos por comando

    // Opciones de conexión
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true // No conectar automáticamente al crear instancia
  };
};

/**
 * Conecta a Redis.
 *
 * @returns {Promise<Redis>} Cliente Redis conectado.
 * @throws {Error} Si la conexión falla en producción.
 */
const connectRedis = async () => {
  if (redisClient && isConnected) {
    logger.debug('Redis: Ya conectado, reutilizando conexión');
    return redisClient;
  }

  const config = getRedisConfig();

  logger.info('Redis: Iniciando conexión...', {
    host: config.host,
    port: config.port,
    db: config.db,
    keyPrefix: config.keyPrefix
  });

  redisClient = new Redis(config);

  // Event handlers
  redisClient.on('connect', () => {
    logger.info('Redis: Conexión establecida');
  });

  redisClient.on('ready', () => {
    isConnected = true;
    logger.info('Redis: Cliente listo para recibir comandos');
  });

  redisClient.on('error', error => {
    isConnected = false;
    logger.error('Redis: Error de conexión', { error: error.message });

    // En producción, un fallo de Redis es crítico
    if (process.env.NODE_ENV === 'production') {
      logger.error('Redis: Error crítico en producción');
      // No cerramos el proceso, pero marcamos como no saludable
    }
  });

  redisClient.on('close', () => {
    isConnected = false;
    logger.warn('Redis: Conexión cerrada');
  });

  redisClient.on('reconnecting', delay => {
    logger.info(`Redis: Reconectando en ${delay}ms`);
  });

  redisClient.on('end', () => {
    isConnected = false;
    logger.info('Redis: Cliente desconectado');
  });

  // Intentar conectar
  try {
    await redisClient.connect();

    // Verificar conexión con PING
    const pong = await redisClient.ping();
    if (pong === 'PONG') {
      isConnected = true;
      logger.info('Redis: Conexión verificada exitosamente');
    }

    return redisClient;
  } catch (error) {
    isConnected = false;
    logger.error('Redis: Fallo al conectar', { error: error.message });

    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Redis connection failed: ${error.message}`);
    }

    // En desarrollo, advertir pero continuar
    logger.warn('Redis: Continuando sin Redis en modo desarrollo');
    return null;
  }
};

/**
 * Desconecta de Redis de forma segura.
 *
 * @returns {Promise<void>}
 */
const disconnectRedis = async () => {
  if (!redisClient) {
    logger.debug('Redis: No hay cliente para desconectar');
    return;
  }

  try {
    logger.info('Redis: Cerrando conexión...');
    await redisClient.quit();
    isConnected = false;
    redisClient = null;
    logger.info('Redis: Conexión cerrada correctamente');
  } catch (error) {
    logger.error('Redis: Error al cerrar conexión', { error: error.message });
    // Forzar cierre si quit() falla
    if (redisClient) {
      redisClient.disconnect();
      redisClient = null;
    }
    isConnected = false;
  }
};

/**
 * Obtiene el cliente Redis.
 *
 * @returns {Redis|null} Cliente Redis o null si no está conectado.
 */
const getRedis = () => {
  if (!redisClient || !isConnected) {
    return null;
  }
  return redisClient;
};

/**
 * Verifica si Redis está conectado.
 *
 * @returns {boolean} True si está conectado.
 */
const isRedisConnected = () => isConnected;

/**
 * Obtiene el prefijo de keys configurado.
 *
 * @returns {string} Prefijo de keys.
 */
const getKeyPrefix = () => KEY_PREFIX;

/**
 * Ejecuta PING para verificar conexión.
 *
 * @returns {Promise<{connected: boolean, latency: number|null}>}
 */
const ping = async () => {
  if (!redisClient || !isConnected) {
    return { connected: false, latency: null };
  }

  try {
    const start = Date.now();
    await redisClient.ping();
    const latency = Date.now() - start;
    return { connected: true, latency };
  } catch {
    return { connected: false, latency: null };
  }
};

module.exports = {
  connectRedis,
  disconnectRedis,
  getRedis,
  isRedisConnected,
  getKeyPrefix,
  ping
};
