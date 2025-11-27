const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Variables de entorno
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Usa la Service Key para permisos de escritura backend
const BUCKET_NAME = 'game-assets';

class StorageService {
  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  /**
   * Sube un archivo a Supabase y devuelve la URL pública
   * @param {Object} file - Objeto file de Multer (buffer, mimetype, originalname)
   * @param {String} folder - Carpeta de destino (ej. 'context-id')
   */
  async uploadFile(file, folder = 'general') {
    try {
      // 1. Generar nombre único para evitar colisiones
      // Ej: 1715629123-mi-imagen.png
      const timestamp = Date.now();
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
      const filePath = `${folder}/${timestamp}-${sanitizedName}`;

      // 2. Subir el archivo (Buffer)
      const { data, error } = await this.supabase
        .storage
        .from(BUCKET_NAME)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (error) throw error;

      // 3. Obtener la URL pública
      const { data: publicUrlData } = this.supabase
        .storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      logger.info(`Archivo subido exitosamente: ${filePath}`);
      return publicUrlData.publicUrl;

    } catch (error) {
      logger.error(`Error subiendo a Supabase: ${error.message}`);
      throw new Error('Fallo en la subida del archivo');
    }
  }

  /**
   * (Opcional) Borrar archivo si eliminamos el asset del juego
   */
  async deleteFile(url) {
    // Lógica para extraer el path de la URL y llamar a .remove()
  }
}

module.exports = new StorageService();
