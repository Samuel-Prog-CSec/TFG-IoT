/**
 * @fileoverview Utilidad de Health Check del sistema.
 * Verifica el estado de MongoDB, RFID Service, memoria y uptime.
 * @module utils/healthCheck
 */

const mongoose = require('mongoose');
const logger = require('./logger');

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

    return {
      status: state === 1 ? 'healthy' : 'unhealthy',
      state: stateNames[state],
      responseTime: `${responseTime}ms`,
      host: mongoose.connection.host,
      database: mongoose.connection.name
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

    const isConnected = rfidService.isConnected ? rfidService.isConnected() : false;

    return {
      status: isConnected ? 'healthy' : 'disconnected',
      port: rfidService.port || 'unknown',
      baudRate: rfidService.baudRate || 115200
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
  const [mongoHealth] = await Promise.all([checkMongoDBHealth()]);

  const rfidHealth = checkRFIDHealth(rfidService);
  const memory = getMemoryUsage();
  const uptime = getUptime();

  // Determinar estado general
  const isHealthy = mongoHealth.status === 'healthy';

  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    services: {
      mongodb: mongoHealth,
      rfid: rfidHealth
    },
    system: {
      memory,
      pid: process.pid,
      platform: process.platform,
      arch: process.arch
    }
  };
}

module.exports = {
  getHealthStatus,
  checkMongoDBHealth,
  checkRFIDHealth,
  getMemoryUsage,
  getUptime
};
