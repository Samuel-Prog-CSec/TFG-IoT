/**
 * @fileoverview Middleware de autenticación y autorización con JWT mejorado.
 * Implementa access tokens + refresh tokens con rotación y fingerprinting.
 * @module middlewares/auth
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * In-memory blacklist para tokens revocados.
 * TODO: En producción, usar Redis con TTL para escalabilidad.
 * Map<token_jti, expiration_timestamp>
 *
 * @type {Map<string, number>}
 */
const tokenBlacklist = new Map();

/**
 * Limpia tokens expirados de la blacklist cada hora.
 * Evita que la blacklist crezca indefinidamente en memoria.
 */
setInterval(() => {
  const now = Date.now();
  for (const [jti, expiresAt] of tokenBlacklist.entries()) {
    if (expiresAt < now) {
      tokenBlacklist.delete(jti);
    }
  }
  logger.debug(`Blacklist limpiada. Tokens activos: ${tokenBlacklist.size}`);
}, 3600000); // 1 hora

/**
 * Genera un fingerprint único del dispositivo basado en headers.
 * Añade una capa extra de seguridad contra robo de tokens.
 *
 * @param {import('express').Request} req - Request de Express
 * @returns {string} Hash SHA256 del fingerprint
 */
const generateDeviceFingerprint = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  const acceptLanguage = req.headers['accept-language'] || '';
  const acceptEncoding = req.headers['accept-encoding'] || '';

  const rawFingerprint = `${userAgent}|${acceptLanguage}|${acceptEncoding}`;

  return crypto.createHash('sha256').update(rawFingerprint).digest('hex');
};

/**
 * Genera un JWT access token de corta duración.
 *
 * @param {Object} user - Usuario de Mongoose
 * @param {string} deviceFingerprint - Fingerprint del dispositivo
 * @returns {Object} Token y metadata
 * @property {string} token - JWT firmado
 * @property {string} jti - ID único del token (para revocación)
 * @property {number} expiresIn - Tiempo de expiración en segundos
 */
const generateAccessToken = (user, deviceFingerprint) => {
  const jti = crypto.randomUUID(); // ID único del token
  const expiresIn = process.env.JWT_EXPIRES_IN || '15m'; // 15 minutos por defecto

  const payload = {
    jti,
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    fp: deviceFingerprint, // Fingerprint embebido
    type: 'access'
  };

  const token = jwt.sign(
    payload,
    process.env.JWT_SECRET, // Sin fallback inseguro - validado en envValidator
    {
      expiresIn,
      issuer: 'rfid-games-platform',
      audience: 'rfid-games-client'
    }
  );

  return {
    token,
    jti,
    expiresIn: parseExpiration(expiresIn)
  };
};

/**
 * Genera un refresh token de larga duración.
 * Los refresh tokens tienen un JTI único para rotación.
 *
 * @param {Object} user - Usuario de Mongoose
 * @param {string} deviceFingerprint - Fingerprint del dispositivo
 * @returns {Object} Token y metadata
 * @property {string} token - JWT firmado
 * @property {string} jti - ID único del token
 * @property {number} expiresIn - Tiempo de expiración en segundos
 */
const generateRefreshToken = (user, deviceFingerprint) => {
  const jti = crypto.randomUUID();
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

  const payload = {
    jti,
    id: user._id.toString(),
    fp: deviceFingerprint,
    type: 'refresh'
  };

  const token = jwt.sign(
    payload,
    process.env.JWT_REFRESH_SECRET, // Sin fallback inseguro - validado en envValidator
    {
      expiresIn,
      issuer: 'rfid-games-platform',
      audience: 'rfid-games-client'
    }
  );

  return {
    token,
    jti,
    expiresIn: parseExpiration(expiresIn)
  };
};

/**
 * Genera par de tokens (access + refresh).
 * Usado en login y refresh.
 *
 * @param {Object} user - Usuario de Mongoose
 * @param {import('express').Request} req - Request para fingerprint
 * @returns {Object} Par de tokens
 */
