const express = require('express');
const router = express.Router();
const multer = require('multer');
const assetController = require('../controllers/assetController');

// Configuración de Multer: Guardar en memoria (RAM) para pasar a Supabase
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // Límite de 50MB
  }
});

// POST /api/contexts/:contextId/assets
// 'file' es el nombre del campo en el formulario del frontend
router.post('/:contextId/assets', upload.single('file'), assetController.uploadAsset);

// DELETE /api/contexts/:contextId/assets/:assetId
// Elimina un asset específico del contexto
router.delete('/:contextId/assets/:assetId', assetController.deleteAsset);

module.exports = router;
