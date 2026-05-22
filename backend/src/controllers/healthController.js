/**
 * @fileoverview Controller de salud, metricas y meta-informacion de la API.
 *
 * Handlers extraidos de server.js para mantener server.js como
 * configuracion y montaje unicamente.
 *
 * Endpoints:
 * - GET /api/health (y alias /health) — Estado del sistema
 * - GET /api/metrics — Metricas runtime (protegido)
 * - GET /api/health/metrics — Metricas operacionales detalladas (super_admin)
 * - GET / — Informacion general de la API
 *
 * @module controllers/healthController
 *
 * NOTA: La mayoría de endpoints de este controller NO usan responseHelper
 * (sendSuccess/sendPaginated) porque siguen convenciones de infraestructura
 * (formato libre, sin wrapper { success, data }).
 * Excepción: getSystemMetrics usa sendSuccess por ser un endpoint de dominio
 * protegido por autenticación.
 */

const mongoose = require('mongoose');
const { getHealthStatus, getMemoryUsage } = require('../utils/healthCheck');
const { toSystemMetricsDTOV1 } = require('../utils/dtos');
const { sendSuccess } = require('../utils/responseHelper');
const { ping: pingRedis, isRedisConnected } = require('../config/redis');
const { getCircuitBreakerState } = require('../services/redisService');
const { getIsReady, getIsShuttingDown } = require('../utils/serverState');
const logger = require('../utils/logger');
const pkg = require('../../package.json');

