/**
 * @fileoverview CJS bridge for file-type (ESM-only package since v17).
 * Caches the dynamic import for performance.
 * @module utils/fileTypeHelper
 */

let _fileTypeFromBuffer;

/**
 * Detects the file type of a Buffer by inspecting its magic bytes.
 *
 * @async
 * @param {Buffer} buffer - File content to inspect
 * @returns {Promise<{ext: string, mime: string} | undefined>} Detected type or undefined
 */
async function getFileType(buffer) {
  if (!_fileTypeFromBuffer) {
    const mod = await import('file-type');
    _fileTypeFromBuffer = mod.fileTypeFromBuffer;
  }
  return _fileTypeFromBuffer(buffer);
}

module.exports = { getFileType };
