/**
 * @fileoverview Servicio de almacenamiento para la integración con Supabase Storage.
 * Gestiona la subida, organización y eliminación de assets multimedia (imágenes y audio).
 * @module services/storageService
 * @requires @supabase/supabase-js
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Variables de entorno
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Service Key para permisos de escritura backend
const BUCKET_NAME = 'game-assets';

/**
 * Clase Singleton para interactuar con el bucket de almacenamiento de Supabase.
 * Implementa el patrón Singleton implícito al exportar una instancia.
 */
class StorageService {
  /**
   * Inicializa el cliente de Supabase.
   * Si faltan credenciales, configura un cliente dummy para evitar crash en tests/despliegue incompleto.
   */
  constructor() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      logger.warn('Supabase credentials missing. Storage service will not work as expected.');
    }
    this.supabase = createClient(
      SUPABASE_URL || 'https://placeholder.supabase.co',
      SUPABASE_KEY || 'placeholder'
    );
  }

  /**
   * Sube un archivo al bucket de Supabase con una organización estructura por contexto.
   *
   * Estrategia de nombrado: `ctx-{contextId}/{type}/{timestamp}-{sanitizedFilename}`
   * Esto garantiza orden y evita colisiones de nombres.
   *
   * @async
   * @param {Object} file - Objeto file proporcionado por Multer.
   * @param {Buffer} file.buffer - El contenido binario del archivo.
   * @param {string} file.mimetype - El tipo MIME del archivo (ej: 'image/png').
   * @param {string} file.originalname - El nombre original del archivo subido.
   * @param {string} contextId - El ID del GameContext asociado (para crear la carpeta carpeta contenedora).
   * @param {string} [type='misc'] - Categoría del asset ('image' o 'audio') para subcarpeta.
   * @returns {Promise<string>} La URL pública absoluta del archivo subido.
   * @throws {Error} Si ocurre un error durante la subida o la configuración de Supabase.
   */
  async uploadFile(file, contextId, type = 'misc') {
    try {
      // 1. Generar nombre único y path
      const timestamp = Date.now();
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
      // Folder structure: ctx-123/image/123456-lion.png
      const filePath = `ctx-${contextId}/${type}/${timestamp}-${sanitizedName}`;

      // 2. Subir el archivo (Buffer)
      const { error } = await this.supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (error) {
        throw error;
      }

      // 3. Obtener la URL pública
      const { data: publicUrlData } = this.supabase.storage
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
   * Elimina un archivo de Supabase dado su URL pública.
   * Se utiliza principalmente para operaciones de rollback (limpieza tras error) o gestión de borrado.
   *
   * @async
   * @param {string} publicUrl - URL pública completa del activo a eliminar.
   * @returns {Promise<void>}
   */
  async deleteFile(publicUrl) {
    try {
      // Extraer el path relativo desde la URL
      // URL típica: https://xyz.supabase.co/storage/v1/object/public/game-assets/ctx-123/image/abc.png
      // Necesitamos: ctx-123/image/abc.png
      const splitUrl = publicUrl.split(`${BUCKET_NAME}/`);
      if (splitUrl.length < 2) {
        logger.warn(`No se pudo extraer path de la URL: ${publicUrl}`);
        return;
      }

      const filePath = splitUrl[1];

      const { error } = await this.supabase.storage.from(BUCKET_NAME).remove([filePath]);

      if (error) {
        throw error;
      }

      logger.info(`Archivo eliminado exitosamente: ${filePath}`);
    } catch (error) {
      logger.error(`Error eliminando de Supabase: ${error.message}`);
      // No lanzamos error para no romper flujos principales si falla la limpieza,
      // pero logueamos el error.
    }
  }
}

module.exports = new StorageService();