/**
 * Liveness probe — el proceso está vivo y respondiendo.
 *
 * Devuelve 200 SIEMPRE que el event loop esté libre. NO toca Mongo ni Redis:
 * la pregunta es "¿debo reiniciar el proceso?", no "¿está sano end-to-end?".
 * Si el proceso responde, no hace falta reiniciarlo aunque Mongo esté caído
 * — el shutdown perdería conexiones útiles sin resolver nada.
 *
 * Pensado para UptimeRobot, GCP/k8s liveness probe y similares. La verificación
 * fina de dependencias va en /health/ready.
 *
 * @route GET /api/health/live
 * @route GET /health/live (alias)
 * @access Public
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
const livenessCheck = (_req, res) => {
  res.status(200).json({
    status: 'alive',
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
};

/**
 * Readiness probe — el proceso puede atender tráfico de usuarios.
 *
 * Devuelve 503 cuando alguna dependencia crítica está caída (Mongo siempre,
 * Redis sólo en producción) o cuando el servidor está en shutdown. El
 * objetivo es que el load balancer (Koyeb) deje de enrutar mientras la
 * dependencia se recupera o el proceso drena conexiones.
 *
 * Verificación vivamente en cada request: Mongoose `readyState === 1` +
 * `isRedisConnected()` + circuit breaker no abierto. No hace ping de red
 * (evita generar tráfico cada 5-15s).
 *
 * @route GET /api/health/ready
 * @route GET /health/ready (alias)
 * @access Public
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
const readinessCheck = (_req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';

  const mongoConnected = mongoose.connection.readyState === 1;
  const redisConnected = isRedisConnected();
  let redisCircuit = 'unknown';
  try {
    redisCircuit = getCircuitBreakerState().state;
  } catch {
    // Si el circuit breaker aún no está inicializado (boot temprano), no falla
    redisCircuit = 'uninitialized';
  }

  // En producción Redis es crítico: si está down o circuit-open, no estamos ready.
  // En dev/test toleramos Redis caído porque el código degrada via fallback in-memory.
  const redisOk = isProduction ? redisConnected && redisCircuit !== 'open' : true;

  const shuttingDown = getIsShuttingDown();
  const explicitReady = getIsReady();

  const ready = !shuttingDown && explicitReady && mongoConnected && redisOk;

  res.status(ready ? 200 : 503).json({
    ready,
    shuttingDown,
    checks: {
      mongo: mongoConnected ? 'ok' : 'down',
      redis: redisConnected ? (redisCircuit === 'open' ? 'degraded' : 'ok') : 'down',
      redisCircuit
    },
    timestamp: new Date().toISOString()
  });
};

/**
 * Health check con estado detallado del sistema.
 * Incluye version del backend en la respuesta.
 *
 * @route GET /api/health
 * @route GET /health (alias)
 * @access Public
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const healthCheck = async (req, res) => {
  // Health endpoint debe retornar 500 JSON en fallo, no delegar a error handler
  try {
    const rfidService = req.app.get('rfidService');
    const healthStatus = await getHealthStatus(rfidService);

    healthStatus.version = pkg.version;

    const httpStatus = ['healthy', 'degraded'].includes(healthStatus.status) ? 200 : 503;
    res.status(httpStatus).json(healthStatus);
  } catch (error) {
    logger.error('Error en health check:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
};

/**
 * Metricas del sistema (HTTP, WebSocket, GameEngine, RFID, memoria).
 *
 * @route GET /api/metrics
 * @access Private (Teacher / Super_Admin)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getMetrics = (req, res) => {
  const runtimeMetrics = req.app.get('runtimeMetrics');
  const io = req.app.get('io');
  const gameEngine = req.app.get('gameEngine');
  const rfidService = req.app.get('rfidService');
  const snapshot = runtimeMetrics.getSnapshot();

  res.json(
    toSystemMetricsDTOV1({
      timestamp: new Date().toISOString(),
      http: snapshot.http,
      websocket: {
        connectedClients: io?.engine?.clientsCount ?? 0,
        events: snapshot.websocket
      },
      gameEngine: gameEngine.getMetrics(),
      rfid: {
        processed: snapshot.rfid,
        service: rfidService.getStatus()
      },
      redis: snapshot.redis,
      memory: getMemoryUsage()
    })
  );
};

/**
 * Métricas operacionales detalladas del sistema.
 * Agrega estado de GameEngine, Redis, MongoDB, WebSocket y métricas runtime.
 *
 * @route GET /api/health/metrics
 * @access Private (Super_Admin)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getSystemMetrics = async (req, res) => {
  // --- GameEngine ---
  const gameEngine = req.app.get('gameEngine');
  const engineMetrics = gameEngine ? gameEngine.getMetrics() : { activePlays: 0, metrics: null };

  // --- Redis: ping y latencia ---
  let redisStatus;
  try {
    const pingResult = await pingRedis();
    redisStatus = {
      connected: pingResult.connected,
      latencyMs: pingResult.latency
    };
  } catch (error) {
    logger.warn({ err: error }, 'Error al consultar Redis para métricas');
    redisStatus = { connected: false, latencyMs: null };
  }

  // --- MongoDB: readyState ---
  const mongoReadyState = mongoose.connection.readyState;
  const mongoStateNames = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  const mongodbStatus = {
    readyState: mongoReadyState,
    status: mongoStateNames[mongoReadyState] || 'unknown'
  };

  // --- Sockets conectados ---
  const io = req.app.get('io');
  const socketsConnected = io?.engine?.clientsCount ?? 0;

  // --- RuntimeMetrics ---
  const runtimeMetrics = req.app.get('runtimeMetrics');
  const runtimeSnapshot = runtimeMetrics ? runtimeMetrics.getSnapshot() : null;

  sendSuccess(res, {
    gameEngine: engineMetrics,
    redis: redisStatus,
    mongodb: mongodbStatus,
    sockets: { connectedClients: socketsConnected },
    runtimeMetrics: runtimeSnapshot,
    timestamp: new Date().toISOString()
  });
};

/**
 * Informacion general de la API (version, endpoints disponibles).
 *
 * @route GET /
 * @access Public
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
const getApiInfo = (_req, res) => {
  // NOTA: Mantener sincronizado con las rutas montadas en server.js
  res.json({
    message: 'API REST de Juegos RFID',
    version: pkg.version,
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      mechanics: '/api/mechanics',
      contexts: '/api/contexts',
      sessions: '/api/sessions',
      plays: '/api/plays',
      decks: '/api/decks',
      health: '/api/health'
    },
    documentation: 'Ver README.md para documentacion completa'
  });
};

module.exports = {
  healthCheck,
  livenessCheck,
  readinessCheck,
  getMetrics,
  getSystemMetrics,
  getApiInfo
};
