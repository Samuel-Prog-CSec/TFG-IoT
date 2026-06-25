/**
 * @fileoverview Middleware de validación de archivos por magic bytes (T-905 B3).
 *
 * Multer ya valida el MIME type declarado en `Content-Type`, pero el cliente puede
 * mentir ("attack: enviar un PDF con extensión .png + Content-Type image/png").
 * Este middleware re-verifica leyendo los bytes reales del buffer (magic bytes) con
 * la librería `file-type` (instalada en deps, no aplicada hasta ahora).
 *
 * Si la detección dice que el contenido NO es lo declarado → rechaza con 400 antes
 * de que `imageProcessingService` o `audioValidationService` toquen el buffer.
 * Defense in depth: los services siguen ejecutando su validación interna; este
 * middleware mata uploads inválidos antes para reducir CPU/memoria en ataques.
 *
 * @module middlewares/fileValidation
 */

const { ValidationError } = require('../utils/errors');
const { logSecurityEvent, getRequestContext } = require('../utils/securityLogger');

/**
 * Detecta el MIME type real de un buffer leyendo magic bytes de la cabecera.
 * Cubre solo los formatos relevantes para esta aplicación (imagen + audio).
 *
 * No usamos `file-type` (ESM-only en v22, incompatible con jest sin
 * `--experimental-vm-modules`). Las firmas usadas aquí son estándares
 * estables documentadas en RFC y especificaciones de cada formato.
 *
 * @param {Buffer} buffer
 * @returns {{mime: string}|null}
 */
// eslint-disable-next-line sonarjs/cyclomatic-complexity -- detector de magic bytes: cadena de comprobaciones por formato (RFC); dividirlo perjudicaría la trazabilidad de la validación de seguridad
const detectMagic = buffer => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) {
    return null;
  }

  // MP3 con tag ID3v2: "ID3"
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return { mime: 'audio/mpeg' };
  }

  // MP3 frame sync (sin ID3): FF Ex/Fx (11 bits a 1)
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return { mime: 'audio/mpeg' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg' };
  }

  if (buffer.length < 4) {
    return null;
  }

  // GIF: "GIF8" (89a o 87a)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { mime: 'image/gif' };
  }

  // OGG: "OggS"
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return { mime: 'audio/ogg' };
  }

  if (buffer.length < 8) {
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png' };
  }

  if (buffer.length < 12) {
    return null;
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: 'image/webp' };
  }

  // WAV: "RIFF" .... "WAVE"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x41 &&
    buffer[10] === 0x56 &&
    buffer[11] === 0x45
  ) {
    return { mime: 'audio/wav' };
  }

  return null;
};

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/vorbis',
  'audio/wav'
]);

/**
 * Construye un middleware Express que valida que `req.file.buffer` coincida con
 * uno de los MIME types permitidos según el contenido real (magic bytes).
 *
 * @param {Set<string>} allowedMimes - MIME types aceptados.
 * @param {string} kind - Etiqueta humana ("imagen" | "audio") para mensajes de error.
 * @returns {import('express').RequestHandler}
 */
const buildValidator = (allowedMimes, kind) =>
  async function validateFileMagicBytes(req, res, next) {
    try {
      if (!req.file || !Buffer.isBuffer(req.file.buffer) || req.file.buffer.length === 0) {
        throw new ValidationError(`Archivo de ${kind} vacío o ausente`);
      }

      const detected = detectMagic(req.file.buffer);
      if (!detected) {
        logSecurityEvent('SECURITY_FILE_TYPE_REJECTED', {
          ...getRequestContext(req),
          reason: 'FILE_MAGIC_BYTES_UNKNOWN',
          declaredMime: req.file.mimetype,
          size: req.file.size
        });
        throw new ValidationError(
          `No se ha podido determinar el formato del archivo (${kind}). Comprueba que sea un archivo válido.`
        );
      }

      if (!allowedMimes.has(detected.mime)) {
        logSecurityEvent('SECURITY_FILE_TYPE_REJECTED', {
          ...getRequestContext(req),
          reason: 'FILE_MAGIC_BYTES_MISMATCH',
          declaredMime: req.file.mimetype,
          detectedMime: detected.mime,
          size: req.file.size
        });
        throw new ValidationError(
          `El contenido del archivo (${detected.mime}) no coincide con un formato de ${kind} permitido.`
        );
      }

      // Si MIME declarado y detectado discrepan pero ambos permitidos, sincronizar al
      // detectado para que servicios posteriores trabajen con el real.
      if (req.file.mimetype !== detected.mime) {
        req.file.mimetype = detected.mime;
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };

module.exports = {
  validateImageMagicBytes: buildValidator(ALLOWED_IMAGE_MIMES, 'imagen'),
  validateAudioMagicBytes: buildValidator(ALLOWED_AUDIO_MIMES, 'audio'),
  ALLOWED_IMAGE_MIMES,
  ALLOWED_AUDIO_MIMES
};
