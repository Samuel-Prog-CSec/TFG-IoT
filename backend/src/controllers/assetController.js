const GameContext = require('../models/GameContext');
const storageService = require('../services/storageService');

exports.uploadAsset = async (req, res) => {
  try {
    const { contextId } = req.params;
    const { key, value, type } = req.body; // type puede ser 'image' o 'audio'
    const file = req.file; // Viene gracias a Multer

    if (!file) {
      return res.status(400).json({ success: false, error: 'No se ha subido ningún archivo' });
    }

    // 1. Verificar que el contexto existe
    const context = await GameContext.findById(contextId); // O busca por contextId string si usas ese campo
    if (!context) {
      return res.status(404).json({ success: false, error: 'Contexto no encontrado' });
    }

    // 2. Subir a Supabase (usando el ID del contexto como carpeta)
    const publicUrl = await storageService.uploadFile(file, `ctx-${contextId}`);

    // 3. Construir el nuevo objeto Asset
    const newAsset = {
      key: key,             // ej. "lion"
      value: value,         // ej. "León"
      display: value,       // Por defecto
      [type === 'audio' ? 'audioUrl' : 'imageUrl']: publicUrl // Asignación dinámica
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
    // Si falla MongoDB, idealmente deberíamos borrar la imagen de Supabase (Rollback)
    res.status(500).json({ success: false, error: error.message });
  }
};
