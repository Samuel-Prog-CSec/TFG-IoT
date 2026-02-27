/**
 * @fileoverview Servicio de almacenamiento para la integración con Supabase Storage.
 * Gestiona la subida, organización y eliminación de assets multimedia (imágenes y audio).
 * @module services/storageService
 * @requires @supabase/supabase-js
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('node:path');
const logger = require('../utils/logger').child({ component: 'storageService' });
const { CircuitBreaker } = require('../utils/circuitBreaker');

// Variables de entorno
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Service Key para permisos de escritura backend
const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'game-assets';

/**
 * Configuración del servicio de storage.
 * @constant {Object}
 */
const STORAGE_CONFIG = {
  // Longitud máxima para nombres de archivo sanitizados
  MAX_FILENAME_LENGTH: 50
};

const storageBreaker = new CircuitBreaker({
  name: 'supabase-storage',
  failureThreshold: Number.parseInt(process.env.STORAGE_BREAKER_THRESHOLD, 10) || 4,
  successThreshold: Number.parseInt(process.env.STORAGE_BREAKER_SUCCESS_THRESHOLD, 10) || 2,
  resetTimeoutMs: Number.parseInt(process.env.STORAGE_BREAKER_TIMEOUT_MS, 10) || 20000
});

/**
 * Clase Singleton para interactuar con el bucket de almacenamiento de Supabase.
 * Implementa el patrón Singleton implícito al exportar una instancia.
 */
