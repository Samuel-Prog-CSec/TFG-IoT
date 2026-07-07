/**
 * @fileoverview Controlador para la gestión de assets (recursos multimedia) de los contextos de juego.
 * Gestiona la subida de imágenes (WebP) y audio (MP3/OGG) con validación y procesamiento.
 * @module controllers/assetController
 */

const gameContextRepository = require('../repositories/gameContextRepository.js');
const cardDeckRepository = require('../repositories/cardDeckRepository');
const storageService = require('../services/storageService.js');
const imageProcessingService = require('../services/imageProcessingService.js');
const audioValidationService = require('../services/audioValidationService.js');
const logger = require('../utils/logger');
const {
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError
} = require('../utils/errors');
const { toAssetDTOV1 } = require('../utils/dtos');
const { sendSuccess, sendCreated } = require('../utils/responseHelper');
const { invalidateContextCaches } = require('../utils/cacheInvalidators/contextCacheInvalidator');

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
  const context = await gameContextRepository.findById(contextId);

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
 * Politica de autorizacion para borrar/modificar un asset existente.
 *
 * Reglas (ver Architecture_Decisions ADR-053):
 * - El asset solo puede gestionarlo el profesor que lo subio (asset.uploadedBy === user._id).
 * - Assets sin uploadedBy son "del sistema" (seedeados como base del producto) y nadie
 *   puede eliminarlos individualmente. La unica forma de eliminarlos es borrar el
 *   contexto entero, accion exclusiva del super_admin.
 * - El super_admin NO tiene override sobre assets individuales: su responsabilidad es
 *   gestionar contextos como "carpetas", no gestionar el contenido subido por
 *   profesores.
 *
 * @param {Object} asset - Subdocumento asset
 * @param {Object} user - req.user
 * @throws {ForbiddenError} Si el usuario no esta autorizado
 */
