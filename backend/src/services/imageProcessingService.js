/**
 * @fileoverview Servicio de procesamiento y validación de imágenes.
 * Valida formatos por magic bytes, convierte a WebP, redimensiona y genera thumbnails.
 * @module services/imageProcessingService
 * @requires sharp
 * @requires file-type
 */

const sharp = require('sharp');
const fileType = require('file-type');
const logger = require('../utils/logger').child({ component: 'imageProcessingService' });
const { ValidationError } = require('../utils/errors');

/**
 * Configuración de procesamiento de imágenes.
 * @constant {Object}
 */
const IMAGE_CONFIG = {
  // Formatos de entrada permitidos (se convertirán a WebP)
  ALLOWED_INPUT_MIMES: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  ALLOWED_INPUT_EXTENSIONS: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],

  // Formato de salida
  OUTPUT_FORMAT: 'webp',
  OUTPUT_MIME: 'image/webp',

  // Calidad WebP (85% = balance óptimo calidad/tamaño)
  WEBP_QUALITY: 85,

  // Dimensiones
  MIN_WIDTH: 256,
  MIN_HEIGHT: 256,
  MAX_WIDTH: 2048,
  MAX_HEIGHT: 2048,

  // Dimensiones de salida (2x para retina displays)
  OUTPUT_MAX_WIDTH: 768,
  OUTPUT_MAX_HEIGHT: 768,

  // Thumbnail
  THUMBNAIL_WIDTH: 256,
  THUMBNAIL_HEIGHT: 256,

  // Tamaño máximo de archivo de entrada (8MB)
  MAX_INPUT_SIZE: 8 * 1024 * 1024
};

/**
 * Clase de servicio para procesamiento de imágenes.
 * Implementa validación por magic bytes, conversión a WebP y generación de thumbnails.
 */
class ImageProcessingService {
  /**
   * Procesa una imagen: valida, convierte a WebP, redimensiona y genera thumbnail.
   *
   * @async
   * @param {Object} file - Objeto file de Multer
   * @param {Buffer} file.buffer - Contenido binario del archivo
   * @param {string} file.originalname - Nombre original del archivo
   * @param {string} file.mimetype - MIME type declarado
   * @param {number} file.size - Tamaño en bytes
   * @returns {Promise<{mainImage: Buffer, thumbnail: Buffer, metadata: Object}>}
   * @throws {ValidationError} Si el archivo no cumple los requisitos
   */
  async processImage(file) {
    // 1. Validar tamaño de entrada
    this.validateInputSize(file);

    // 2. Validar tipo real por magic bytes
    await this.validateMagicBytes(file.buffer);

    // 3. Obtener metadatos y validar dimensiones
    const metadata = await this.getAndValidateMetadata(file.buffer);

    // 4. Procesar imagen principal (redimensionar si es necesario + convertir a WebP)
    const mainImage = await this.createMainImage(file.buffer, metadata);

    // 5. Generar thumbnail
    const thumbnail = await this.createThumbnail(file.buffer);

    logger.info('Imagen procesada exitosamente', {
      originalName: file.originalname,
      originalSize: file.size,
      processedSize: mainImage.length,
      thumbnailSize: thumbnail.length,
      dimensions: `${metadata.width}x${metadata.height}`
    });

    return {
      mainImage,
      thumbnail,
      metadata: {
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        format: IMAGE_CONFIG.OUTPUT_FORMAT,
        quality: IMAGE_CONFIG.WEBP_QUALITY
      }
    };
  }

  /**
   * Valida el tamaño del archivo de entrada.
   *
   * @param {Object} file - Objeto file de Multer
   * @throws {ValidationError} Si el archivo excede el tamaño máximo
   */
  validateInputSize(file) {
    if (file.size > IMAGE_CONFIG.MAX_INPUT_SIZE) {
      const maxMB = IMAGE_CONFIG.MAX_INPUT_SIZE / (1024 * 1024);
      throw new ValidationError(`El archivo excede el tamaño máximo permitido de ${maxMB}MB`);
    }
  }

  /**
   * Valida el tipo real del archivo mediante magic bytes.
   * Previene falsificación de extensiones.
   *
   * @async
   * @param {Buffer} buffer - Contenido binario del archivo
   * @throws {ValidationError} Si el contenido no corresponde a un formato permitido
   */
  async validateMagicBytes(buffer) {
    const detectedType = await fileType.fromBuffer(buffer);

    if (!detectedType) {
      throw new ValidationError(
        'No se pudo determinar el tipo de archivo. Asegúrate de subir una imagen válida.'
      );
    }

    if (!IMAGE_CONFIG.ALLOWED_INPUT_MIMES.includes(detectedType.mime)) {
      throw new ValidationError(
        `Formato de imagen no permitido: ${detectedType.mime}. ` +
          `Formatos aceptados: PNG, JPG, GIF, WebP.`
      );
    }

    logger.debug('Magic bytes validados', { detectedMime: detectedType.mime });
  }

