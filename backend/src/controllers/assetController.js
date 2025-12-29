/**
 * @fileoverview Controlador para la gestión de assets (recursos multimedia) de los contextos de juego.
 * Gestiona la subida de imágenes (WebP) y audio (MP3/OGG) con validación y procesamiento.
 * @module controllers/assetController
 */

const GameContext = require('../models/GameContext');
const storageService = require('../services/storageService.js');
const imageProcessingService = require('../services/imageProcessingService');
const audioValidationService = require('../services/audioValidationService');
const logger = require('../utils/logger');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

/**
 * Límite máximo de assets por contexto.
 * @constant {number}
 */
const MAX_ASSETS_PER_CONTEXT = 30;

/**
 * Verifica que el contexto existe y no ha alcanzado el límite de assets.
 *
 * @async
 * @param {string} contextId - ID del contexto
 * @returns {Promise<Object>} El documento del contexto
 * @throws {NotFoundError} Si el contexto no existe
 * @throws {ValidationError} Si se alcanzó el límite de assets
 */
async function getContextAndValidateLimit(contextId) {
  const context = await GameContext.findById(contextId);

  if (!context) {
    throw new NotFoundError('Contexto de juego');
  }

  if (context.assets.length >= MAX_ASSETS_PER_CONTEXT) {
    throw new ValidationError(
      `El contexto ha alcanzado el límite máximo de ${MAX_ASSETS_PER_CONTEXT} assets`
    );
  }

  return context;
}

/**
 * Verifica que la key del asset no exista ya en el contexto.
 *
 * @param {Object} context - Documento del contexto
 * @param {string} key - Clave del asset a verificar
 * @throws {ConflictError} Si la key ya existe
 */
function validateUniqueKey(context, key) {
  const existingAsset = context.assets.find(asset => asset.key === key.toLowerCase());

  if (existingAsset) {
    throw new ConflictError('Un asset con esta key ya existe en este contexto');
  }
}

