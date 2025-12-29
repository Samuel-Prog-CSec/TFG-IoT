/**
 * @fileoverview Rutas de gestión de contextos de juego.
 * Endpoints CRUD para contextos temáticos con assets (imágenes WebP y audio MP3/OGG).
 * @module routes/contexts
 */

const express = require('express');
const multer = require('multer');
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

const {
  uploadImage,
  uploadAudio,
  deleteImage,
  deleteAudio,
  getUploadConfig
} = require('../controllers/assetController');

const { authenticate, requireRole } = require('../middlewares/auth');
const { createResourceRateLimiter, uploadRateLimiter } = require('../config/security');

const { IMAGE_CONFIG } = require('../services/imageProcessingService');
const { AUDIO_CONFIG } = require('../services/audioValidationService');

/**
 * Configuración de Multer para imágenes.
 * Almacena en memoria para procesamiento con sharp antes de Supabase.
 */
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: IMAGE_CONFIG.MAX_INPUT_SIZE // 8MB
  },
  fileFilter: (req, file, cb) => {
    // Validación preliminar por MIME type declarado
    // La validación real por magic bytes se hace en imageProcessingService
    const allowedMimes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/jpg'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Formato de imagen no permitido. Usa PNG, JPG, GIF o WebP.'));
    }
    cb(null, true);
  }
});

/**
 * Configuración de Multer para audio.
 * Almacena en memoria para validación antes de Supabase.
 */
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: AUDIO_CONFIG.MAX_SIZE // 5MB
  },
  fileFilter: (req, file, cb) => {
    // Validación preliminar por MIME type declarado
    // La validación real por magic bytes se hace en audioValidationService
    const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/vorbis'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Formato de audio no permitido. Usa MP3 u OGG.'));
    }
    cb(null, true);
  }
});

/**
 * @route   GET /api/contexts
 * @desc    Obtener lista de contextos con filtros
 * @access  Private (Teacher)
 */
router.get('/', authenticate, requireRole('teacher'), getContexts);

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
 * @route   GET /api/contexts/upload-config
 * @desc    Obtener configuración de límites para uploads
 * @access  Private (Teacher)
 */
router.get('/upload-config', authenticate, requireRole('teacher'), getUploadConfig);

/**
 * @route   POST /api/contexts/:id/assets
 * @desc    Añadir asset a un contexto (sin archivo, solo metadatos)
 * @access  Private (Teacher)
 * @deprecated Usa POST /api/contexts/:id/images o /audio para subir con archivo
 */
router.post('/:id/assets', authenticate, requireRole('teacher'), addAsset);

/**
 * @route   POST /api/contexts/:id/images
 * @desc    Subir imagen a un contexto (convierte a WebP, genera thumbnail)
 * @access  Private (Teacher)
 * @body    multipart/form-data { file, key, value, display? }
 */
router.post(
  '/:id/images',
  uploadRateLimiter,
  authenticate,
  requireRole('teacher'),
  imageUpload.single('file'),
  uploadImage
);

/**
 * @route   POST /api/contexts/:id/audio
 * @desc    Subir audio a un contexto (valida MP3/OGG)
 * @access  Private (Teacher)
 * @body    multipart/form-data { file, key, value, display? }
 */
router.post(
  '/:id/audio',
  uploadRateLimiter,
  authenticate,
  requireRole('teacher'),
  audioUpload.single('file'),
  uploadAudio
);

/**
 * @route   PUT /api/contexts/:id
 * @desc    Actualizar contexto
 * @access  Private (Teacher)
 */
router.put('/:id', authenticate, requireRole('teacher'), updateContext);

/**
 * @route   DELETE /api/contexts/:id
 * @desc    Eliminar contexto
 * @access  Private (Teacher)
 */
router.delete('/:id', authenticate, requireRole('teacher'), deleteContext);

/**
 * @route   DELETE /api/contexts/:id/assets/:assetKey
 * @desc    Eliminar asset de un contexto (genérico, legacy)
 * @access  Private (Teacher)
 * @deprecated Usa DELETE /api/contexts/:id/images/:assetKey o /audio/:assetKey
 */
router.delete('/:id/assets/:assetKey', authenticate, requireRole('teacher'), removeAsset);

/**
 * @route   DELETE /api/contexts/:id/images/:assetKey
 * @desc    Eliminar imagen de un contexto
 * @access  Private (Teacher)
 */
router.delete('/:id/images/:assetKey', authenticate, requireRole('teacher'), deleteImage);

/**
 * @route   DELETE /api/contexts/:id/audio/:assetKey
 * @desc    Eliminar audio de un contexto
 * @access  Private (Teacher)
 */
router.delete('/:id/audio/:assetKey', authenticate, requireRole('teacher'), deleteAudio);

module.exports = router;
