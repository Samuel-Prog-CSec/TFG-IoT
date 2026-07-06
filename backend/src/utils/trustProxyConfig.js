/**
 * @fileoverview Resuelve cuántos saltos de reverse proxy debe confiar Express
 * antes de tomar `req.ip` como la IP real del cliente.
 *
 * Con un único proxy de borde (hop=1) basta cuando Express está directamente
 * tras un solo reverse proxy. Al autoalojar en la VPS con Nginx de host (TLS)
 * delante del Nginx del contenedor frontend (SPA + proxy /api,/socket.io),
 * hay DOS saltos entre el cliente real y Express. Con `trust proxy` mal
 * configurado, `req.ip` (usado por rate limiters y logs de auditoría) apunta
 * a un proxy interno en vez del cliente real.
 *
 * @module utils/trustProxyConfig
 */

const DEFAULT_HOPS = 1;

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {number} Número de saltos de proxy a confiar (Express `trust proxy`).
 */
const resolveTrustProxyHops = env => {
  const parsed = Number.parseInt(env.TRUST_PROXY_HOPS, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_HOPS;
};

module.exports = { resolveTrustProxyHops };
