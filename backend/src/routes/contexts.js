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
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const {
  createGameContextSchema,
  updateGameContextSchema,
  gameContextQuerySchema,
  gameContextParamsSchema,
  gameContextIdParamsSchema,
  gameContextAssetParamsSchema,
  addAssetSchema,
  uploadAssetMetaSchema
} = require('../validators/gameContextValidator');
const { emptyObjectSchema } = require('../validators/commonValidator');

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
    const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/ogg'];
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
 * @validation query: gameContextQuerySchema
 */
router.get(
  '/',
  authenticate,
  requireRole('teacher'),
  validateQuery(gameContextQuerySchema),
  getContexts
);

/**
 * @route   GET /api/contexts/upload-config
 * @desc    Obtener configuración de límites para uploads
 * @access  Private (Teacher)
 * @validation query: emptyObjectSchema
 */
router.get(
  '/upload-config',
  authenticate,
  requireRole('teacher'),
  validateQuery(emptyObjectSchema),
  getUploadConfig
);

/**
 * @route   GET /api/contexts/:id
 * @desc    Obtener contexto por ID o contextId
 * @access  Private (Teacher)
 * @validation params: gameContextParamsSchema | query: emptyObjectSchema
 */
router.get(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameContextParamsSchema),
  validateQuery(emptyObjectSchema),
  getContextById
);

/**
 * @route   GET /api/contexts/:id/assets
 * @desc    Obtener assets de un contexto
 * @access  Private (Teacher)
 * @validation params: gameContextParamsSchema | query: emptyObjectSchema
 */
router.get(
  '/:id/assets',
  authenticate,
  requireRole('teacher'),
  validateParams(gameContextParamsSchema),
  validateQuery(emptyObjectSchema),
  getContextAssets
);

/**
 * @route   POST /api/contexts
 * @desc    Crear nuevo contexto
 * @access  Private (Teacher)
 * @validation body: createGameContextSchema | query: emptyObjectSchema
 */
router.post(
  '/',
  createResourceRateLimiter, // Rate limiting para prevenir spam
  authenticate,
  requireRole('teacher'),
  validateQuery(emptyObjectSchema),
  validateBody(createGameContextSchema),
  createContext
);

/**
 * @route   POST /api/contexts/:id/assets
 * @desc    Añadir asset a un contexto (sin archivo, solo metadatos)
 * @access  Private (Teacher)
 * @deprecated Usa POST /api/contexts/:id/images o /audio para subir con archivo
 * @validation params: gameContextIdParamsSchema | body: addAssetSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/assets',
  authenticate,
  requireRole('teacher'),
  validateParams(gameContextIdParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(addAssetSchema),
  addAsset
);

/**
 * @route   POST /api/contexts/:id/images
 * @desc    Subir imagen a un contexto (convierte a WebP, genera thumbnail)
 * @access  Private (Teacher)
 * @body    multipart/form-data { file, key, value, display? }
 * @validation params: gameContextIdParamsSchema | body: uploadAssetMetaSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/images',
  uploadRateLimiter,
  authenticate,
  requireRole('teacher'),
  validateParams(gameContextIdParamsSchema),
  validateQuery(emptyObjectSchema),
  imageUpload.single('file'),
  validateBody(uploadAssetMetaSchema),
  uploadImage
);

/**
 * @route   POST /api/contexts/:id/audio
 * @desc    Subir audio a un contexto (valida MP3/OGG)
 * @access  Private (Teacher)
 * @body    multipart/form-data { file, key, value, display? }
 * @validation params: gameContextIdParamsSchema | body: uploadAssetMetaSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/audio',
  uploadRateLimiter,
  authenticate,
  requireRole('teacher'),
  validateParams(gameContextIdParamsSchema),
  validateQuery(emptyObjectSchema),
  audioUpload.single('file'),
  validateBody(uploadAssetMetaSchema),
  uploadAudio
);

/**
 * @route   PUT /api/contexts/:id
 * @desc    Actualizar contexto
 * @access  Private (Teacher)
 * @validation params: gameContextIdParamsSchema | body: updateGameContextSchema | query: emptyObjectSchema
 */
router.put(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameContextIdParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(updateGameContextSchema),
  updateContext
);

/**
 * @route   DELETE /api/contexts/:id
 * @desc    Eliminar contexto
 * @access  Private (Teacher)
 * @validation params: gameContextIdParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(gameContextIdParamsSchema),
  validateQuery(emptyObjectSchema),
  deleteContext
);

/**
 * @route   DELETE /api/contexts/:id/assets/:assetKey
 * @desc    Eliminar asset de un contexto (genérico, legacy)
 * @access  Private (Teacher)
 * @deprecated Usa DELETE /api/contexts/:id/images/:assetKey o /audio/:assetKey
 * @validation params: gameContextAssetParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id/assets/:assetKey',
  authenticate,
  requireRole('teacher'),
  validateParams(gameContextAssetParamsSchema),
  validateQuery(emptyObjectSchema),
  removeAsset
);

/**
 * @route   DELETE /api/contexts/:id/images/:assetKey
 * @desc    Eliminar imagen de un contexto
 * @access  Private (Teacher)
 * @validation params: gameContextAssetParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id/images/:assetKey',
  authenticate,
  requireRole('teacher'),
  validateParams(gameContextAssetParamsSchema),
  validateQuery(emptyObjectSchema),
  deleteImage
);

/**
 * @route   DELETE /api/contexts/:id/audio/:assetKey
 * @desc    Eliminar audio de un contexto
 * @access  Private (Teacher)
 * @validation params: gameContextAssetParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id/audio/:assetKey',
  authenticate,
  requireRole('teacher'),
  validateParams(gameContextAssetParamsSchema),
  validateQuery(emptyObjectSchema),
  deleteAudio
);

module.exports = router;
