/**
 * @fileoverview Controller de salud, metricas y meta-informacion de la API.
 *
 * Handlers extraidos de server.js para mantener server.js como
 * configuracion y montaje unicamente.
 *
 * Endpoints:
 * - GET /api/health (y alias /health) — Estado del sistema
 * - GET /api/metrics — Metricas runtime (protegido)
 * - GET / — Informacion general de la API
 *
 * @module controllers/healthController
 */

const { getHealthStatus, getMemoryUsage } = require('../utils/healthCheck');
const { toSystemMetricsDTOV1 } = require('../utils/dtos');
const logger = require('../utils/logger');
const pkg = require('../../package.json');

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
      memory: getMemoryUsage()
    })
  );
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

module.exports = { healthCheck, getMetrics, getApiInfo };
