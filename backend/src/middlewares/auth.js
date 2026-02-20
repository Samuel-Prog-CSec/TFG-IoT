/**
 * @fileoverview Middleware de autenticación y autorización con JWT mejorado.
 * Implementa access tokens + refresh tokens con rotación y fingerprinting.
 * Usa Redis para blacklist de tokens y almacenamiento de refresh tokens.
 * @module middlewares/auth
 */

const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const userRepository = require('../repositories/userRepository');
const logger = require('../utils/logger').child({ component: 'auth' });
const { logSecurityEvent, getRequestContext } = require('../utils/securityLogger');
const redisService = require('../services/redisService');

/**
 * Constantes de seguridad para tokens.
 */
const TOKEN_SECURITY = {
  /** Grace period para tokens rotados (10 segundos) */
  ROTATION_GRACE_PERIOD_MS: 10000,
  /** Duración del refresh token en segundos (7 días) */
  REFRESH_TOKEN_TTL_SECONDS: 7 * 24 * 60 * 60,
  /** Duración del flag de seguridad en segundos (1 hora) */
  SECURITY_FLAG_TTL_SECONDS: 3600
};

const REFRESH_COOKIE_NAME = 'refreshToken';
const CSRF_COOKIE_NAME = 'csrfToken';

const buildRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth'
});

const buildCsrfCookieOptions = () => ({
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000
});

/**
 * Revoca un token añadiéndolo a la blacklist en Redis.
 * El token no podrá ser usado hasta su expiración natural.
 *
 * @param {string} jti - ID único del token (JTI claim)
 * @param {number} expiresAt - Timestamp de expiración del token (en ms)
 * @returns {Promise<boolean>} True si se revocó correctamente.
 */
const revokeToken = async (jti, expiresAt, meta = {}) => {
  const ttlSeconds = Math.ceil((expiresAt - Date.now()) / 1000);

  if (ttlSeconds <= 0) {
    logger.debug('Token ya expirado, no se añade a blacklist', { jti });
    return true;
  }

  const success = await redisService.setWithTTL(
    redisService.NAMESPACES.BLACKLIST,
    jti,
    '1',
    ttlSeconds
  );

  if (success) {
    logSecurityEvent('AUTH_TOKEN_REVOKED', {
      ...meta,
      jti,
      expiresAt: new Date(expiresAt).toISOString(),
      ttlSeconds
    });
  }

  return success;
};

/**
 * Verifica si un token está revocado en la blacklist.
 *
 * @param {string} jti - ID único del token (JTI claim)
 * @returns {Promise<boolean>} True si el token está revocado.
 */
const isTokenRevoked = async jti =>
  await redisService.exists(redisService.NAMESPACES.BLACKLIST, jti);

/**
 * Revoca TODOS los tokens de un usuario (logout forzado por seguridad).
 * Establece un flag que invalida cualquier token emitido antes de ahora.
 *
 * @param {string} userId - ID del usuario
 * @param {string} reason - Razón de la revocación (para logging)
 * @returns {Promise<boolean>} True si se estableció el flag.
 */
const revokeAllUserTokens = async (userId, reason = 'security', meta = {}) => {
  const success = await redisService.setWithTTL(
    redisService.NAMESPACES.SECURITY,
    userId,
    Date.now().toString(),
    TOKEN_SECURITY.SECURITY_FLAG_TTL_SECONDS
  );

  if (success) {
    logSecurityEvent('AUTH_TOKENS_REVOKED_ALL', {
      ...meta,
      userId,
      reason
    });
  }

  return success;
};

/**
 * Verifica si un usuario tiene un flag de logout forzado.
 * Si el token fue emitido antes del flag, es inválido.
 *
 * @param {string} userId - ID del usuario
 * @param {number} tokenIssuedAt - Timestamp de emisión del token (iat claim)
 * @returns {Promise<{revoked: boolean, reason: string|null}>}
 */
