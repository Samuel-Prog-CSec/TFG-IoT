/**
 * @fileoverview Servicio de validación de archivos de audio.
 * Valida formatos por magic bytes y tamaño de archivo.
 * @module services/audioValidationService
 * @requires file-type
 */

const fileType = require('file-type');
const logger = require('../utils/logger').child({ component: 'audioValidationService' });
const { ValidationError } = require('../utils/errors');

/**
 * Configuración de validación de audio.
 * @constant {Object}
 */
const AUDIO_CONFIG = {
  // Formatos de audio permitidos
  ALLOWED_MIMES: ['audio/mpeg', 'audio/ogg', 'audio/mp3'],
  ALLOWED_EXTENSIONS: ['.mp3', '.ogg'],

  // Tamaño máximo de archivo (5MB - suficiente para clips educativos cortos)
  MAX_SIZE: 5 * 1024 * 1024,

  // Duración permitida para clips educativos
  MIN_DURATION_SECONDS: 0.3,
  MAX_DURATION_SECONDS: 45,

  // Duración máxima recomendada (informativo, no validado server-side)
  RECOMMENDED_MAX_DURATION_SECONDS: 30
};

/**
 * Mapeo de MIME types a nombres amigables.
 * @constant {Object}
 */
const MIME_TO_NAME = {
  'audio/mpeg': 'MP3',
  'audio/mp3': 'MP3',
  'audio/ogg': 'OGG'
};

/**
 * Clase de servicio para validación de archivos de audio.
 * Implementa validación por magic bytes para prevenir falsificación de extensiones.
 */
class AudioValidationService {
  /**
   * Valida un archivo de audio.
   *
   * @async
   * @param {Object} file - Objeto file de Multer
   * @param {Buffer} file.buffer - Contenido binario del archivo
   * @param {string} file.originalname - Nombre original del archivo
   * @param {string} file.mimetype - MIME type declarado
   * @param {number} file.size - Tamaño en bytes
   * @returns {Promise<{buffer: Buffer, metadata: Object}>}
   * @throws {ValidationError} Si el archivo no cumple los requisitos
   */
  async validateAudio(file) {
    this.validateFilePresence(file);

    // 1. Validar tamaño
    this.validateSize(file);

    // 2. Validar tipo real por magic bytes
    const detectedType = await this.validateMagicBytes(file.buffer);

    // 3. Validar duración real del archivo
    const durationSeconds = await this.validateDuration(file.buffer, detectedType.mime);

    logger.info('Audio validado exitosamente', {
      originalName: file.originalname,
      size: file.size,
      detectedFormat: MIME_TO_NAME[detectedType.mime] || detectedType.mime,
      durationSeconds
    });

    return {
      buffer: file.buffer,
      metadata: {
        originalName: file.originalname,
        size: file.size,
        format: detectedType.ext,
        mime: detectedType.mime,
        formatName: MIME_TO_NAME[detectedType.mime] || detectedType.ext.toUpperCase(),
        durationSeconds
      }
    };
  }

  validateFilePresence(file) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new ValidationError('No se recibió un archivo de audio válido');
    }
  }

  /**
   * Valida el tamaño del archivo.
   *
   * @param {Object} file - Objeto file de Multer
   * @throws {ValidationError} Si el archivo excede el tamaño máximo
   */
  validateSize(file) {
    if (file.size > AUDIO_CONFIG.MAX_SIZE) {
      const maxMB = AUDIO_CONFIG.MAX_SIZE / (1024 * 1024);
      throw new ValidationError(
        `El archivo de audio excede el tamaño máximo permitido de ${maxMB}MB`
      );
    }
  }

  /**
   * Valida el tipo real del archivo mediante magic bytes.
   * Previene falsificación de extensiones.
   *
   * @async
   * @param {Buffer} buffer - Contenido binario del archivo
   * @returns {Promise<Object>} Tipo detectado {ext, mime}
   * @throws {ValidationError} Si el contenido no corresponde a un formato permitido
   */
  async validateMagicBytes(buffer) {
    const detectedType = await fileType.fromBuffer(buffer);

    if (!detectedType) {
      throw new ValidationError(
        'No se pudo determinar el tipo de archivo. Asegúrate de subir un archivo de audio válido.'
      );
    }

    // Normalizar el MIME (algunos sistemas reportan audio/mp3 en lugar de audio/mpeg)
    const normalizedMime = detectedType.mime === 'audio/mp3' ? 'audio/mpeg' : detectedType.mime;

    if (!AUDIO_CONFIG.ALLOWED_MIMES.includes(normalizedMime)) {
      throw new ValidationError(
        `Formato de audio no permitido: ${detectedType.mime}. ` + `Formatos aceptados: MP3, OGG.`
      );
    }

    logger.debug('Magic bytes de audio validados', {
      detectedMime: detectedType.mime,
      detectedExt: detectedType.ext
    });

    return detectedType;
  }

  async validateDuration(buffer, mimeType) {
    try {
      const durationSeconds = await this.readDurationSeconds(buffer, mimeType);

      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new ValidationError(
          'No se pudo determinar la duración del audio. Usa un archivo MP3 u OGG válido.'
        );
      }

      if (durationSeconds < AUDIO_CONFIG.MIN_DURATION_SECONDS) {
        throw new ValidationError(
          `El audio es demasiado corto (${durationSeconds.toFixed(2)}s). ` +
            `Duración mínima: ${AUDIO_CONFIG.MIN_DURATION_SECONDS}s.`
        );
      }

      if (durationSeconds > AUDIO_CONFIG.MAX_DURATION_SECONDS) {
        throw new ValidationError(
          `El audio excede la duración máxima permitida (${durationSeconds.toFixed(2)}s). ` +
            `Duración máxima: ${AUDIO_CONFIG.MAX_DURATION_SECONDS}s.`
        );
      }

      return Number(durationSeconds.toFixed(2));
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      logger.warn('No se pudo validar la duración del audio', {
        reason: error.message
      });

      throw new ValidationError(
        'No se pudo leer la duración del audio. Verifica que el archivo no esté corrupto.'
      );
    }
  }

  async readDurationSeconds(buffer, mimeType) {
    const { parseBuffer } = await import('music-metadata');
    const metadata = await parseBuffer(buffer, mimeType, {
      duration: true,
      skipPostHeaders: true
    });

    return Number(metadata?.format?.duration);
  }

  /**
   * Obtiene la configuración actual del servicio.
   * Útil para exponer límites al frontend.
   *
   * @returns {Object} Configuración de audio
   */
  getConfig() {
    return {
      allowedFormats: ['MP3', 'OGG'],
      maxSizeMB: AUDIO_CONFIG.MAX_SIZE / (1024 * 1024),
      minDurationSeconds: AUDIO_CONFIG.MIN_DURATION_SECONDS,
      maxDurationSeconds: AUDIO_CONFIG.MAX_DURATION_SECONDS,
      recommendedMaxDurationSeconds: AUDIO_CONFIG.RECOMMENDED_MAX_DURATION_SECONDS
    };
  }
}

module.exports = new AudioValidationService();
module.exports.AUDIO_CONFIG = AUDIO_CONFIG;
