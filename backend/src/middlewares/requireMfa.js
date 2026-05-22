/**
 * @fileoverview Middleware que exige un MFA challenge reciente para acciones críticas.
 *
 * Pensado para endpoints super_admin destructivos: hard delete de usuarios,
 * desbloqueo de cuentas, purgas GDPR, etc. T-905 B7.
 *
 * Flujo:
 *   1. El cliente solicita la acción → backend devuelve 428 `MFA_TOKEN_REQUIRED`.
 *   2. Frontend pide código TOTP al usuario, llama `POST /api/auth/mfa/challenge`.
 *   3. Backend devuelve un MFA token JWT corto (5min, secret `JWT_MFA_SECRET`).
 *   4. Frontend reintenta la acción original con header `X-MFA-Token: <jwt>`.
 *   5. Este middleware valida el token y pone `req.mfaVerified = true`.
 *
 * Comportamiento si el usuario super_admin NO tiene MFA habilitado:
 * - Si env `MFA_REQUIRED_FOR_SUPER_ADMIN === 'true'` (default true en prod) → 428
 *   con `MFA_ENROLLMENT_REQUIRED` (el frontend redirige a `/admin/mfa-setup`).
 * - Si la env está en `false` (dev/migración) → pasa.
 *
 * @module middlewares/requireMfa
 */

const jwt = require('jsonwebtoken');
const { ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger').child({ component: 'mfa' });
const { logSecurityEvent, getRequestContext } = require('../utils/securityLogger');

const MFA_HEADER = 'x-mfa-token';
const ISSUER = 'rfid-games-platform';
const AUDIENCE = 'rfid-games-mfa';

const isMfaEnforced = () => {
  // Default: true en producción, opt-in en dev (para no bloquear flujos legacy).
  const flag = process.env.MFA_REQUIRED_FOR_SUPER_ADMIN;
  if (flag === undefined) {
    return process.env.NODE_ENV === 'production';
  }
  return flag === 'true';
};

/**
 * Firma un MFA token JWT corto. Se usa internamente por mfaController tras
 * verificar correctamente un código TOTP o un backup code.
 *
 * @param {string} userId
 * @returns {string} JWT con `mfa: true`, `sub: userId`, TTL 5min, alg HS256
 */
const issueMfaToken = userId => {
  if (!process.env.JWT_MFA_SECRET) {
    throw new Error('JWT_MFA_SECRET no configurado — MFA no operativo');
  }
  return jwt.sign({ mfa: true, sub: userId }, process.env.JWT_MFA_SECRET, {
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: '5m'
  });
};

/**
 * Verifica un MFA token. Lanza si inválido.
 *
 * @param {string} token
 * @returns {{sub: string, mfa: true, iat: number, exp: number}}
 */
const verifyMfaToken = token =>
  jwt.verify(token, process.env.JWT_MFA_SECRET, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE
  });

const requireMfa = (req, res, next) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('Autenticación requerida', 'AUTH_REQUIRED');
    }

    const userHasMfa = req.user.mfa?.enabled === true;

    // Si el usuario NO tiene MFA habilitado y el enforcement está activo →
    // forzar enrollment antes de seguir.
    if (!userHasMfa) {
      if (!isMfaEnforced()) {
        return next(); // dev / migration toggle
      }
      logSecurityEvent('AUTHZ_ACCESS_DENIED', {
        ...getRequestContext(req),
        userId: req.user._id,
        reason: 'MFA_ENROLLMENT_REQUIRED'
      });
      res.status(428).json({
        success: false,
        code: 'MFA_ENROLLMENT_REQUIRED',
        message: 'Esta acción requiere MFA habilitado. Configura MFA antes de continuar.'
      });
      return undefined;
    }

    const token = req.headers[MFA_HEADER];
    if (!token || typeof token !== 'string') {
      res.status(428).json({
        success: false,
        code: 'MFA_TOKEN_REQUIRED',
        message: 'Esta acción requiere verificación MFA. Introduce el código de tu autenticador.'
      });
      return undefined;
    }

    let decoded;
    try {
      decoded = verifyMfaToken(token);
    } catch (err) {
      const code = err.name === 'TokenExpiredError' ? 'MFA_TOKEN_EXPIRED' : 'MFA_TOKEN_INVALID';
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        userId: req.user._id,
        reason: code
      });
      res.status(401).json({
        success: false,
        code,
        message: 'El MFA token es inválido o ha expirado. Vuelve a verificar.'
      });
      return undefined;
    }

    if (decoded.sub !== String(req.user._id)) {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        userId: req.user._id,
        reason: 'MFA_TOKEN_USER_MISMATCH'
      });
      throw new ForbiddenError('El MFA token no corresponde al usuario', 'MFA_TOKEN_INVALID');
    }

    req.mfaVerified = true;
    req.mfaTokenJti = decoded.jti;
    logger.info('MFA token verificado', { userId: req.user._id });
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  requireMfa,
  issueMfaToken,
  verifyMfaToken,
  MFA_HEADER
};
