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
  getContextDeletionImpact,
  deleteContext,
  getContextAssets
} = require('../controllers/gameContextController');

const {
  uploadImage,
  uploadAudio,
  attachAudio,
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
  uploadAssetMetaSchema
} = require('../validators/gameContextValidator');
const { emptyObjectSchema } = require('../validators/commonValidator');
const asyncHandler = require('../utils/asyncHandler');

const { IMAGE_CONFIG } = require('../services/imageProcessingService');
const { AUDIO_CONFIG } = require('../services/audioValidationService');
const {
  validateImageMagicBytes,
  validateAudioMagicBytes
} = require('../middlewares/fileValidation');

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
    return cb(null, true);
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
    return cb(null, true);
  }
});

/**
 * @route   GET /api/contexts
 * @desc    Obtener lista de contextos con filtros
 * @access  Private (Teacher / Super_Admin)
 * @validation query: gameContextQuerySchema
 */

/**
 * @openapi
 * /contexts:
 *   get:
 *     tags: [Contexts]
 *     summary: Listar contextos disponibles para el usuario
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de contextos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Context' } }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *   post:
 *     tags: [Contexts]
 *     summary: Crear nuevo contexto (super_admin)
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, contextId]
 *             properties:
 *               name: { type: string }
 *               contextId: { type: string, description: 'Slug único' }
 *     responses:
 *       201:
 *         description: Contexto creado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Context' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 */
router.get(
  '/',
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateQuery(gameContextQuerySchema),
  asyncHandler(getContexts)
);

/**
 * @route   GET /api/contexts/upload-config
 * @desc    Obtener configuración de límites para uploads
 * @access  Private (Teacher / Super_Admin)
 * @validation query: emptyObjectSchema
 */
router.get(
  '/upload-config',
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateQuery(emptyObjectSchema),
  getUploadConfig
);

/**
 * @route   GET /api/contexts/:id
 * @desc    Obtener contexto por ID o contextId
 * @access  Private (Teacher / Super_Admin)
 * @validation params: gameContextParamsSchema | query: emptyObjectSchema
 */

/**
 * @openapi
 * /contexts/{id}:
 *   get:
 *     tags: [Contexts]
 *     summary: Obtener contexto por ID o slug
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Contexto encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Context' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */

/**
 * @openapi
 * /contexts/{id}:
 *   delete:
 *     tags: [Contexts]
 *     summary: Eliminar contexto y limpiar Supabase Storage
 *     description: Eliminación reservada al super_admin. Borra los assets de Supabase asociados.
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Contexto eliminado }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get(
  '/:id',
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateParams(gameContextParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(getContextById)
);

/**
 * @route   GET /api/contexts/:id/assets
 * @desc    Obtener assets de un contexto
 * @access  Private (Teacher / Super_Admin)
 * @validation params: gameContextParamsSchema | query: emptyObjectSchema
 */