const checkSecurityFlag = async (userId, tokenIssuedAt) => {
  const flagTimestamp = await redisService.get(redisService.NAMESPACES.SECURITY, userId);

  if (!flagTimestamp) {
    return { revoked: false, reason: null };
  }

  const flagTime = Number.parseInt(flagTimestamp, 10);
  const tokenTimeMs = tokenIssuedAt * 1000; // iat está en segundos

  if (tokenTimeMs < flagTime) {
    return {
      revoked: true,
      reason: 'SESSION_REVOKED_SECURITY'
    };
  }

  return { revoked: false, reason: null };
};

// =============================================================================
// REFRESH TOKEN MANAGEMENT (Redis)
// =============================================================================

/**
 * Almacena un refresh token en Redis con su familia.
 * Cada refresh token pertenece a una "familia" que comparte el mismo origen.
 *
 * @param {string} jti - ID único del token
 * @param {string} userId - ID del usuario
 * @param {string} familyId - ID de la familia de tokens
 * @returns {Promise<boolean>} True si se almacenó correctamente.
 */
const storeRefreshToken = async (jti, userId, familyId) =>
  await redisService.hset(
    redisService.NAMESPACES.REFRESH,
    jti,
    {
      userId,
      familyId,
      createdAt: Date.now()
    },
    TOKEN_SECURITY.REFRESH_TOKEN_TTL_SECONDS
  );

/**
 * Obtiene información de un refresh token almacenado.
 *
 * @param {string} jti - ID único del token
 * @returns {Promise<{userId: string, familyId: string, createdAt: number}|null>}
 */
const getRefreshTokenInfo = async jti =>
  await redisService.hgetall(redisService.NAMESPACES.REFRESH, jti);

/**
 * Marca un refresh token como "usado" (rotado).
 * Se mantiene durante el grace period + TTL para detectar reuso.
 *
 * @param {string} jti - ID del token rotado
 * @param {string} familyId - ID de la familia para detección de robo
 * @returns {Promise<boolean>}
 */
const markRefreshTokenAsUsed = async (jti, familyId) =>
  // Almacenar con el mismo TTL que los refresh tokens
  await redisService.setWithTTL(
    redisService.NAMESPACES.USED,
    jti,
    JSON.stringify({ familyId, usedAt: Date.now() }),
    TOKEN_SECURITY.REFRESH_TOKEN_TTL_SECONDS
  );
/**
 * Verifica si un refresh token ya fue usado (posible robo).
 *
 * @param {string} jti - ID del token
 * @returns {Promise<{used: boolean, familyId: string|null, usedAt: number|null}>}
 */
const isRefreshTokenUsed = async jti => {
  const data = await redisService.get(redisService.NAMESPACES.USED, jti);

  if (!data) {
    return { used: false, familyId: null, usedAt: null };
  }

  try {
    const parsed = JSON.parse(data);
    return {
      used: true,
      familyId: parsed.familyId,
      usedAt: parsed.usedAt
    };
  } catch {
    return { used: true, familyId: null, usedAt: null };
  }
};

/**
 * Elimina un refresh token de Redis (al rotar o revocar).
 *
 * @param {string} jti - ID del token
 * @returns {Promise<boolean>}
 */
const deleteRefreshToken = async jti =>
  await redisService.del(redisService.NAMESPACES.REFRESH, jti);

/**
 * Helper para convertir strings de expiración a segundos.
 *
 * @param {string} expiration - Ej: '15m', '7d', '30d'
 * @returns {number} Segundos
 */
