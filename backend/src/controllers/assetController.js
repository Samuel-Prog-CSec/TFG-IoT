/**
 * @fileoverview Controlador para la gestión de assets (recursos multimedia) de los contextos de juego.
 * Gestiona la subida de archivos y su vinculación con los registros de MongoDB.
 * @module controllers/assetController
 */

const GameContext = require('../models/GameContext');
const storageService = require('../services/storageService');

/**
 * Sube un nuevo asset (imagen o audio) y lo vincula a un contexto existente.
 *
 * Flujo de operación:
 * 1. Valida la presencia del archivo y el tipo correcto.
 * 2. Verifica la existencia del GameContext en MongoDB.
 * 3. Sube el archivo físico a Supabase Storage a través del {@link storageService}.
 * 4. Crea el objeto asset y lo añade al array de assets del contexto.
 * 5. Guarda los cambios en MongoDB.
 *
 * Implementa estrategia de ROLLBACK:
 * Si falla el guardado en MongoDB después de subir el archivo, intenta eliminar
 * el archivo de Supabase para mantener la consistencia y no dejar archivos huérfanos.
 *
 * @async
 * @function uploadAsset
 * @param {Object} req - Objeto de petición Express.
 * @param {Object} req.params - Parámetros de la URL.
 * @param {string} req.params.contextId - ID del contexto al que se añadirá el asset.
 * @param {Object} req.body - Cuerpo de la petición (multipart/form-data).
 * @param {string} req.body.key - Clave única identificadora del asset (ej: 'lion').
 * @param {string} req.body.value - Valor o etiqueta del asset (ej: 'León').
 * @param {string} req.body.type - Tipo de asset: 'image' | 'audio'.
 * @param {Object} req.file - Archivo subido procesado por Multer.
 * @param {Object} res - Objeto de respuesta Express.
 * @returns {Promise<void>} Envía una respuesta JSON con el asset creado o un error.
 */
exports.uploadAsset = async (req, res) => {
  let publicUrl = null;

  try {
    const { contextId } = req.params;
    const { key, value, type } = req.body; // type: 'image' | 'audio'
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No se ha subido ningún archivo' });
    }

    if (!['image', 'audio'].includes(type)) {
      return res.status(400).json({ success: false, error: 'El tipo debe ser "image" o "audio"' });
    }

    // 1. Verificar que el contexto existe
    const context = await GameContext.findById(contextId);
    if (!context) {
      return res.status(404).json({ success: false, error: 'Contexto no encontrado' });
    }

    // 2. Subir a Supabase
    // Pasamos fileName, contextId y type para ordenar la carpeta
    publicUrl = await storageService.uploadFile(file, contextId, type);

    // 3. Construir el nuevo objeto Asset
    const newAsset = {
      key,
      value,
      display: value,
      // Asignación dinámica según el tipo
      imageUrl: type === 'image' ? publicUrl : undefined,
      audioUrl: type === 'audio' ? publicUrl : undefined
    };

    // 4. Guardar en MongoDB
    context.assets.push(newAsset);
    await context.save();

    res.status(201).json({
      success: true,
      data: newAsset,
      message: 'Asset subido y vinculado correctamente'
    });
  } catch (error) {
    // Rollback: Si falló algo después de subir la imagen (ej: error en mongo),
    // intentamos borrar la imagen de Supabase para no dejar basura.
    if (publicUrl) {
      await storageService.deleteFile(publicUrl);
    }

    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Elimina un asset de un contexto, borrando tanto el archivo de Supabase como el registro en MongoDB.
 *
 * Flujo de operación:
 * 1. Busca el contexto y el asset específico dentro del array de assets.
 * 2. Si el asset tiene URLs asociadas (imagen o audio), llama a {@link storageService.deleteFile} para limpiar Supabase.
 * 3. Elimina el subdocumento del array de assets usando el método `pull()`.
 * 4. Guarda el contexto actualizado.
 *
 * @async
 * @function deleteAsset
 * @param {Object} req - Objeto de petición Express.
 * @param {string} req.params.contextId - ID del contexto.
 * @param {string} req.params.assetId - ID (_id) del asset a eliminar.
 * @param {Object} res - Objeto de respuesta Express.
 * @returns {Promise<void>}
 */
exports.deleteAsset = async (req, res) => {
  try {
    const { contextId, assetId } = req.params;

    // 1. Buscar el contexto
    const context = await GameContext.findById(contextId);
    if (!context) {
      return res.status(404).json({ success: false, error: 'Contexto no encontrado' });
    }

    // 2. Buscar el asset dentro del array
    const asset = context.assets.id(assetId);
    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset no encontrado' });
    }

    // 3. Eliminar archivos de Supabase si existen
    if (asset.imageUrl) {
      await storageService.deleteFile(asset.imageUrl);
    }
    if (asset.audioUrl) {
      await storageService.deleteFile(asset.audioUrl);
    }

    // 4. Eliminar el asset del array y guardar
    context.assets.pull({ _id: assetId });
    await context.save();

    res.status(200).json({
      success: true,
      message: 'Asset eliminado correctamente'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};
