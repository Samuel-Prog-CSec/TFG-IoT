/**
 * @fileoverview Middleware de hardening para bloquear payloads peligrosos antes de validaciones/repositorios.
 * @module middlewares/securityPayloadGuard
 */

const { findDangerousPayloadPath } = require('../utils/payloadSecurity');
const { logSecurityEvent, getRequestContext } = require('../utils/securityLogger');

const inspectSources = req => [
  { name: 'body', value: req.body },
  { name: 'query', value: req.query },
  { name: 'params', value: req.params }
];

const rejectDangerousPayload = (req, res, source, path) => {
  logSecurityEvent('SECURITY_PAYLOAD_BLOCKED', {
    ...getRequestContext(req),
    source,
    path
  });

  return res.status(400).json({
    success: false,
    message: 'Payload no permitido por política de seguridad',
    errors: [
      {
        field: `${source}.${path}`,
        message: 'Se detectó una clave no permitida en la petición'
      }
    ]
  });
};

const securityPayloadGuard = (req, res, next) => {
  for (const source of inspectSources(req)) {
    const path = findDangerousPayloadPath(source.value);
    if (path) {
      return rejectDangerousPayload(req, res, source.name, path);
    }
  }

  return next();
};

module.exports = {
  securityPayloadGuard
};