function assertCanManageAsset(asset, user) {
  if (!asset.uploadedBy) {
    throw new ForbiddenError(
      'Este asset es parte de la base del contexto y no puede eliminarse individualmente'
    );
  }

  // uploadedBy es un ObjectId; comparamos via toString por robustez
  if (asset.uploadedBy.toString() !== user._id.toString()) {
    throw new ForbiddenError(
      'Solo el profesor que subio este asset puede eliminarlo o reemplazar su audio'
    );
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
const uploadImage = async (req, res) => {
  let imageUrl = null;
  let thumbnailUrl = null;

  // Rollback: elimina archivos subidos en caso de fallo posterior
  try {
    const { id } = req.params;
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
    const context = await getContextAndValidateLimit(id);

    // Validar key única
    validateUniqueKey(context, key);

    // Procesar imagen (validación, conversión a WebP, thumbnail)
    const { mainImage, thumbnail, metadata } = await imageProcessingService.processImage(file);

    // Subir imagen principal a Supabase (usa context.contextId para path estable)
    imageUrl = await storageService.uploadFile(
      mainImage,
      context.contextId,
      'image',
      `${key}.webp`,
      'image/webp'
    );

    // Subir thumbnail
    thumbnailUrl = await storageService.uploadFile(
      thumbnail,
      context.contextId,
      'thumbnail',
      `${key}_thumb.webp`,
      'image/webp'
    );

    // Construir nuevo asset (incluye dominantColor para LQIP en frontend
    // y uploadedBy para la politica de gestion: solo el creador o super_admin pueden borrar)
    const newAsset = {
      key: key.toLowerCase(),
      value,
      display: display || value,
      imageUrl,
      thumbnailUrl,
      dominantColor: metadata.dominantColor,
      uploadedBy: req.user._id
    };

    // Guardar en MongoDB
    context.assets.push(newAsset);
    await context.save();

    // Invalidar caches de detalle/lista de contextos. Sin esto, el GET
    // /contexts/:id sigue devolviendo el snapshot Redis previo y la UI muestra
    // "0 assets en total" hasta que el TTL expira (QA 26/04/2026).
    await invalidateContextCaches(context._id.toString(), context.contextId);

    logger.info('Imagen subida exitosamente', {
      contextId: context.contextId,
      assetKey: key,
      uploadedBy: req.user._id,
      metadata
    });

    sendCreated(
      res,
      {
        asset: toAssetDTOV1(newAsset),
        processing: {
          originalDimensions: `${metadata.originalWidth}x${metadata.originalHeight}`,
          format: metadata.format,
          quality: metadata.quality
        }
      },
      'Imagen subida y procesada correctamente'
    );
  } catch (error) {
    // Rollback: eliminar archivos subidos si falló algo después
    if (imageUrl) {
      await storageService.deleteFile(imageUrl);
    }
    if (thumbnailUrl) {
      await storageService.deleteFile(thumbnailUrl);
    }

    throw error;
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
const uploadAudio = async (req, res) => {
  let audioUrl = null;

  // Rollback: elimina archivos subidos en caso de fallo posterior
  try {
    const { id } = req.params;
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
    const context = await getContextAndValidateLimit(id);

    // Validar key única
    validateUniqueKey(context, key);

    // Validar audio (magic bytes, tamaño)
    const { buffer, metadata } = await audioValidationService.validateAudio(file);

    // Subir a Supabase (usa context.contextId para path estable)
    audioUrl = await storageService.uploadFile(
      buffer,
      context.contextId,
      'audio',
      `${key}.${metadata.format}`,
      metadata.mime
    );

    // Construir nuevo asset (uploadedBy define la politica de gestion del asset)
    const newAsset = {
      key: key.toLowerCase(),
      value,
      display: display || value,
      audioUrl,
      uploadedBy: req.user._id
    };

    // Guardar en MongoDB
    context.assets.push(newAsset);
    await context.save();

    // Invalidar caches igual que en uploadImage para que el detalle del
    // contexto refleje el nuevo audio sin esperar al TTL (QA 26/04/2026).
    await invalidateContextCaches(context._id.toString(), context.contextId);

    logger.info('Audio subido exitosamente', {
      contextId: context.contextId,
      assetKey: key,
      uploadedBy: req.user._id,
      format: metadata.formatName,
      size: metadata.size,
      durationSeconds: metadata.durationSeconds
    });

    sendCreated(
      res,
      {
        asset: toAssetDTOV1(newAsset),
        metadata: {
          format: metadata.formatName,
          size: `${(metadata.size / 1024).toFixed(1)} KB`,
          durationSeconds: metadata.durationSeconds
        }
      },
      'Audio subido y vinculado correctamente'
    );
  } catch (error) {
    // Rollback: eliminar archivo si falló después de subir
    if (audioUrl) {
      await storageService.deleteFile(audioUrl);
    }

    throw error;
  }
};

/**
 * Comprueba que ningún mazo ACTIVO del contexto referencie el valor del asset
 * que se va a borrar. Los mazos copian las URLs del asset en `cardMappings[]`
 * como snapshot; borrar el asset dejaría esas URLs muertas (404 en partida, sin
 * aviso). Bloqueamos con 409 para que el docente/admin edite o archive esos
 * mazos primero (AS-1). Solo mazos ACTIVOS: los archivados/historial no deben
 * impedir la limpieza de assets.
 *
 * @param {import('mongoose').Types.ObjectId} contextMongoId
 * @param {string} assetValue
 * @throws {ConflictError} si hay mazos activos que lo usan.
 */
async function assertAssetNotInUseByActiveDecks(contextMongoId, assetValue) {
  const count = await cardDeckRepository.count({
    contextId: contextMongoId,
    status: 'active',
    'cardMappings.assignedValue': assetValue
  });
  if (count > 0) {
    throw new ConflictError(
      `No se puede eliminar: ${count} mazo(s) activo(s) usan este recurso. ` +
        'Edita o archiva esos mazos antes de borrarlo para no dejar tarjetas sin imagen.'
    );
  }
}

/**
 * Borra los ficheros de un asset en Storage best-effort (nunca lanza). Se llama
 * DESPUÉS de persistir Mongo (patrón H2): si un borrado de Storage falla, el
 * fichero queda huérfano y purgable, pero el estado en BD ya es consistente.
 * El orden inverso (Storage strict primero) dejaba el asset en Mongo con URLs
 * muertas si el `save()` posterior fallaba.
 *
 * @param {Array<string|undefined>} urls
 * @param {Object} logContext
 */
async function deleteStorageFilesBestEffort(urls, logContext) {
  for (const url of urls) {
    if (!url) {
      continue;
    }
    try {
      await storageService.deleteFile(url);
    } catch (error) {
      logger.warn('Fichero de Storage huérfano tras borrado de asset (purgable)', {
        ...logContext,
        url,
        message: error.message
      });
    }
  }
}

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
const deleteImage = async (req, res) => {
  const { id: contextId, assetKey } = req.params;

  const context = await gameContextRepository.findById(contextId);

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

  // Politica de ownership: solo el creador o super_admin puede borrar
  assertCanManageAsset(asset, req.user);

  // AS-1: no borrar si mazos activos lo usan (evita URLs muertas en partidas).
  await assertAssetNotInUseByActiveDecks(context._id, asset.value);

  // Snapshot de URLs antes de mutar el documento.
  const urlsToDelete = [asset.imageUrl, asset.thumbnailUrl, asset.audioUrl];

  // AS-4 (patrón H2): persistir Mongo PRIMERO; Storage después best-effort. Antes
  // se borraba Storage (strict) primero y luego se guardaba Mongo — si el save
  // fallaba, los ficheros ya no existían pero el asset seguía en el contexto
  // (URLs muertas para todos los profesores).
  context.assets.splice(assetIndex, 1);
  await context.save();

  await invalidateContextCaches(context._id.toString(), context.contextId);

  await deleteStorageFilesBestEffort(urlsToDelete, {
    contextId: context.contextId,
    assetKey
  });

  logger.info('Asset eliminado exitosamente (imagen + audio)', {
    contextId: context.contextId,
    assetKey,
    hadAudio: Boolean(asset.audioUrl),
    deletedBy: req.user._id
  });

  sendSuccess(res, null, 'Asset eliminado correctamente');
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
const deleteAudio = async (req, res) => {
  const { id: contextId, assetKey } = req.params;

  const context = await gameContextRepository.findById(contextId);

  if (!context) {
    throw new NotFoundError('Contexto de juego');
  }

  // Buscar asset por key que tenga audio
  const assetIndex = context.assets.findIndex(
    asset => asset.key === assetKey.toLowerCase() && asset.audioUrl
  );

  if (assetIndex === -1) {
    throw new NotFoundError('Asset de audio');
  }

  const asset = context.assets[assetIndex];

  // Politica de ownership: solo el creador del asset o super_admin pueden borrar el audio
  assertCanManageAsset(asset, req.user);

  // Smart delete: si el asset tiene imagen, solo eliminar audioUrl (conservar asset)
  // Si el asset NO tiene imagen, eliminar el asset completo del array
  const hasImage = Boolean(asset.imageUrl || asset.thumbnailUrl);
  const audioUrlToDelete = asset.audioUrl;

  if (hasImage) {
    // AS-4 (patrón H2): persistir Mongo primero, luego Storage best-effort.
    asset.audioUrl = undefined;
    await context.save();

    await invalidateContextCaches(context._id.toString(), context.contextId);

    await deleteStorageFilesBestEffort([audioUrlToDelete], {
      contextId: context.contextId,
      assetKey
    });

    logger.info('Audio desvinculado de asset (imagen conservada)', {
      contextId: context.contextId,
      assetKey,
      deletedBy: req.user._id
    });

    sendSuccess(res, { asset: toAssetDTOV1(asset) }, 'Audio eliminado del asset');
  } else {
    // Se elimina el asset COMPLETO (solo tenía audio): mismo guard AS-1 que
    // deleteImage — un mazo activo podría referenciar su value.
    await assertAssetNotInUseByActiveDecks(context._id, asset.value);

    context.assets.splice(assetIndex, 1);
    await context.save();

    await invalidateContextCaches(context._id.toString(), context.contextId);

    await deleteStorageFilesBestEffort([audioUrlToDelete], {
      contextId: context.contextId,
      assetKey
    });

    logger.info('Asset de solo-audio eliminado', {
      contextId: context.contextId,
      assetKey,
      deletedBy: req.user._id
    });

    sendSuccess(res, null, 'Asset de audio eliminado correctamente');
  }
};

/**
 * Adjunta o reemplaza un archivo de audio en un asset existente.
 * Si el asset ya tiene audio, elimina el archivo anterior de Supabase antes de subir el nuevo.
 *
 * PATCH /api/contexts/:id/assets/:assetKey/audio
 * Headers: Authorization: Bearer <token>
 * Body: multipart/form-data { file }
 *
 * @async
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const attachAudio = async (req, res) => {
  let newAudioUrl = null;

  try {
    const { id, assetKey } = req.params;
    const file = req.file;

    if (!file) {
      throw new ValidationError('No se ha subido ningún archivo de audio');
    }

    const context = await gameContextRepository.findById(id);

    if (!context) {
      throw new NotFoundError('Contexto de juego');
    }

    // Buscar asset existente por key
    const asset = context.assets.find(a => a.key === assetKey.toLowerCase());

    if (!asset) {
      throw new NotFoundError('Asset');
    }

    // Politica de ownership: adjuntar/reemplazar audio sigue la misma regla que borrar
    assertCanManageAsset(asset, req.user);

    // Validar audio (magic bytes, tamaño, duración)
    const { buffer, metadata } = await audioValidationService.validateAudio(file);

    // Snapshot del audio viejo antes de tocar nada. Solo lo borraremos del
    // Storage tras persistir Mongo con éxito; así, si la subida nueva o el
    // `context.save()` fallan, el rollback elimina solo el archivo nuevo y
    // el asset conserva su audio antiguo (QA 26/04/2026 — antes el rollback
    // dejaba al asset con `audioUrl` apuntando a un archivo ya borrado).
    const oldAudioUrl = asset.audioUrl;

    // Subir nuevo audio a Supabase
    newAudioUrl = await storageService.uploadFile(
      buffer,
      context.contextId,
      'audio',
      `${assetKey}.${metadata.format}`,
      metadata.mime
    );

    // Actualizar audioUrl en el subdocumento (con el nuevo)
    asset.audioUrl = newAudioUrl;
    await context.save();

    // A partir de aquí Mongo ya apunta al archivo nuevo: borramos el
    // antiguo. Si esta limpieza fallara, el resultado funcional sigue
    // siendo correcto (queda un archivo huérfano que se podrá purgar
    // por el job de retención); por eso no abortamos la respuesta.
    if (oldAudioUrl && oldAudioUrl !== newAudioUrl) {
      try {
        await storageService.deleteFile(oldAudioUrl);
      } catch (cleanupErr) {
        logger.warn('attachAudio: fallo al borrar audio antiguo', {
          contextId: context.contextId,
          assetKey,
          oldAudioUrl,
          error: cleanupErr.message
        });
      }
    }

    // Invalidar caches igual que en uploadImage/uploadAudio para que el
    // detalle del contexto refleje el cambio de audio inmediatamente
    // (QA 26/04/2026).
    await invalidateContextCaches(context._id.toString(), context.contextId);

    logger.info('Audio adjuntado a asset exitosamente', {
      contextId: context.contextId,
      assetKey,
      replaced: Boolean(oldAudioUrl),
      uploadedBy: req.user._id,
      format: metadata.formatName,
      durationSeconds: metadata.durationSeconds
    });

    sendSuccess(
      res,
      {
        asset: toAssetDTOV1(asset),
        metadata: {
          format: metadata.formatName,
          size: `${(metadata.size / 1024).toFixed(1)} KB`,
          durationSeconds: metadata.durationSeconds,
          replaced: Boolean(oldAudioUrl)
        }
      },
      oldAudioUrl ? 'Audio reemplazado correctamente' : 'Audio adjuntado correctamente'
    );
  } catch (error) {
    // Rollback: eliminar archivo nuevo si falló después de subir
    if (newAudioUrl) {
      await storageService.deleteFile(newAudioUrl);
    }

    throw error;
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
  sendSuccess(res, {
    image: imageProcessingService.getConfig(),
    audio: audioValidationService.getConfig(),
    maxAssetsPerContext: MAX_ASSETS_PER_CONTEXT,
    storageEnabled: storageService.isEnabled()
  });
};

module.exports = {
  uploadImage,
  uploadAudio,
  attachAudio,
  deleteImage,
  deleteAudio,
  getUploadConfig,
  MAX_ASSETS_PER_CONTEXT
};