  /**
   * Obtiene metadatos de la imagen y valida dimensiones.
   *
   * @async
   * @param {Buffer} buffer - Contenido binario del archivo
   * @returns {Promise<Object>} Metadatos de la imagen (width, height, format, etc.)
   * @throws {ValidationError} Si las dimensiones no cumplen los requisitos
   */
  async getAndValidateMetadata(buffer) {
    const metadata = await sharp(buffer).metadata();

    // Validar dimensiones mínimas
    if (metadata.width < IMAGE_CONFIG.MIN_WIDTH || metadata.height < IMAGE_CONFIG.MIN_HEIGHT) {
      throw new ValidationError(
        `La imagen es demasiado pequeña (${metadata.width}x${metadata.height}px). ` +
          `Dimensiones mínimas: ${IMAGE_CONFIG.MIN_WIDTH}x${IMAGE_CONFIG.MIN_HEIGHT}px.`
      );
    }

    // Validar dimensiones máximas de entrada
    if (metadata.width > IMAGE_CONFIG.MAX_WIDTH || metadata.height > IMAGE_CONFIG.MAX_HEIGHT) {
      throw new ValidationError(
        `La imagen es demasiado grande (${metadata.width}x${metadata.height}px). ` +
          `Dimensiones máximas: ${IMAGE_CONFIG.MAX_WIDTH}x${IMAGE_CONFIG.MAX_HEIGHT}px.`
      );
    }

    return metadata;
  }

  /**
   * Crea la imagen principal optimizada en formato WebP.
   * Redimensiona si excede las dimensiones máximas de salida.
   *
   * @async
   * @param {Buffer} buffer - Contenido binario original
   * @param {Object} metadata - Metadatos de la imagen original
   * @returns {Promise<Buffer>} Imagen procesada en WebP
   */
  async createMainImage(buffer, metadata) {
    let pipeline = sharp(buffer);

    // Redimensionar si excede dimensiones máximas de salida
    if (
      metadata.width > IMAGE_CONFIG.OUTPUT_MAX_WIDTH ||
      metadata.height > IMAGE_CONFIG.OUTPUT_MAX_HEIGHT
    ) {
      pipeline = pipeline.resize(IMAGE_CONFIG.OUTPUT_MAX_WIDTH, IMAGE_CONFIG.OUTPUT_MAX_HEIGHT, {
        fit: 'inside', // Mantiene aspect ratio
        withoutEnlargement: true
      });
    }

    // Convertir a WebP con calidad configurada
    return pipeline
      .webp({
        quality: IMAGE_CONFIG.WEBP_QUALITY,
        effort: 4 // Balance entre velocidad y compresión (0-6)
      })
      .toBuffer();
  }

  /**
   * Genera un thumbnail cuadrado de la imagen.
   *
   * @async
   * @param {Buffer} buffer - Contenido binario original
   * @returns {Promise<Buffer>} Thumbnail en WebP
   */
  async createThumbnail(buffer) {
    return sharp(buffer)
      .resize(IMAGE_CONFIG.THUMBNAIL_WIDTH, IMAGE_CONFIG.THUMBNAIL_HEIGHT, {
        fit: 'cover', // Recorta para llenar el cuadrado
        position: 'centre'
      })
      .webp({
        quality: 80, // Ligeramente menor para thumbnails
        effort: 4
      })
      .toBuffer();
  }

  /**
   * Obtiene la configuración actual del servicio.
   * Útil para exponer límites al frontend.
   *
   * @returns {Object} Configuración de imagen
   */
  getConfig() {
    return {
      allowedFormats: ['PNG', 'JPG', 'JPEG', 'GIF', 'WebP'],
      outputFormat: 'WebP',
      maxInputSizeMB: IMAGE_CONFIG.MAX_INPUT_SIZE / (1024 * 1024),
      minDimensions: `${IMAGE_CONFIG.MIN_WIDTH}x${IMAGE_CONFIG.MIN_HEIGHT}`,
      maxDimensions: `${IMAGE_CONFIG.MAX_WIDTH}x${IMAGE_CONFIG.MAX_HEIGHT}`,
      outputMaxDimensions: `${IMAGE_CONFIG.OUTPUT_MAX_WIDTH}x${IMAGE_CONFIG.OUTPUT_MAX_HEIGHT}`,
      thumbnailDimensions: `${IMAGE_CONFIG.THUMBNAIL_WIDTH}x${IMAGE_CONFIG.THUMBNAIL_HEIGHT}`
    };
  }
}

module.exports = new ImageProcessingService();
module.exports.IMAGE_CONFIG = IMAGE_CONFIG;