const parseExpiration = expiration => {
  const match = /^(\d+)([smhd])$/.exec(expiration);
  if (!match) {
    return 900; // Default 15 minutos
  }

  const value = Number.parseInt(match[1], 10);
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
 * Genera un fingerprint único del dispositivo basado en headers.
 * Añade una capa extra de seguridad contra robo de tokens.
 *
 * @param {import('express').Request} req - Request de Express
 * @returns {string} Hash SHA256 del fingerprint
 */
const generateDeviceFingerprint = req => {
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
const generateAccessToken = (user, deviceFingerprint, sessionId) => {
  const jti = crypto.randomUUID(); // ID único del token
  const expiresIn = process.env.JWT_EXPIRES_IN || '15m'; // 15 minutos por defecto

  const payload = {
    jti,
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    fp: deviceFingerprint, // Fingerprint embebido
    sid: sessionId, // Session ID para single session enforcement
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
const generateRefreshToken = (user, deviceFingerprint, sessionId) => {
  const jti = crypto.randomUUID();
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

  const payload = {
    jti,
    id: user._id.toString(),
    fp: deviceFingerprint,
    sid: sessionId, // Session ID
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
 * Almacena el refresh token en Redis para tracking y detección de robo.
 *
 * @param {Object} user - Usuario de Mongoose
 * @param {import('express').Request} req - Request para fingerprint
 * @returns {Promise<Object>} Par de tokens
 */
const generateTokenPair = async (user, req, sessionId, existingFamilyId = null) => {
  const fingerprint = generateDeviceFingerprint(req);

  const accessToken = generateAccessToken(user, fingerprint, sessionId);
  const refreshToken = generateRefreshToken(user, fingerprint, sessionId);

  // Crear o reutilizar familyId para detección de robo
  const familyId = existingFamilyId || crypto.randomUUID();

  // Almacenar refresh token en Redis
  await storeRefreshToken(refreshToken.jti, user._id.toString(), familyId);

  logger.info('Par de tokens generado', {
    userId: user._id,
    email: user.email,
    accessTokenJti: accessToken.jti,
    refreshTokenJti: refreshToken.jti,
    familyId
  });

  return {
    accessToken: accessToken.token,
    refreshToken: refreshToken.token,
    accessTokenExpiresIn: accessToken.expiresIn,
    refreshTokenExpiresIn: refreshToken.expiresIn,
    tokenType: 'Bearer',
    _internal: {
      refreshTokenJti: refreshToken.jti,
      familyId
    }
  };
};

/**
 * Verifica y decodifica un JWT access token.
 *
 * @param {string} token - JWT token
 * @param {import('express').Request} req - Request para verificar fingerprint
 * @returns {Promise<Object>} Payload decodificado
 * @throws {UnauthorizedError} Si el token es inválido, expirado o revocado
 */
const verifyAccessToken = async (token, req) => {
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
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        userId: decoded.id,
        reason: 'ACCESS_TOKEN_WRONG_TYPE'
      });
      throw new UnauthorizedError('Token type inválido');
    }

    // Verificar blacklist en Redis
    const revoked = await isTokenRevoked(decoded.jti);
    if (revoked) {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        userId: decoded.id,
        jti: decoded.jti,
        reason: 'ACCESS_TOKEN_REVOKED'
      });
      throw new UnauthorizedError('Token revocado');
    }

    // Verificar flag de seguridad (logout forzado)
    const securityCheck = await checkSecurityFlag(decoded.id, decoded.iat);
    if (securityCheck.revoked) {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        userId: decoded.id,
        reason: securityCheck.reason || 'SESSION_REVOKED_SECURITY'
      });
      throw new UnauthorizedError(
        'Tu sesión fue cerrada por motivos de seguridad. Por favor, inicia sesión de nuevo.',
        securityCheck.reason
      );
    }

    // Verificar fingerprint del dispositivo
    const currentFingerprint = generateDeviceFingerprint(req);
    if (decoded.fp !== currentFingerprint) {
      logSecurityEvent('AUTH_TOKEN_FINGERPRINT_MISMATCH', {
        ...getRequestContext(req),
        userId: decoded.id,
        fingerprintMismatch: true
      });
      throw new UnauthorizedError('Token fingerprint inválido');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        reason: 'ACCESS_TOKEN_EXPIRED'
      });
      throw new UnauthorizedError('Access token expirado');
    }
    if (error.name === 'JsonWebTokenError') {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        reason: 'ACCESS_TOKEN_INVALID'
      });
      throw new UnauthorizedError('Access token inválido');
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Error al verificar access token');
  }
};

/**
 * Helper para obtener el token Bearer del header Authorization.
 *
 * @param {string} authHeader - Header Authorization
 * @returns {string|null} Token Bearer o null si no está presente
 */
const getBearerToken = authHeader =>
  authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

/**
 * Helper para obtener un mensaje de estado de cuenta.
 *
 * @param {string} accountStatus - Estado de la cuenta
 * @returns {string|null} Mensaje de estado o null si no aplica
 */
