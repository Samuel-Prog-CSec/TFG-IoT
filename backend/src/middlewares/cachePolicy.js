/**
 * @fileoverview Middleware Cache-Control para rutas con datos sensibles (T-905 B2).
 *
 * Setea headers que impiden a navegadores, CDN y proxies cachear respuestas con PII
 * o datos de menores. Defensa contra data leaks por cache compartido (Cloudflare
 * respeta `Cache-Control: private` y no almacena en edge cache).
 *
 * Headers aplicados:
 * - `Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0`
 * - `Pragma: no-cache` (HTTP/1.0 legacy)
 * - `Expires: 0`
 * - `Surrogate-Control: no-store` (señalización explícita a CDN/proxies)
 *
 * @module middlewares/cachePolicy
 */

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'Surrogate-Control': 'no-store'
};

/**
 * Aplica headers anti-cache. Pensado para rutas que devuelven datos personales
 * (auth, perfiles, sesiones, plays, analytics, admin).
 *
 * @returns {import('express').RequestHandler}
 */
const noStoreSensitive = (req, res, next) => {
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
    res.setHeader(name, value);
  }
  next();
};

module.exports = {
  noStoreSensitive,
  NO_STORE_HEADERS
};
