/**
 * @fileoverview Utilidad de Health Check del sistema.
 * Verifica el estado de MongoDB, Redis, RFID Service, memoria y uptime.
 * @module utils/healthCheck
 */

const mongoose = require('mongoose');
const logger = require('./logger').child({ component: 'healthCheck' });
const { isRedisConnected, ping: pingRedis } = require('../config/redis');
const { getCircuitBreakerState } = require('../services/redisService');

/**
 * Verifica el estado de conexión a MongoDB.
 * @returns {Promise<Object>} Estado de MongoDB con tiempo de respuesta
 */
async function checkMongoDBHealth() {
  const startTime = Date.now();

  try {
    // Ping a MongoDB
    await mongoose.connection.db.admin().ping();

    const responseTime = Date.now() - startTime;
    const state = mongoose.connection.readyState;

    const stateNames = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    // T-905 B3: en producción no exponemos host/database para evitar revelar
    // infraestructura interna (Atlas cluster name, DB name) en respuestas que
    // pueden capturarse por proxies o scraper bots. En dev/staging son útiles
    // para diagnóstico.
    const isProd = process.env.NODE_ENV === 'production';
    return {
      status: state === 1 ? 'healthy' : 'unhealthy',
      state: stateNames[state],
      responseTime: `${responseTime}ms`,
      ...(isProd
        ? {}
        : {
            host: mongoose.connection.host,
            database: mongoose.connection.name
          })
    };
  } catch (error) {
    logger.error('Error en MongoDB health check:', error);

    return {
      status: 'unhealthy',
      state: 'error',
      error: error.message
    };
  }
}

/**
 * Verifica el estado de conexión a Redis.
 * @returns {Promise<Object>} Estado de Redis con tiempo de respuesta
 */
