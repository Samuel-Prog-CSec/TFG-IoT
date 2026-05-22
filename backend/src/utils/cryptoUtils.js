/**
 * @fileoverview Utilidades de cifrado simétrico para campos sensibles en BD (T-905 B2).
 *
 * AES-256-GCM (cifrado autenticado, AEAD) con IV aleatorio de 96 bits + auth tag 128 bits.
 * Soporta Additional Authenticated Data (AAD) para "domain separation" — un valor cifrado
 * en un contexto (ej. `mfa`) no se puede descifrar usando el mismo flujo en otro contexto
 * (ej. `notes`) aunque la clave sea la misma.
 *
 * Uso típico: cifrado de TOTP secrets (B7), futuros campos de PII especialmente sensibles.
 *
 * Envoltorio en BD: string `iv:tag:ciphertext` en hex. Auto-contenido y portable.
 *
 * Requiere `MFA_ENCRYPTION_KEY` (32 bytes hex = 64 chars) en env. Fail-fast en prod si falta.
 *
 * @module utils/cryptoUtils
 */

const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // 256 bits
const IV_BYTES = 12; // 96 bits recomendado para GCM
const TAG_BYTES = 16; // 128 bits

let cachedKey = null;

/**
 * Obtiene la clave maestra desde env, validándola al primer uso.
 * Cacheada en memoria para evitar parseo repetido.
 *
 * @returns {Buffer} 32 bytes
 * @throws {Error} Si MFA_ENCRYPTION_KEY no está configurada o no es válida (en prod)
 */
const getKey = () => {
  if (cachedKey) {
    return cachedKey;
  }

  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'MFA_ENCRYPTION_KEY no está configurada. Es OBLIGATORIA en producción para cifrar ' +
          'campos sensibles (MFA secrets, etc.). Genera con: ' +
          `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      );
    }
    // En dev/test: derivar clave determinista a partir de JWT_SECRET — NO usar en prod.
    // Permite que tests y dev local funcionen sin configurar MFA_ENCRYPTION_KEY explícita.
    const seed = process.env.JWT_SECRET || 'eduplay-dev-fallback-mfa-key-seed';
    cachedKey = crypto.createHash('sha256').update(`mfa:${seed}`).digest();
    return cachedKey;
  }

  if (raw.length !== KEY_BYTES * 2 || !/^[0-9a-f]+$/i.test(raw)) {
    throw new Error(
      `MFA_ENCRYPTION_KEY tiene formato inválido. Esperado: ${KEY_BYTES * 2} chars hex ` +
        `(${KEY_BYTES} bytes). Recibido: ${raw.length} chars.`
    );
  }

  cachedKey = Buffer.from(raw, 'hex');
  return cachedKey;
};

/**
 * Cifra un plaintext con AES-256-GCM.
 *
 * @param {string} plaintext - Texto a cifrar.
 * @param {string} [aad] - Additional Authenticated Data (domain separation). NO se cifra,
 *   pero queda ligada al tag: cambiar AAD invalida la descripción posterior.
 * @returns {string} Envoltorio `iv:tag:ciphertext` en hex.
 * @throws {Error} Si la clave no está configurada.
 */
const encryptField = (plaintext, aad = '') => {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encryptField: plaintext debe ser string');
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'));
  }
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
};

/**
 * Descifra un envoltorio producido por `encryptField`.
 *
 * @param {string} envelope - Formato `iv:tag:ciphertext` en hex.
 * @param {string} [aad] - Debe coincidir con la AAD usada al cifrar (domain separation).
 * @returns {string} Plaintext original.
 * @throws {Error} Si el envoltorio es inválido, la AAD no coincide o el tag no verifica.
 */
const decryptField = (envelope, aad = '') => {
  if (typeof envelope !== 'string' || !envelope.includes(':')) {
    throw new Error('decryptField: envelope inválido (esperado iv:tag:ciphertext)');
  }
  const parts = envelope.split(':');
  if (parts.length !== 3) {
    throw new Error('decryptField: envelope con número incorrecto de segmentos');
  }
  const [ivHex, tagHex, ciphertextHex] = parts;
  if (ivHex.length !== IV_BYTES * 2 || tagHex.length !== TAG_BYTES * 2) {
    throw new Error('decryptField: longitudes de iv/tag incorrectas');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  if (aad) {
    decipher.setAAD(Buffer.from(aad, 'utf8'));
  }
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
};

/**
 * Sobreescribe un buffer in-place con bytes aleatorios y luego con ceros (crypto-shred).
 * Útil cuando se trabaja con secretos en memoria que se quieren reducir a basura antes
 * de descartar la referencia. No previene swap a disco ni GC residual, pero reduce ventana.
 *
 * @param {Buffer} buffer
 * @returns {void}
 */
const cryptoShred = buffer => {
  if (!Buffer.isBuffer(buffer)) {
    return;
  }
  crypto.randomFillSync(buffer);
  buffer.fill(0);
};

/**
 * Resetea la caché interna de la clave. Solo para tests que cambian MFA_ENCRYPTION_KEY
 * dinámicamente. NO usar en código de producción.
 */
const _resetKeyCache = () => {
  cachedKey = null;
};

module.exports = {
  encryptField,
  decryptField,
  cryptoShred,
  _resetKeyCache
};