const getAccountStatusMessage = accountStatus => {
  if (accountStatus === 'pending_approval') {
    return 'Cuenta pendiente de aprobación';
  }
  if (accountStatus === 'rejected') {
    return 'Cuenta rechazada';
  }
  if (accountStatus) {
    return 'Cuenta no aprobada';
  }
  return null;
};

/**
 * Verifica y decodifica un refresh token.
 * También detecta reuso de tokens (posible robo).
 *
 * @param {string} token - Refresh token
 * @param {import('express').Request} req - Request para verificar fingerprint
 * @returns {Promise<Object>} Payload decodificado
 * @throws {UnauthorizedError} Si el token es inválido, expirado o revocado
 */
const verifyRefreshToken = async (token, req) => {
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

    // Verificar blacklist en Redis
    const revoked = await isTokenRevoked(decoded.jti);
    if (revoked) {
      throw new UnauthorizedError('Refresh token revocado');
    }

    const securityCheck = await checkSecurityFlag(decoded.id, decoded.iat);
    if (securityCheck.revoked) {
      throw new UnauthorizedError(
        'Tu sesión fue cerrada por motivos de seguridad. Por favor, inicia sesión de nuevo.',
        securityCheck.reason
      );
    }

    const refreshInfo = await getRefreshTokenInfo(decoded.jti);
    if (!refreshInfo) {
      throw new UnauthorizedError('Refresh token no reconocido');
    }

    // Verificar si el token ya fue usado (detección de robo)
    const usedCheck = await isRefreshTokenUsed(decoded.jti);
    if (usedCheck.used) {
      // ¿Está dentro del grace period?
      const gracePeriodEnd = usedCheck.usedAt + TOKEN_SECURITY.ROTATION_GRACE_PERIOD_MS;

      if (Date.now() > gracePeriodEnd) {
        // Token reusado después del grace period = posible robo
        logSecurityEvent('AUTH_TOKEN_THEFT_DETECTED', {
          ...getRequestContext(req),
          jti: decoded.jti,
          userId: decoded.id,
          usedAt: new Date(usedCheck.usedAt).toISOString(),
          familyId: usedCheck.familyId
        });

        // Invalidar TODOS los tokens del usuario
        await revokeAllUserTokens(decoded.id, 'token_reuse_detected', getRequestContext(req));

        throw new UnauthorizedError(
          'Tu sesión fue cerrada por motivos de seguridad. Por favor, inicia sesión de nuevo.',
          'SESSION_REVOKED_SECURITY'
        );
      }

      // Dentro del grace period: permitir pero con warning
      logSecurityEvent('AUTH_REFRESH_TOKEN_REUSED', {
        ...getRequestContext(req),
        jti: decoded.jti,
        userId: decoded.id
      });
    }

    // Verificar fingerprint
    const currentFingerprint = generateDeviceFingerprint(req);
    if (decoded.fp !== currentFingerprint) {
      logSecurityEvent('AUTH_TOKEN_FINGERPRINT_MISMATCH', {
        ...getRequestContext(req),
        userId: decoded.id,
        fingerprintMismatch: true
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
    const authHeader = req.headers.authorization;
    const token = getBearerToken(authHeader);
    if (!token) {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        reason: 'MISSING_ACCESS_TOKEN'
      });
      throw new UnauthorizedError('Access token no proporcionado');
    }

    // Verificar access token (incluye validación de fingerprint)
    const decoded = await verifyAccessToken(token, req);

    // Buscar usuario en la base de datos (y seleccionar currentSessionId para validación)
    const user = await userRepository.findById(decoded.id, {
      select: '-password +currentSessionId'
    });

    if (!user) {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        reason: 'USER_NOT_FOUND',
        userId: decoded.id
      });
      throw new UnauthorizedError('Usuario no encontrado');
    }

    if (user.status !== 'active') {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        reason: 'USER_INACTIVE',
        userId: user._id,
        status: user.status
      });
      throw new UnauthorizedError('Usuario inactivo');
    }

    if (
      ['teacher', 'super_admin'].includes(user.role) &&
      user.accountStatus &&
      user.accountStatus !== 'approved'
    ) {
      const message = getAccountStatusMessage(user.accountStatus);
      logSecurityEvent('AUTHZ_ACCESS_DENIED', {
        ...getRequestContext(req),
        userId: user._id,
        reason: message,
        accountStatus: user.accountStatus
      });
      throw new ForbiddenError(message);
    }

    // SINGLE SESSION ENFORCEMENT
    // Verificar que la sesión del token coincide con la sesión actual del usuario
    if (decoded.sid && user.currentSessionId && decoded.sid !== user.currentSessionId) {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        userId: user._id,
        reason: 'SESSION_MISMATCH'
      });
      throw new UnauthorizedError(
        'Tu sesión ha expirado porque se ha iniciado sesión en otro dispositivo.'
      );
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
const requireRole =
  (...allowedRoles) =>
  (req, res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Autenticación requerida');
      }

      if (!allowedRoles.includes(req.user.role)) {
        logSecurityEvent('AUTHZ_ACCESS_DENIED', {
          ...getRequestContext(req),
          userId: req.user._id,
          userRole: req.user.role,
          requiredRoles: allowedRoles
        });

        throw new ForbiddenError(`Acceso denegado. Roles permitidos: ${allowedRoles.join(', ')}`);
      }

      next();
    } catch (error) {
      next(error);
    }
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
const requireOwnership =
  (resourceIdField = 'id') =>
  async (req, res, next) => {
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
        logSecurityEvent('AUTHZ_ACCESS_DENIED', {
          ...getRequestContext(req),
          userId: req.user._id,
          resourceId
        });

        throw new ForbiddenError('No tienes permiso para acceder a este recurso');
      }

      next();
    } catch (error) {
      next(error);
    }
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
    const token = getBearerToken(authHeader);
    if (!token) {
      return next(); // Sin token, continuar sin error
    }
    const decoded = await verifyAccessToken(token, req);
    const user = await userRepository.findById(decoded.id, { select: '-password' });

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
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const logout = async (req, res, next) => {
  try {
    // Revocar el access token actual
    const accessTokenExp = req.tokenExp * 1000; // Convertir a milisegundos
    await revokeToken(req.tokenJti, accessTokenExp, {
      ...getRequestContext(req),
      userId: req.user._id,
      tokenType: 'access',
      reason: 'logout'
    });

    // Revocar refresh token actual desde cookie httpOnly (si existe)
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (refreshToken) {
      try {
        const decoded = await verifyRefreshToken(refreshToken, req);
        const refreshTokenExp = decoded.exp * 1000;
        await revokeToken(decoded.jti, refreshTokenExp, {
          ...getRequestContext(req),
          userId: req.user._id,
          tokenType: 'refresh',
          reason: 'logout'
        });
      } catch (error) {
        // Si el refresh token ya expiró o es inválido, no importa
        logger.debug('Refresh token inválido en logout, ignorando', {
          error: error.message
        });
      }
    }

    logSecurityEvent('AUTH_TOKEN_REVOKED', {
      ...getRequestContext(req),
      userId: req.user._id,
      email: req.user.email,
      accessTokenJti: req.tokenJti,
      reason: 'logout'
    });

    res.clearCookie(REFRESH_COOKIE_NAME, buildRefreshCookieOptions());
    res.clearCookie(CSRF_COOKIE_NAME, buildCsrfCookieOptions());

    res.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Token generation
  generateTokenPair,
  generateAccessToken,
  generateRefreshToken,

  // Token verification
  verifyAccessToken,
  verifyRefreshToken,

  // Token management (Redis)
  revokeToken,
  isTokenRevoked,
  revokeAllUserTokens,
  checkSecurityFlag,

  // Refresh token management (Redis)
  storeRefreshToken,
  getRefreshTokenInfo,
  markRefreshTokenAsUsed,
  isRefreshTokenUsed,
  deleteRefreshToken,

  // Utilities
  generateDeviceFingerprint,

  // Middlewares
  authenticate,
  requireRole,
  requireOwnership,
  optionalAuth,
  logout,

  // Constants
  TOKEN_SECURITY
};