class StorageService {
  /**
   * Inicializa el cliente de Supabase.
   * - Producción: falla FAST si faltan credenciales.
   * - Desarrollo/Test: deshabilita el servicio con warning claro.
   */
  constructor() {
    this.enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

    if (!this.enabled) {
      const message =
        'Credenciales de Supabase faltantes. ' +
        'Configura SUPABASE_URL y SUPABASE_SERVICE_KEY para habilitar Storage.';

      if (process.env.NODE_ENV === 'production') {
        throw new Error(message);
      }

      logger.warn(message);
      this.supabase = null;
      return;
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  /**
   * Sube un archivo al bucket de Supabase con una organización estructura por contexto.
   *
   * Estrategia de nombrado: `ctx-{contextId}/{type}/{timestamp}-{sanitizedFilename}`
   * Esto garantiza orden y evita colisiones de nombres.
   *
   * @async
   * @param {Buffer} buffer - El contenido binario del archivo.
   * @param {string} contextId - El ID del GameContext asociado (para crear la carpeta contenedora).
   * @param {string} type - Categoría del asset ('image', 'audio', 'thumbnail').
   * @param {string} originalFilename - El nombre original del archivo subido.
   * @param {string} mimeType - El tipo MIME del archivo (ej: 'image/webp').
   * @returns {Promise<string>} La URL pública absoluta del archivo subido.
   * @throws {Error} Si ocurre un error durante la subida o la configuración de Supabase.
   */
  async uploadFile(buffer, contextId, type, originalFilename, mimeType) {
    try {
      if (!storageBreaker.canRequest()) {
        logger.warn('Storage: Circuito abierto, subida omitida', { type, contextId });
        throw new Error('Storage temporalmente no disponible');
      }

      if (!this.enabled || !this.supabase) {
        throw new Error('Storage deshabilitado: faltan credenciales de Supabase');
      }

      // 1. Generar nombre único y path sanitizado
      const timestamp = Date.now();
      const sanitizedName = this.sanitizeFilename(originalFilename);
      // Folder structure: ctx-123/image/123456-lion.webp
      const filePath = `ctx-${contextId}/${type}/${timestamp}-${sanitizedName}`;

      // 2. Subir el archivo (Buffer)
      const { error } = await this.supabase.storage.from(BUCKET_NAME).upload(filePath, buffer, {
        contentType: mimeType,
        upsert: false
      });

      if (error) {
        throw error;
      }

      // 3. Obtener la URL pública
      const { data: publicUrlData } = this.supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      logger.info('Archivo subido exitosamente', { filePath, type, size: buffer.length });
      storageBreaker.recordSuccess();
      return publicUrlData.publicUrl;
    } catch (error) {
      storageBreaker.recordFailure();
      logger.error('Error subiendo a Supabase', { error: error.message, type, contextId });
      throw new Error('Fallo en la subida del archivo');
    }
  }

  /**
   * Sanitiza el nombre de archivo para prevenir ataques de path traversal y caracteres inválidos.
   *
   * @param {string} filename - Nombre original del archivo
   * @returns {string} Nombre sanitizado seguro
   */
  sanitizeFilename(filename) {
    // Extraer extensión y base por separado
    const ext = path.extname(filename).toLowerCase();
    const base = path.basename(filename, ext);

    // Sanitizar la base: solo alfanuméricos y guiones bajos
    const sanitizedBase = base
      .replaceAll(/[^a-zA-Z0-9]/g, '_')
      .replaceAll(/_+/g, '_') // Colapsar múltiples guiones bajos
      .replaceAll(/(^_)|(_$)/g, '') // Eliminar guiones al inicio/final
      .substring(0, STORAGE_CONFIG.MAX_FILENAME_LENGTH);

    // Devolver con extensión si existe
    return sanitizedBase ? `${sanitizedBase}${ext}` : `file${ext}`;
  }

  /**
   * Elimina un archivo de Supabase dado su URL pública.
   * Se utiliza principalmente para operaciones de rollback (limpieza tras error) o gestión de borrado.
   *
   * @async
   * @param {string} publicUrl - URL pública completa del activo a eliminar.
   * @param {{ strict?: boolean }} [options] - Si strict=true, lanza error ante cualquier fallo.
   * @returns {Promise<void>}
   */
  async deleteFile(publicUrl, options = {}) {
    const { strict = false } = options;

    try {
      if (!storageBreaker.canRequest()) {
        logger.warn('Storage: Circuito abierto, borrado omitido');
        if (strict) {
          throw new Error('Storage no disponible (circuit breaker abierto)');
        }
        return;
      }

      if (!this.enabled || !this.supabase) {
        // En dev/test, si Storage está deshabilitado, ignorar borrados de rollback.
        if (strict) {
          throw new Error('Storage deshabilitado: no se puede eliminar el archivo');
        }
        return;
      }
      // Extraer el path relativo desde la URL
      // URL típica: https://xyz.supabase.co/storage/v1/object/public/game-assets/ctx-123/image/abc.png
      // Necesitamos: ctx-123/image/abc.png
      const splitUrl = publicUrl.split(`${BUCKET_NAME}/`);
      if (splitUrl.length < 2) {
        logger.warn(`No se pudo extraer path de la URL: ${publicUrl}`);
        if (strict) {
          throw new Error('URL de Storage inválida: no se pudo extraer el path');
        }
        return;
      }

      const filePath = splitUrl[1];

      const { error } = await this.supabase.storage.from(BUCKET_NAME).remove([filePath]);

      if (error) {
        throw error;
      }

      logger.info('Archivo eliminado exitosamente', { filePath });
      storageBreaker.recordSuccess();
    } catch (error) {
      storageBreaker.recordFailure();
      logger.error('Error eliminando de Supabase', { error: error.message, publicUrl });
      if (strict) {
        throw new Error(`Error eliminando archivo en Storage: ${error.message}`);
      }
      // En modo no estricto no lanzamos error para no romper flujos de rollback.
    }
  }

  /**
   * Lista todos los archivos bajo un prefijo de carpeta en el bucket.
   * Usado internamente para operaciones de borrado masivo de contextos.
   *
   * Nota: `supabase.storage.list()` no es recursivo, por lo que se llama
   * explícitamente para cada subcarpeta conocida (image, thumbnail, audio).
   *
   * @async
   * @param {string} prefix - Prefijo de la carpeta (ej: 'ctx-686a1b/image')
   * @returns {Promise<string[]>} Array de paths relativos de los archivos encontrados
   */
  async listFiles(prefix) {
    if (!this.enabled || !this.supabase) {
      return [];
    }

    try {
      const { data, error } = await this.supabase.storage
        .from(BUCKET_NAME)
        .list(prefix, { limit: 1000, offset: 0 });

      if (error) {
        logger.error('Error listando archivos en Storage', { prefix, error: error.message });
        throw new Error(`Error listando archivos en Storage (${prefix}): ${error.message}`);
      }

      // Filtrar solo objetos reales (Supabase devuelve items con id null para carpetas virtuales)
      return (data || []).filter(item => item.id !== null).map(item => `${prefix}/${item.name}`);
    } catch (err) {
      logger.error('Excepción listando archivos en Storage', { prefix, error: err.message });
      throw new Error(`Excepción listando archivos en Storage (${prefix}): ${err.message}`);
    }
  }

  /**
   * Elimina todos los archivos de un contexto en Supabase Storage.
   *
   * Borra las subcarpetas: image/, thumbnail/ y audio/ bajo ctx-{contextObjectId}/.
   * Se llama justo antes de eliminar el documento GameContext de MongoDB.
   *
   * Política de fallos: hard-fail — si Supabase falla, se lanza excepción y
   * NO se permite eliminar el documento en MongoDB para preservar consistencia
   * fuerte entre BD y Storage.
   *
   * @async
   * @param {string} contextObjectId - El MongoDB ObjectId del contexto (como string)
   * @returns {Promise<void>}
   */
  async deleteFolder(contextObjectId) {
    // Si Storage está deshabilitado intencionalmente (entorno sin credenciales), omitir en silencio.
    // En producción las credenciales son obligatorias; en development local puede faltar SUPABASE_SERVICE_KEY.
    if (!this.enabled || !this.supabase) {
      logger.warn('Storage deshabilitado: omitiendo limpieza de carpeta del contexto', {
        contextObjectId
      });
      return;
    }

    // Circuit breaker abierto → Supabase no está disponible en este momento.
    // Lanzar error para que el controller revierta la operación y devuelva error al cliente.
    if (!storageBreaker.canRequest()) {
      const err = new Error(
        'Storage no disponible (circuit breaker abierto): no se puede garantizar la limpieza de archivos'
      );
      logger.error('Storage: Circuito abierto, deleteFolder bloqueado', { contextObjectId });
      throw err;
    }

    const folderPrefix = `ctx-${contextObjectId}`;
    const subfolders = ['image', 'thumbnail', 'audio'];

    try {
      // Listar todos los archivos de cada subcarpeta en paralelo
      const fileLists = await Promise.all(
        subfolders.map(sub => this.listFiles(`${folderPrefix}/${sub}`))
      );

      const allPaths = fileLists.flat();

      if (allPaths.length === 0) {
        logger.info('Carpeta de contexto vacía o inexistente en Storage, nada que eliminar', {
          folderPrefix
        });
        return;
      }

      // Borrado masivo con la API de Supabase (permite hasta 1000 paths por llamada)
      const { error } = await this.supabase.storage.from(BUCKET_NAME).remove(allPaths);

      if (error) {
        storageBreaker.recordFailure();
        logger.error('Error en borrado masivo de carpeta de contexto', {
          folderPrefix,
          error: error.message,
          filesAttempted: allPaths.length
        });
        throw new Error(`Error al eliminar archivos de Storage: ${error.message}`);
      }

      storageBreaker.recordSuccess();
      logger.info('Carpeta de contexto eliminada de Storage', {
        folderPrefix,
        filesDeleted: allPaths.length
      });
    } catch (err) {
      // Si el error ya fue lanzado por nosotros, re-lanzarlo directamente
      if (err.message?.startsWith('Error al eliminar archivos')) {
        throw err;
      }
      storageBreaker.recordFailure();
      logger.error('Excepción en deleteFolder', { folderPrefix, error: err.message });
      throw new Error(`Fallo inesperado al limpiar Storage del contexto: ${err.message}`);
    }
  }

  /**
   * Verifica si el servicio de storage está habilitado.
   *
   * @returns {boolean} true si el servicio está disponible
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Obtiene el nombre del bucket actual.
   *
   * @returns {string} Nombre del bucket
   */
  getBucketName() {
    return BUCKET_NAME;
  }
}

module.exports = new StorageService();
module.exports.STORAGE_CONFIG = STORAGE_CONFIG;