router.get(
  '/:id/assets',
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateParams(gameContextParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(getContextAssets)
);

/**
 * @route   POST /api/contexts
 * @desc    Crear nuevo contexto (vacío; los assets se añaden después por los profesores)
 * @access  Private (Super_Admin únicamente)
 * @validation body: createGameContextSchema | query: emptyObjectSchema
 */
router.post(
  '/',
  authenticate,
  createResourceRateLimiter, // Rate limiting para prevenir spam (keyed por usuario)
  requireRole('super_admin'),
  validateQuery(emptyObjectSchema),
  validateBody(createGameContextSchema),
  asyncHandler(createContext)
);

/**
 * @route   POST /api/contexts/:id/images
 * @desc    Subir imagen a un contexto (convierte a WebP, genera thumbnail)
 * @access  Private (Teacher / Super_Admin)
 * @body    multipart/form-data { file, key, value, display? }
 * @validation params: gameContextIdParamsSchema | body: uploadAssetMetaSchema | query: emptyObjectSchema
 */

/**
 * @openapi
 * /contexts/{id}/images:
 *   post:
 *     tags: [Contexts]
 *     summary: Subir imagen al contexto (convierte a WebP + thumbnail)
 *     description: |
 *       Acepta JPG/PNG/WebP. El backend valida magic bytes (T-905 B3) y la convierte
 *       a WebP optimizado. Genera thumbnail aparte para previews en el wizard.
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, key, value]
 *             properties:
 *               file: { type: string, format: binary }
 *               key: { type: string, description: 'Identificador único del asset' }
 *               value: { type: string, description: 'Valor literal (ej. "perro")' }
 *               display: { type: string, description: 'Texto a mostrar al estudiante' }
 *     responses:
 *       201: { description: Imagen subida }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       413: { description: Archivo demasiado grande }
 *       429: { $ref: '#/components/responses/RateLimitError' }
 */
router.post(
  '/:id/images',
  uploadRateLimiter,
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateParams(gameContextIdParamsSchema),
  validateQuery(emptyObjectSchema),
  imageUpload.single('file'),
  validateImageMagicBytes, // T-905 B3: defense in depth contra MIME spoofing
  validateBody(uploadAssetMetaSchema),
  asyncHandler(uploadImage)
);

/**
 * @route   POST /api/contexts/:id/audio
 * @desc    Subir audio a un contexto (valida MP3/OGG)
 * @access  Private (Teacher / Super_Admin)
 * @body    multipart/form-data { file, key, value, display? }
 * @validation params: gameContextIdParamsSchema | body: uploadAssetMetaSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/audio',
  uploadRateLimiter,
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateParams(gameContextIdParamsSchema),
  validateQuery(emptyObjectSchema),
  audioUpload.single('file'),
  validateAudioMagicBytes, // T-905 B3: defense in depth contra MIME spoofing
  validateBody(uploadAssetMetaSchema),
  asyncHandler(uploadAudio)
);

/**
 * @route   PATCH /api/contexts/:id/assets/:assetKey/audio
 * @desc    Adjuntar o reemplazar audio en un asset existente
 * @access  Private (Teacher / Super_Admin)
 * @body    multipart/form-data { file }
 * @validation params: gameContextAssetParamsSchema | query: emptyObjectSchema
 */
router.patch(
  '/:id/assets/:assetKey/audio',
  uploadRateLimiter,
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateParams(gameContextAssetParamsSchema),
  validateQuery(emptyObjectSchema),
  audioUpload.single('file'),
  validateAudioMagicBytes, // T-905 B3: defense in depth contra MIME spoofing
  asyncHandler(attachAudio)
);

/**
 * @route   PUT /api/contexts/:id
 * @desc    Actualizar metadatos del contexto (nombre, contextId)
 * @access  Private (Super_Admin únicamente)
 * @validation params: gameContextIdParamsSchema | body: updateGameContextSchema | query: emptyObjectSchema
 */
router.put(
  '/:id',
  authenticate,
  requireRole('super_admin'),
  validateParams(gameContextIdParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(updateGameContextSchema),
  asyncHandler(updateContext)
);

/**
 * @route   GET /api/contexts/:id/deletion-impact
 * @desc    Inventario de impacto del borrado en cascada (pre-chequeo del modal)
 * @access  Private (Super_Admin únicamente)
 * @validation params: gameContextIdParamsSchema | query: emptyObjectSchema
 */
router.get(
  '/:id/deletion-impact',
  authenticate,
  requireRole('super_admin'),
  validateParams(gameContextIdParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(getContextDeletionImpact)
);

/**
 * @route   DELETE /api/contexts/:id
 * @desc    Eliminar contexto con archivado en cascada y limpieza de Supabase Storage
 * @access  Private (Super_Admin únicamente)
 * @validation params: gameContextIdParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('super_admin'),
  validateParams(gameContextIdParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(deleteContext)
);

/**
 * @route   DELETE /api/contexts/:id/images/:assetKey
 * @desc    Eliminar imagen de un contexto
 * @access  Private (Teacher / Super_Admin)
 * @validation params: gameContextAssetParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id/images/:assetKey',
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateParams(gameContextAssetParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(deleteImage)
);

/**
 * @route   DELETE /api/contexts/:id/audio/:assetKey
 * @desc    Eliminar audio de un contexto
 * @access  Private (Teacher / Super_Admin)
 * @validation params: gameContextAssetParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id/audio/:assetKey',
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateParams(gameContextAssetParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(deleteAudio)
);

module.exports = router;
