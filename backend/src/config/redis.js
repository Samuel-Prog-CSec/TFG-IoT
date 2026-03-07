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
const fs = require('fs');
const path = require('path');
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
 * Cache de SHA1 de Lua scripts cargados en Redis.
 * Permite usar EVALSHA en vez de EVAL para reducir overhead de red.
 * @type {Map<string, string>}
 */
const luaScriptSHAs = new Map();

/**
 * Carga y cachea Lua scripts en Redis usando SCRIPT LOAD.
 * Los scripts se cargan desde backend/src/scripts/lua/ al conectar.
 * Usar EVALSHA reduce el overhead de enviar el script completo en cada llamada.
 *
 * @returns {Promise<void>}
 */
const loadLuaScripts = async () => {
  if (!redisClient || !isConnected) {
    logger.warn('Redis: No se pueden cargar Lua scripts — Redis no conectado');
    return;
  }

  const luaDir = path.resolve(__dirname, '../scripts/lua');

  // En entornos de test con ioredis-mock, SCRIPT LOAD no está soportado
  if (process.env.NODE_ENV === 'test') {
    logger.debug('Redis: Carga de Lua scripts omitida en entorno test (ioredis-mock)');
    return;
  }

  try {
    if (!fs.existsSync(luaDir)) {
      logger.warn('Redis: Directorio de Lua scripts no encontrado', { luaDir });
      return;
    }

    const luaFiles = fs.readdirSync(luaDir).filter(f => f.endsWith('.lua'));

    for (const file of luaFiles) {
      const scriptName = path.basename(file, '.lua');
      const scriptContent = fs.readFileSync(path.join(luaDir, file), 'utf8');
      const sha = await redisClient.script('LOAD', scriptContent);
      luaScriptSHAs.set(scriptName, sha);
      logger.info(`Redis: Lua script '${scriptName}' cargado (SHA: ${sha.slice(0, 8)}...)`);
    }

    logger.info(`Redis: ${luaScriptSHAs.size} Lua scripts cargados exitosamente`);
  } catch (error) {
    logger.error('Redis: Error al cargar Lua scripts', { error: error.message });
    // No es fatal: las operaciones caerán al fallback secuencial
  }
};

/**
 * Obtiene el SHA1 de un Lua script cargado.
 *
 * @param {string} scriptName - Nombre del script (sin extensión .lua).
 * @returns {string|null} SHA1 del script o null si no está cargado.
 */
const getLuaScriptSHA = scriptName => luaScriptSHAs.get(scriptName) || null;

/**
 * Obtiene el contenido de un Lua script desde disco (para EVAL directo como fallback).
 *
 * @param {string} scriptName - Nombre del script (sin extensión .lua).
 * @returns {string|null} Contenido del script o null si no existe.
 */
const getLuaScriptSource = scriptName => {
  try {
    const luaDir = path.resolve(__dirname, '../scripts/lua');
    const filePath = path.join(luaDir, `${scriptName}.lua`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
    return null;
  } catch {
    return null;
  }
};

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

    // Cargar Lua scripts tras conexión exitosa
    await loadLuaScripts();

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
  ping,
  getLuaScriptSHA,
  getLuaScriptSource,
  loadLuaScripts
};