const generateTokenPair = (user, req) => {
  const fingerprint = generateDeviceFingerprint(req);

  const accessToken = generateAccessToken(user, fingerprint);
  const refreshToken = generateRefreshToken(user, fingerprint);

  logger.info('Par de tokens generado', {
    userId: user._id,
    email: user.email,
    accessTokenJti: accessToken.jti,
    refreshTokenJti: refreshToken.jti
  });

  return {
    accessToken: accessToken.token,
    refreshToken: refreshToken.token,
    accessTokenExpiresIn: accessToken.expiresIn,
    refreshTokenExpiresIn: refreshToken.expiresIn,
    tokenType: 'Bearer'
  };
};

/**
 * Verifica y decodifica un JWT access token.
 *
 * @param {string} token - JWT token
 * @param {import('express').Request} req - Request para verificar fingerprint
 * @returns {Object} Payload decodificado
 * @throws {UnauthorizedError} Si el token es inválido, expirado o revocado
 */
const verifyAccessToken = (token, req) => {
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET, // Sin fallback inseguro - validado en envValidator
      {
        issuer: 'rfid-games-platform',
        audience: 'rfid-games-client'
      }
    );

    // Verificar que es un access token
    if (decoded.type !== 'access') {
      throw new UnauthorizedError('Token type inválido');
    }

    // Verificar blacklist
    if (tokenBlacklist.has(decoded.jti)) {
      throw new UnauthorizedError('Token revocado');
    }

    // Verificar fingerprint del dispositivo
    const currentFingerprint = generateDeviceFingerprint(req);
    if (decoded.fp !== currentFingerprint) {
      logger.warn('Fingerprint mismatch detectado', {
        userId: decoded.id,
        expectedFp: decoded.fp,
        actualFp: currentFingerprint
      });
      throw new UnauthorizedError('Token fingerprint inválido');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Access token expirado');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new UnauthorizedError('Access token inválido');
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Error al verificar access token');
  }
};

/**
 * Verifica y decodifica un refresh token.
 *
 * @param {string} token - Refresh token
 * @param {import('express').Request} req - Request para verificar fingerprint
 * @returns {Object} Payload decodificado
 * @throws {UnauthorizedError} Si el token es inválido, expirado o revocado
 */
const verifyRefreshToken = (token, req) => {
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET, // Sin fallback inseguro - validado en envValidator
      {
        issuer: 'rfid-games-platform',
        audience: 'rfid-games-client'
      }
    );

    // Verificar que es un refresh token
    if (decoded.type !== 'refresh') {
      throw new UnauthorizedError('Token type inválido');
    }

    // Verificar blacklist
    if (tokenBlacklist.has(decoded.jti)) {
      throw new UnauthorizedError('Refresh token revocado');
    }

    // Verificar fingerprint
    const currentFingerprint = generateDeviceFingerprint(req);
    if (decoded.fp !== currentFingerprint) {
      logger.warn('Fingerprint mismatch en refresh token', {
        userId: decoded.id,
        expectedFp: decoded.fp,
        actualFp: currentFingerprint
      });
      throw new UnauthorizedError('Refresh token fingerprint inválido');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Refresh token expirado');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new UnauthorizedError('Refresh token inválido');
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Error al verificar refresh token');
  }
};

/**
 * Revoca un token añadiéndolo a la blacklist.
 * El token no podrá ser usado hasta su expiración natural.
 *
 * @param {string} jti - ID único del token (JTI claim)
 * @param {number} expiresAt - Timestamp de expiración del token
 */
const revokeToken = (jti, expiresAt) => {
  tokenBlacklist.set(jti, expiresAt);
  logger.info('Token revocado', { jti, expiresAt: new Date(expiresAt) });
};

/**
 * Helper para convertir strings de expiración a segundos.
 *
 * @param {string} expiration - Ej: '15m', '7d', '30d'
 * @returns {number} Segundos
 */
const parseExpiration = (expiration) => {
  const match = expiration.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // Default 15 minutos

  const value = parseInt(match[1]);
  const unit = match[2];

  const multipliers = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400
  };

  return value * multipliers[unit];
};