async function checkRedisHealth() {
  try {
    const circuitBreaker = getCircuitBreakerState();

    if (!isRedisConnected()) {
      return {
        status: 'disconnected',
        message: 'Redis no está conectado',
        circuitBreaker: circuitBreaker.state
      };
    }

    // Si el circuit breaker está abierto, Redis está degradado
    if (circuitBreaker.state === 'open') {
      return {
        status: 'degraded',
        message: 'Circuit breaker abierto — operaciones Redis omitidas',
        circuitBreaker: circuitBreaker.state
      };
    }

    const result = await pingRedis();

    if (result.connected) {
      return {
        status: 'healthy',
        responseTime: `${result.latency}ms`,
        circuitBreaker: circuitBreaker.state
      };
    } else {
      return {
        status: 'unhealthy',
        message: 'PING falló',
        circuitBreaker: circuitBreaker.state
      };
    }
  } catch (error) {
    logger.error('Error en Redis health check:', error);

    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Verifica el estado del RFID Service.
 * @param {Object} rfidService - Instancia del servicio RFID
 * @returns {Object} Estado del RFID Service
 */
function checkRFIDHealth(rfidService) {
  try {
    if (!rfidService) {
      return {
        status: 'not_initialized',
        message: 'RFID Service no está inicializado'
      };
    }

    const serviceStatus = rfidService.getStatus ? rfidService.getStatus() : null;
    const state = serviceStatus?.status || 'unknown';
    const isHealthy = state === 'client_ready' || state === 'disabled';

    return {
      status: isHealthy ? 'healthy' : state,
      source: serviceStatus?.source || 'unknown'
    };
  } catch (error) {
    logger.error('Error en RFID health check:', error);

    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Obtiene información de uso de memoria del proceso.
 * @returns {Object} Métricas de memoria
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();

  return {
    rss: `${Math.round(usage.rss / 1024 / 1024)} MB`, // Resident Set Size
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(usage.external / 1024 / 1024)} MB`,
    heapUsedPercentage: `${Math.round((usage.heapUsed / usage.heapTotal) * 100)}%`
  };
}

// Snapshot del último cpuUsage acumulado y momento en que se midió. Permite
// devolver el delta de microsegundos de CPU sobre el intervalo desde la
// última llamada (Bloque G, sesión 04/05/2026). Es el mecanismo recomendado
// por Node.js — `process.cpuUsage()` devuelve acumulados desde el arranque
// del proceso, por lo que sólo el delta es interpretable.
let lastCpuSnapshot = process.cpuUsage();
let lastCpuTimestamp = Date.now();

/**
 * Calcula el porcentaje de CPU consumido por el proceso desde la última
 * vez que se invocó esta función. La primera invocación devuelve 0%
 * (no hay ventana sobre la que calcular). Es lo bastante preciso para
 * dashboards y picos de carga, pero no sustituye a un APM.
 *
 * @returns {Object} { user, system, percent, intervalMs }
 */
function getCpuUsage() {
  const now = Date.now();
  const elapsedMs = Math.max(1, now - lastCpuTimestamp);
  const delta = process.cpuUsage(lastCpuSnapshot);
  lastCpuSnapshot = process.cpuUsage();
  lastCpuTimestamp = now;

  // delta.user/system vienen en microsegundos (1µs = 1e-3 ms).
  const userMs = delta.user / 1000;
  const systemMs = delta.system / 1000;
  // Porcentaje aprox: (CPU consumida) / (tiempo wall-clock) — puede pasar
  // de 100 si hay varios cores ocupados (lo dejamos sin clamp para que el
  // operador note picos multi-core).
  const percent = Math.round(((userMs + systemMs) / elapsedMs) * 100);

  return {
    user: `${userMs.toFixed(1)} ms`,
    system: `${systemMs.toFixed(1)} ms`,
    percent: `${percent}%`,
    intervalMs: elapsedMs
  };
}

/**
 * Calcula el uptime del proceso en formato legible.
 * @returns {string} Uptime formateado
 */
function getUptime() {
  const uptimeSeconds = process.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);

  return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Obtiene el estado completo de salud del sistema.
 * @param {Object} [rfidService] - Instancia opcional del servicio RFID
 * @returns {Promise<Object>} Estado de salud completo
 */
async function getHealthStatus(rfidService = null) {
  const [mongoHealth, redisHealth] = await Promise.all([checkMongoDBHealth(), checkRedisHealth()]);

  const rfidHealth = checkRFIDHealth(rfidService);
  const memory = getMemoryUsage();
  const cpu = getCpuUsage();
  const uptime = getUptime();

  // Determinar estado general.
  // - MongoDB es crítico siempre.
  // - Redis es crítico en producción, pero en development/test se considera "degraded".
  const env = process.env.NODE_ENV || 'development';
  const mongoOk = mongoHealth.status === 'healthy';
  const redisOk = redisHealth.status === 'healthy';

  const issues = {
    critical: [],
    degraded: []
  };

  if (!mongoOk) {
    issues.critical.push('mongodb');
  }

  if (!redisOk) {
    if (env === 'production') {
      issues.critical.push('redis');
    } else {
      issues.degraded.push('redis');
    }
  }

  let overallStatus = 'healthy';
  if (!mongoOk) {
    overallStatus = 'unhealthy';
  } else if (env === 'production' && !redisOk) {
    overallStatus = 'unhealthy';
  } else if (env !== 'production' && !redisOk) {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    issues,
    timestamp: new Date().toISOString(),
    uptime,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    services: {
      mongodb: mongoHealth,
      redis: redisHealth,
      rfid: rfidHealth
    },
    system: {
      memory,
      // CPU delta desde la última invocación (Bloque G). Útil para picos
      // de carga visibles en /api/health y para dashboards.
      cpu,
      pid: process.pid,
      platform: process.platform,
      arch: process.arch
    }
  };
}

module.exports = {
  getHealthStatus,
  checkMongoDBHealth,
  checkRedisHealth,
  checkRFIDHealth,
  getMemoryUsage,
  getUptime
};