/**
 * Sube una nueva imagen y la vincula a un contexto existente.
 * Procesa la imagen: valida, convierte a WebP, redimensiona y genera thumbnail.
 *
 * POST /api/contexts/:id/images
 * Headers: Authorization: Bearer <token>
 * Body: multipart/form-data { file, key, value, display? }
 *
 * @async
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const uploadImage = async (req, res, next) => {
  let imageUrl = null;
  let thumbnailUrl = null;

  try {
    const { id: contextId } = req.params;
    const { key, value, display } = req.body;
    const file = req.file;

    // Validaciones básicas
    if (!file) {
      throw new ValidationError('No se ha subido ningún archivo');
    }

    if (!key || !value) {
      throw new ValidationError('Los campos key y value son requeridos');
    }

    // Obtener contexto y validar límite
    const context = await getContextAndValidateLimit(contextId);

    // Validar key única
    validateUniqueKey(context, key);

    // Procesar imagen (validación, conversión a WebP, thumbnail)
    const { mainImage, thumbnail, metadata } = await imageProcessingService.processImage(file);

    // Subir imagen principal a Supabase
    imageUrl = await storageService.uploadFile(
      mainImage,
      contextId,
      'image',
      `${key}.webp`,
      'image/webp'
    );

    // Subir thumbnail
    thumbnailUrl = await storageService.uploadFile(
      thumbnail,
      contextId,
      'thumbnail',
      `${key}_thumb.webp`,
      'image/webp'
    );

    // Construir nuevo asset
    const newAsset = {
      key: key.toLowerCase(),
      value,
      display: display || value,
      imageUrl,
      thumbnailUrl
    };

    // Guardar en MongoDB
    context.assets.push(newAsset);
    await context.save();

    logger.info('Imagen subida exitosamente', {
      contextId: context.contextId,
      assetKey: key,
      uploadedBy: req.user._id,
      metadata
    });

    res.status(201).json({
      success: true,
      message: 'Imagen subida y procesada correctamente',
      data: {
        asset: newAsset,
        processing: {
          originalDimensions: `${metadata.originalWidth}x${metadata.originalHeight}`,
          format: metadata.format,
          quality: metadata.quality
        }
      }
    });
  } catch (error) {
    // Rollback: eliminar archivos subidos si falló algo después
    if (imageUrl) {
      await storageService.deleteFile(imageUrl);
    }
    if (thumbnailUrl) {
      await storageService.deleteFile(thumbnailUrl);
    }

    next(error);
  }
};

/**
 * Sube un nuevo archivo de audio y lo vincula a un contexto existente.
 * Valida el formato por magic bytes (MP3/OGG).
 *
 * POST /api/contexts/:id/audio
 * Headers: Authorization: Bearer <token>
 * Body: multipart/form-data { file, key, value, display? }
 *
 * @async
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const uploadAudio = async (req, res, next) => {
  let audioUrl = null;

  try {
    const { id: contextId } = req.params;
    const { key, value, display } = req.body;
    const file = req.file;

    // Validaciones básicas
    if (!file) {
      throw new ValidationError('No se ha subido ningún archivo');
    }

    if (!key || !value) {
      throw new ValidationError('Los campos key y value son requeridos');
    }

    // Obtener contexto y validar límite
    const context = await getContextAndValidateLimit(contextId);

    // Validar key única
    validateUniqueKey(context, key);

    // Validar audio (magic bytes, tamaño)
    const { buffer, metadata } = await audioValidationService.validateAudio(file);

    // Subir a Supabase
    audioUrl = await storageService.uploadFile(
      buffer,
      contextId,
      'audio',
      `${key}.${metadata.format}`,
      metadata.mime
    );

    // Construir nuevo asset
    const newAsset = {
      key: key.toLowerCase(),
      value,
      display: display || value,
      audioUrl
    };

    // Guardar en MongoDB
    context.assets.push(newAsset);
    await context.save();

    logger.info('Audio subido exitosamente', {
      contextId: context.contextId,
      assetKey: key,
      uploadedBy: req.user._id,
      format: metadata.formatName,
      size: metadata.size
    });

    res.status(201).json({
      success: true,
      message: 'Audio subido y vinculado correctamente',
      data: {
        asset: newAsset,
        metadata: {
          format: metadata.formatName,
          size: `${(metadata.size / 1024).toFixed(1)} KB`
        }
      }
    });
  } catch (error) {
    // Rollback: eliminar archivo si falló después de subir
    if (audioUrl) {
      await storageService.deleteFile(audioUrl);
    }

    next(error);
  }
};

/**
 * Elimina una imagen de un contexto, borrando archivos de Supabase y registro en MongoDB.
 *
 * DELETE /api/contexts/:id/images/:assetKey
 * Headers: Authorization: Bearer <token>
 *
 * @async
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const deleteImage = async (req, res, next) => {
  try {
    const { id: contextId, assetKey } = req.params;

    const context = await GameContext.findById(contextId);

    if (!context) {
      throw new NotFoundError('Contexto de juego');
    }

    // Buscar asset por key
    const assetIndex = context.assets.findIndex(
      asset => asset.key === assetKey.toLowerCase() && asset.imageUrl
    );

    if (assetIndex === -1) {
      throw new NotFoundError('Asset de imagen');
    }

    const asset = context.assets[assetIndex];

    // Verificar que queden al menos 2 assets después de eliminar
    if (context.assets.length <= 2) {
      throw new ValidationError('El contexto debe tener al menos 2 assets');
    }

    // Eliminar archivos de Supabase
    if (asset.imageUrl) {
      await storageService.deleteFile(asset.imageUrl);
    }
    if (asset.thumbnailUrl) {
      await storageService.deleteFile(asset.thumbnailUrl);
    }

    // Eliminar asset del array
    context.assets.splice(assetIndex, 1);
    await context.save();

    logger.info('Imagen eliminada exitosamente', {
      contextId: context.contextId,
      assetKey,
      deletedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Imagen eliminada correctamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Elimina un audio de un contexto, borrando archivo de Supabase y registro en MongoDB.
 *
 * DELETE /api/contexts/:id/audio/:assetKey
 * Headers: Authorization: Bearer <token>
 *
 * @async
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const deleteAudio = async (req, res, next) => {
  try {
    const { id: contextId, assetKey } = req.params;

    const context = await GameContext.findById(contextId);

    if (!context) {
      throw new NotFoundError('Contexto de juego');
    }

    // Buscar asset por key
    const assetIndex = context.assets.findIndex(
      asset => asset.key === assetKey.toLowerCase() && asset.audioUrl
    );

    if (assetIndex === -1) {
      throw new NotFoundError('Asset de audio');
    }

    const asset = context.assets[assetIndex];

    // Verificar que queden al menos 2 assets después de eliminar
    if (context.assets.length <= 2) {
      throw new ValidationError('El contexto debe tener al menos 2 assets');
    }

    // Eliminar archivo de Supabase
    if (asset.audioUrl) {
      await storageService.deleteFile(asset.audioUrl);
    }

    // Eliminar asset del array
    context.assets.splice(assetIndex, 1);
    await context.save();

    logger.info('Audio eliminado exitosamente', {
      contextId: context.contextId,
      assetKey,
      deletedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Audio eliminado correctamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtiene la configuración de límites para uploads.
 * Útil para que el frontend muestre información al usuario.
 *
 * GET /api/contexts/upload-config
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getUploadConfig = (req, res) => {
  res.json({
    success: true,
    data: {
      image: imageProcessingService.getConfig(),
      audio: audioValidationService.getConfig(),
      maxAssetsPerContext: MAX_ASSETS_PER_CONTEXT,
      storageEnabled: storageService.isEnabled()
    }
  });
};

module.exports = {
  uploadImage,
  uploadAudio,
  deleteImage,
  deleteAudio,
  getUploadConfig,
  MAX_ASSETS_PER_CONTEXT
};