/**
 * Middleware para proteger rutas que requieren autenticación.
 *
 * Extrae y verifica el access token del header Authorization.
 * Adjunta el usuario completo a req.user y el JTI a req.tokenJti.
 *
 * Uso:
 * router.get('/profile', authenticate, getProfile);
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const authenticate = async (req, res, next) => {
  try {
    // Extraer token del header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token no proporcionado');
    }

    const token = authHeader.split(' ')[1];

    // Verificar access token (incluye validación de fingerprint)
    const decoded = verifyAccessToken(token, req);

    // Buscar usuario en la base de datos
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      throw new UnauthorizedError('Usuario no encontrado');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('Usuario inactivo');
    }

    // Adjuntar usuario y metadata del token a la request
    req.user = user;
    req.tokenJti = decoded.jti; // Para revocación si es necesario
    req.tokenExp = decoded.exp; // Para logging

    logger.debug('Usuario autenticado', {
      userId: user._id,
      email: user.email,
      role: user.role,
      path: req.path,
      jti: decoded.jti
    });

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para requerir un rol específico.
 * Debe usarse DESPUÉS del middleware authenticate.
 *
 * Uso:
 * router.post('/sessions', authenticate, requireRole('teacher'), createSession);
 *
 * @param {...string} allowedRoles - Roles permitidos
 * @returns {Function} Middleware de Express
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Autenticación requerida');
      }

      if (!allowedRoles.includes(req.user.role)) {
        logger.warn('Acceso denegado por rol', {
          userId: req.user._id,
          userRole: req.user.role,
          requiredRoles: allowedRoles,
          path: req.path
        });

        throw new ForbiddenError(
          `Acceso denegado. Roles permitidos: ${allowedRoles.join(', ')}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware para verificar que el usuario accede solo a sus propios recursos.
 * Útil para que un alumno solo vea sus propias partidas.
 *
 * Uso:
 * router.get('/plays/:id', authenticate, requireOwnership('playerId'), getPlay);
 *
 * @param {string} resourceIdField - Campo en req.params o req.body con el ID del recurso
 * @returns {Function} Middleware de Express
 */
const requireOwnership = (resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Autenticación requerida');
      }

      // Profesores tienen acceso a todos los recursos
      if (req.user.role === 'teacher') {
        return next();
      }

      const resourceId = req.params[resourceIdField] || req.body[resourceIdField];

      // Comparar el ID del recurso con el ID del usuario
      // NOTA: Esta lógica puede necesitar ajustes según el recurso
      if (resourceId && resourceId.toString() !== req.user._id.toString()) {
        logger.warn('Acceso denegado por ownership', {
          userId: req.user._id,
          resourceId: resourceId,
          path: req.path
        });

        throw new ForbiddenError('No tienes permiso para acceder a este recurso');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware opcional de autenticación.
 * Si hay token, lo valida y adjunta el usuario.
 * Si no hay token, continúa sin error (req.user será undefined).
 *
 * Útil para rutas públicas que pueden tener comportamiento diferente si el usuario está autenticado.
 *
 * Uso:
 * router.get('/public-data', optionalAuth, getData);
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Sin token, continuar sin error
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token, req);
    const user = await User.findById(decoded.id).select('-password');

    if (user && user.status === 'active') {
      req.user = user;
      req.tokenJti = decoded.jti;
    }

    next();
  } catch (error) {
    // Ignorar errores de autenticación en modo opcional
    logger.debug('Token opcional inválido, continuando sin autenticación', {
      error: error.message
    });
    next();
  }
};

/**
 * Middleware para cerrar sesión y revocar tokens.
 * Añade el JTI del access token y refresh token a la blacklist.
 *
 * Uso:
 * router.post('/logout', authenticate, logout);
 *
 * Body: { refreshToken: string } (opcional, para revocar ambos)
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const logout = async (req, res, next) => {
  try {
    // Revocar el access token actual
    const accessTokenExp = req.tokenExp * 1000; // Convertir a milisegundos
    revokeToken(req.tokenJti, accessTokenExp);

    // Si se proporciona refresh token, también revocarlo
    const { refreshToken } = req.body;
    if (refreshToken) {
      try {
        const decoded = verifyRefreshToken(refreshToken, req);
        const refreshTokenExp = decoded.exp * 1000;
        revokeToken(decoded.jti, refreshTokenExp);
      } catch (error) {
        // Si el refresh token ya expiró o es inválido, no importa
        logger.debug('Refresh token inválido en logout, ignorando', {
          error: error.message
        });
      }
    }

    logger.info('Usuario deslogueado y tokens revocados', {
      userId: req.user._id,
      email: req.user.email,
      accessTokenJti: req.tokenJti
    });

    res.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateTokenPair,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateDeviceFingerprint,
  revokeToken,
  authenticate,
  requireRole,
  requireOwnership,
  optionalAuth,
  logout
};
