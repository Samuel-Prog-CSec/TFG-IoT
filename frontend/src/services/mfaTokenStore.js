/**
 * @fileoverview Storage en memoria del MFA token (T-905 B7).
 *
 * Se guarda en una variable de módulo (NO localStorage/sessionStorage) para
 * minimizar exposición XSS. TTL típico 5min — coincide con expiración del JWT
 * MFA emitido por el backend. Al expirar, el siguiente request a un endpoint
 * con `requireMfa` devolverá 428 MFA_TOKEN_EXPIRED y el interceptor pedirá
 * uno nuevo via modal.
 */

let mfaToken = null;
let expiresAt = 0;
const subscribers = new Set();

/**
 * Devuelve el token vigente (no expirado) o null.
 */
export const getMfaToken = () => {
  if (!mfaToken) return null;
  if (Date.now() >= expiresAt) {
    mfaToken = null;
    expiresAt = 0;
    return null;
  }
  return mfaToken;
};

/**
 * Almacena un MFA token con su tiempo de expiración (segundos a partir de ahora).
 *
 * @param {string} token
 * @param {number} expiresInSec
 */
export const setMfaToken = (token, expiresInSec) => {
  mfaToken = token;
  expiresAt = Date.now() + expiresInSec * 1000;
  subscribers.forEach(cb => cb(mfaToken));
};

/**
 * Borra el token (logout, error, etc.).
 */
export const clearMfaToken = () => {
  mfaToken = null;
  expiresAt = 0;
  subscribers.forEach(cb => cb(null));
};

/**
 * Suscribirse a cambios de token. Devuelve unsubscriber.
 *
 * @param {(token: string|null) => void} cb
 * @returns {() => void}
 */
export const subscribe = cb => {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
};
