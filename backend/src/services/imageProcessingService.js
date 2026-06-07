/**
 * @fileoverview Servicio de procesamiento y validación de imágenes.
 * Valida formatos por magic bytes, convierte a WebP, redimensiona y genera thumbnails.
 * @module services/imageProcessingService
 * @requires sharp
 * @requires file-type
 */

const sharp = require('sharp');
const { getFileType } = require('../utils/fileTypeHelper');
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
  THUMBNAIL_QUALITY: 85,

  // Sharpening post-resize (compensa blur de downscale)
  SHARPEN_SIGMA: 0.5,

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
 * Opciones de entrada de sharp — defensa contra bombas de descompresión.
 * `limitInputPixels` acota la decodificación al máximo de píxeles que la app acepta
 * (MAX_WIDTH×MAX_HEIGHT ≈ 4,2 Mpx). El default de sharp (~268 Mpx ≈ 16384²)
 * permitiría que un archivo pequeño y muy comprimido declarara dimensiones enormes
 * y agotara la RAM del worker (free-tier, 1 proceso) al decodificar a RAW
 * (16384²×4 ≈ 1 GB). `failOn: 'error'` fija el umbral de fallo de forma explícita.
 * @constant {Object}
 */
const SHARP_INPUT_OPTIONS = {
  limitInputPixels: IMAGE_CONFIG.MAX_WIDTH * IMAGE_CONFIG.MAX_HEIGHT,
  failOn: 'error'
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

    // 4. Procesar imagen principal (redimensionar + sharpen + convertir a WebP)
    const mainImage = await this.createMainImage(file.buffer, metadata);

    // 5. Generar thumbnail
    const thumbnail = await this.createThumbnail(file.buffer);

    // 6. Extraer color dominante para LQIP en frontend
    const dominantColor = await this.extractDominantColor(mainImage);

    logger.info('Imagen procesada exitosamente', {
      originalName: file.originalname,
      originalSize: file.size,
      processedSize: mainImage.length,
      thumbnailSize: thumbnail.length,
      dimensions: `${metadata.width}x${metadata.height}`,
      dominantColor
    });

    return {
      mainImage,
      thumbnail,
      metadata: {
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        format: IMAGE_CONFIG.OUTPUT_FORMAT,
        quality: IMAGE_CONFIG.WEBP_QUALITY,
        dominantColor
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
    const detectedType = await getFileType(buffer);

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
    let metadata;
    try {
      metadata = await sharp(buffer, SHARP_INPUT_OPTIONS).metadata();
    } catch (err) {
      // sharp lanza un Error CRUDO si el buffer no es decodificable o si excede
      // `limitInputPixels` (defensa anti-bomba de descompresión). Cualquier fallo
      // al leer metadatos es entrada inválida/maliciosa del cliente, NO un error
      // del servidor: se reconvierte a ValidationError (→400) para no responder 500
      // ni filtrar el stack de sharp con rutas del servidor (OWASP A05/A09).
      logger.warn('sharp no pudo leer los metadatos de la imagen', { error: err.message });
      throw new ValidationError(
        'La imagen no es válida o es demasiado grande para procesarla. ' +
          `Dimensiones máximas: ${IMAGE_CONFIG.MAX_WIDTH}x${IMAGE_CONFIG.MAX_HEIGHT}px.`
      );
    }

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
    let pipeline = sharp(buffer, SHARP_INPUT_OPTIONS);

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

    // Sharpen post-resize para compensar pérdida de definición
    pipeline = pipeline.sharpen({ sigma: IMAGE_CONFIG.SHARPEN_SIGMA });

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
    return sharp(buffer, SHARP_INPUT_OPTIONS)
      .resize(IMAGE_CONFIG.THUMBNAIL_WIDTH, IMAGE_CONFIG.THUMBNAIL_HEIGHT, {
        fit: 'cover', // Recorta para llenar el cuadrado
        position: 'centre'
      })
      .sharpen({ sigma: IMAGE_CONFIG.SHARPEN_SIGMA })
      .webp({
        quality: IMAGE_CONFIG.THUMBNAIL_QUALITY,
        effort: 4
      })
      .toBuffer();
  }

  /**
   * Extrae el color dominante de una imagen procesada.
   * Usado como placeholder LQIP (Low Quality Image Placeholder) en el frontend.
   *
   * @async
   * @param {Buffer} buffer - Imagen procesada en WebP
   * @returns {Promise<string>} Color dominante en formato hex (#RRGGBB)
   */
  async extractDominantColor(buffer) {
    const { dominant } = await sharp(buffer).stats();
    const toHex = n => Math.round(n).toString(16).padStart(2, '0');
    return `#${toHex(dominant.r)}${toHex(dominant.g)}${toHex(dominant.b)}`;
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
