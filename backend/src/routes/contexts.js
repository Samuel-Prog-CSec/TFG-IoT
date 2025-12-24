/**
 * @fileoverview Rutas de gestión de contextos de juego.
 * Endpoints CRUD para contextos temáticos con assets.
 * @module routes/contexts
 */

const express = require('express');
const router = express.Router();

const {
  getContexts,
  getContextById,
  createContext,
  updateContext,
  deleteContext,
  addAsset,
  removeAsset,
  getContextAssets
} = require('../controllers/gameContextController');

const { authenticate, requireRole } = require('../middlewares/auth');
const { createResourceRateLimiter } = require('../config/security');

/**
 * @route   GET /api/contexts
 * @desc    Obtener lista de contextos con filtros
 * @access  Private (Teacher)
 */
router.get(
  '/',
  authenticate,
  requireRole('teacher'),
  getContexts
);

/**
 * @route   GET /api/contexts/:id
 * @desc    Obtener contexto por ID o contextId
 * @access  Private (Teacher)
 */
router.get('/:id', authenticate, requireRole('teacher'), getContextById);

/**
 * @route   GET /api/contexts/:id/assets
 * @desc    Obtener assets de un contexto
 * @access  Private (Teacher)
 */
router.get('/:id/assets', authenticate, requireRole('teacher'), getContextAssets);

/**
 * @route   POST /api/contexts
 * @desc    Crear nuevo contexto
 * @access  Private (Teacher)
 */
router.post(
  '/',
  createResourceRateLimiter, // Rate limiting para prevenir spam
  authenticate,
  requireRole('teacher'),
  createContext
);

/**
 * @route   POST /api/contexts/:id/assets
 * @desc    Añadir asset a un contexto
 * @access  Private (Teacher)
 */
router.post(
  '/:id/assets',
  authenticate,
  requireRole('teacher'),
  addAsset
);

/**
 * @route   PUT /api/contexts/:id
 * @desc    Actualizar contexto
 * @access  Private (Teacher)
 */
router.put(
  '/:id',
  authenticate,
  requireRole('teacher'),
  updateContext
);

/**
 * @route   DELETE /api/contexts/:id
 * @desc    Eliminar contexto
 * @access  Private (Teacher)
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('teacher'),
  deleteContext
);

/**
 * @route   DELETE /api/contexts/:id/assets/:assetKey
 * @desc    Eliminar asset de un contexto
 * @access  Private (Teacher)
 */
router.delete('/:id/assets/:assetKey', authenticate, requireRole('teacher'), removeAsset);

module.exports = router;
