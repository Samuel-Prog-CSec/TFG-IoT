/**
 * @fileoverview Implementación minimalista TOTP RFC 6238 + Base32 (RFC 4648).
 *
 * No usa librerías externas para evitar issues ESM/CJS (otplib@13 trae @scure/base
 * que es ESM-only e incompatible con Jest sin babel). Toda la lógica está en
 * crypto.createHmac + Buffer, ambos del runtime Node.
 *
 * Compatible con Google Authenticator, Microsoft Authenticator, Authy, etc.
 *
 * @module utils/totp
 */

const crypto = require('node:crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD = 30;
const DEFAULT_ALGORITHM = 'sha1';

/**
 * Codifica un Buffer a Base32 (RFC 4648, sin padding).
 *
 * @param {Buffer} buffer
 * @returns {string}
 */
const encodeBase32 = buffer => {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
};

/**
 * Decodifica una string Base32 a Buffer. Ignora padding `=` y mayúsculas/minúsculas.
 *
 * @param {string} input
 * @returns {Buffer}
 */
const decodeBase32 = input => {
  const cleaned = input.replace(/=+$/u, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`Carácter inválido en Base32: ${char}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
};

/**
 * Genera un secret aleatorio Base32. 20 bytes (160 bits) es el tamaño
 * recomendado por RFC 6238 §5.1 para SHA1.
 *
 * @param {number} [byteLength=20]
 * @returns {string} secret en Base32 (sin padding)
 */
const generateSecret = (byteLength = 20) => encodeBase32(crypto.randomBytes(byteLength));

/**
 * Calcula el TOTP a partir de un secret Base32 y un timestamp (ms).
 *
 * @param {object} options
 * @param {string} options.secret - Base32.
 * @param {number} [options.timestamp=Date.now()] - ms epoch.
 * @param {number} [options.period=30] - segundos por step.
 * @param {number} [options.digits=6]
 * @param {'sha1'|'sha256'|'sha512'} [options.algorithm='sha1']
 * @returns {string} Código de `digits` dígitos con leading zeros.
 */
const generate = ({
  secret,
  timestamp = Date.now(),
  period = DEFAULT_PERIOD,
  digits = DEFAULT_DIGITS,
  algorithm = DEFAULT_ALGORITHM
}) => {
  const counter = Math.floor(timestamp / 1000 / period);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac(algorithm, decodeBase32(secret));
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, '0');
};

/**
 * Verifica un token TOTP contra un secret, con tolerancia de `window` steps
 * antes/después del actual (clock skew tolerante por defecto = 1, ±30s).
 *
 * @param {object} options
 * @param {string} options.token - Código que el usuario introdujo.
 * @param {string} options.secret - Base32.
 * @param {number} [options.window=1]
 * @param {number} [options.period=30]
 * @param {number} [options.digits=6]
 * @param {'sha1'|'sha256'|'sha512'} [options.algorithm='sha1']
 * @param {number} [options.timestamp=Date.now()]
 * @returns {boolean}
 */
const verify = ({
  token,
  secret,
  window: tolerance = 1,
  period = DEFAULT_PERIOD,
  digits = DEFAULT_DIGITS,
  algorithm = DEFAULT_ALGORITHM,
  timestamp = Date.now()
}) => {
  if (!token || typeof token !== 'string') {
    return false;
  }
  // Validar formato antes de procesar para evitar trabajo innecesario.
  if (token.length !== digits || !/^\d+$/.test(token)) {
    return false;
  }
  for (let offset = -tolerance; offset <= tolerance; offset++) {
    const candidateTimestamp = timestamp + offset * period * 1000;
    const expected = generate({ secret, timestamp: candidateTimestamp, period, digits, algorithm });
    // Comparación constante para reducir leakage por timing (defensa en profundidad
    // aunque para 6 dígitos sea marginal).
    if (
      expected.length === token.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Construye una URL `otpauth://` para que el usuario escanee en su app de autenticación.
 *
 * @param {object} options
 * @param {string} options.secret - Base32.
 * @param {string} options.accountName - Identificador del usuario (email).
 * @param {string} [options.issuer='EduPlay RFID']
 * @param {number} [options.digits=6]
 * @param {number} [options.period=30]
 * @returns {string}
 */
const buildOtpAuthUrl = ({
  secret,
  accountName,
  issuer = 'EduPlay RFID',
  digits = DEFAULT_DIGITS,
  period = DEFAULT_PERIOD
}) => {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(digits),
    period: String(period)
  });
  return `otpauth://totp/${label}?${params.toString()}`;
};

module.exports = {
  generate,
  verify,
  generateSecret,
  buildOtpAuthUrl,
  encodeBase32,
  decodeBase32
};
