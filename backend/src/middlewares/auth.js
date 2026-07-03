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
const { cacheInvalidate } = require('../utils/cacheHelper');
const { recordAuthUserCache } = require('../utils/runtimeMetrics');
const { authUserCache } = require('../utils/inMemoryCache');
const { Sentry } = require('../config/sentry');
const { authEventBus } = require('../utils/authEvents');

/**
 * TTL (segundos) del cache de slim-user usado por authenticate/optionalAuth.
 * Equilibra reducción de queries Mongo vs. ventana máxima de staleness post-ban.
 * Los flags de seguridad (revokeAllUserTokens) siguen siendo inmediatos porque
 * no pasan por este cache: `checkSecurityFlag` consulta `security:<userId>` directo.
 */
const AUTH_USER_CACHE_TTL_SECONDS =
  Number.parseInt(process.env.AUTH_USER_CACHE_TTL_SECONDS, 10) || 60;

/**
 * Invalida la entrada cacheada de un usuario para forzar re-fetch desde MongoDB
 * en el siguiente request autenticado. Debe invocarse tras cualquier cambio en
 * `role`, `status`, `accountStatus`, `currentSessionId`, `name`, `consent`.
 *
 * Fire-and-forget: si Redis no está disponible, falla silenciosamente porque el
 * TTL del cache garantiza frescura en ≤60s de todas formas.
 *
 * @param {string|Object} userId - ID del usuario (string o ObjectId)
 * @returns {Promise<void>}
 */
const invalidateUserCache = async userId => {
  if (!userId) {
    return;
  }
  const id = typeof userId === 'string' ? userId : userId.toString();
  // T-907 D: limpiamos primero el LRU local (síncrono) para que el siguiente
  // request en esta instancia recoja el cambio sin esperar.
  authUserCache.delete(id);

  // T-907 INT5: notificar al resto de instancias del cluster vía pub/sub
  // `cache:invalidate`. Cada subscriber limpia su LRU local. Si Redis no
  // está disponible, publishInvalidate falla silenciosamente y el TTL
  // (30s) actúa como fallback. Lazy require para evitar ciclos.
  try {
    const { publishInvalidate } = require('../realtime/cacheInvalidateSubscriber');
    publishInvalidate('auth:user', id).catch(() => {});
  } catch {
    // Si el módulo no carga (entorno de tests sin Redis pub/sub), seguir.
  }

  await cacheInvalidate('auth:user', id).catch(err => {
    logger.debug('invalidateUserCache: fallo al invalidar (ignorado)', {
      userId: id,
      error: err.message
    });
  });
};

/**
 * Obtiene un slim-user desde cache o MongoDB.
 * Centraliza la estrategia cache-aside usada por authenticate y optionalAuth.
 *
 * @param {string} userId
 * @param {string} [select='-password +currentSessionId'] - Campos Mongoose a proyectar
 * @returns {Promise<Object|null>} POJO con los campos seleccionados o null
 */
const fetchUserForAuth = async (userId, select = '-password +currentSessionId') => {
  // T-907 D: lookup en LRU local primero. En picos cortos (varios requests
  // del mismo usuario en <30s) evitamos un GET a Upstash por cada uno y
  // bajamos el consumo del free tier (10K cmds/día) sin sacrificar consistencia
  // material — invalidateUserCache limpia esta capa cuando hay cambios.
  const cacheKey = typeof userId === 'string' ? userId : String(userId);
  const localHit = authUserCache.get(cacheKey);
  if (localHit !== undefined) {
    recordAuthUserCache('hit');
    return localHit;
  }

  // Segundo nivel: cache Redis (slim POJO compartido entre instancias).
  const cached = await redisService.get('auth:user', userId);
  if (cached !== null) {
    try {
      const parsed = JSON.parse(cached);
      recordAuthUserCache('hit');
      // Repoblar el LRU local para que el siguiente request del mismo
      // proceso evite el round-trip Redis.
      authUserCache.set(cacheKey, parsed);
      return parsed;
    } catch {
      // Valor cacheado corrupto: continuar con fetch.
    }
  }

  recordAuthUserCache('miss');
  const userDoc = await userRepository.findById(userId, { select });
  if (!userDoc) {
    return null;
  }

  // Serializar como POJO para cachear. `.toObject()` en Mongoose, fallback si ya es plano.
  const plain =
    typeof userDoc.toObject === 'function' ? userDoc.toObject({ virtuals: true }) : { ...userDoc };

  // Eliminar password si se coló (defensa en profundidad — select ya lo excluye).
  delete plain.password;

  // Cachear en ambos niveles. El LRU local es síncrono; Redis es fire-and-forget.
  authUserCache.set(cacheKey, plain);
  redisService
    .setWithTTL('auth:user', userId, JSON.stringify(plain), AUTH_USER_CACHE_TTL_SECONDS)
    .catch(err => {
      logger.debug('fetchUserForAuth: fallo al cachear (ignorado)', {
        userId,
        error: err.message
      });
    });

  return plain;
};

/**
 * T-907 INT1: combina blacklist + security flag + lookup auth:user en un
 * único pipeline a Redis. Implementa la misma semántica que
 * `verifyAccessToken` + `fetchUserForAuth` ejecutadas por separado, pero con
 * 1 round-trip a Upstash en miss (y 0 si el LRU local hace hit).
 *
 * Reglas de validación (deben coincidir con `verifyAccessToken` y
 * `checkSecurityFlag` para no regresar bugs):
 *   - Si `EXISTS blacklist:<jti>` → revocado → UnauthorizedError TOKEN_REVOKED.
 *   - Si `GET security:<userId>` devuelve flag y `iat * 1000 + 1000 < flagMs`
 *     → SESSION_REVOKED.
 *   - Si `GET auth:user:<userId>` hit → parse y retornar; cachear en LRU.
 *   - Si auth:user miss → fallback a Mongo + cachear en ambas capas.
 *
 * @param {Object} decoded - JWT decodificado (id, jti, iat, ...)
 * @param {import('express').Request} req
 * @returns {Promise<Object|null>} POJO usuario o null si no existe en BD.
 * @throws {UnauthorizedError} si el token está revocado o sesión cerrada.
 */
const fetchUserForAuthWithChecks = async (decoded, req) => {
  const userId = decoded.id;
  const cacheKey = typeof userId === 'string' ? userId : String(userId);

  // 1) LRU local first. Si hit, todavía hay que comprobar blacklist + security
  //    porque el LRU no los almacena.
  const localUser = authUserCache.get(cacheKey);

  // 2) Pipeline batched. Incluye GET auth:user solo si el LRU hizo miss
  //    (evita un GET innecesario al servidor).
  const pipelineResults = await redisService.runPipeline(p => {
    p.exists(`${redisService.NAMESPACES.BLACKLIST}:${decoded.jti}`);
    p.get(`${redisService.NAMESPACES.SECURITY}:${userId}`);
    if (!localUser) {
      p.get(`${redisService.NAMESPACES.AUTH_USER}:${userId}`);
    }
  }, 'auth');

  // Si Redis no está disponible, runPipeline devuelve null: degradamos a la
  // ruta tradicional sin perder funcionalidad (igual que el resto del servicio).
  // Fail-open CONSCIENTE: durante un outage de Redis NO podemos comprobar la
  // blacklist ni el flag de seguridad, así que un token revocado se aceptaría
  // hasta su expiración (≤15 min access). Se registra el evento para que quede
  // rastro auditable de la ventana de degradación (RD-5).
  if (!pipelineResults) {
    logSecurityEvent('AUTH_REVOCATION_CHECK_SKIPPED', {
      ...getRequestContext(req),
      userId,
      jti: decoded.jti,
      reason: 'REDIS_UNAVAILABLE'
    });
    if (localUser) {
      recordAuthUserCache('hit');
      return localUser;
    }
    return await fetchUserForAuth(userId);
  }

  const [blacklistResult, securityResult, redisUserResult] = pipelineResults;

  // 3) Blacklist check
  const revoked = blacklistResult?.[1] === 1;
  if (revoked) {
    logSecurityEvent('AUTH_TOKEN_INVALID', {
      ...getRequestContext(req),
      userId,
      jti: decoded.jti,
      reason: 'ACCESS_TOKEN_REVOKED'
    });
    throw new UnauthorizedError('Token revocado', 'TOKEN_REVOKED');
  }

  // 4) Security flag check (logout forzado). Misma tolerancia 1s que
  //    `checkSecurityFlag` para no rechazar re-logins inmediatos tras
  //    revokeAllUserTokens.
  const flagTimestamp = securityResult?.[1];
  if (flagTimestamp) {
    const flagTime = Number.parseInt(flagTimestamp, 10);
    const tokenTimeMs = decoded.iat * 1000;
    if (Number.isFinite(flagTime) && tokenTimeMs + 1000 < flagTime) {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        userId,
        reason: 'SESSION_REVOKED_SECURITY'
      });
      throw new UnauthorizedError(
        'Tu sesión fue cerrada por motivos de seguridad. Por favor, inicia sesión de nuevo.',
        'SESSION_REVOKED'
      );
    }
  }

  // 5) Resolver el slim-user
  if (localUser) {
    recordAuthUserCache('hit');
    return localUser;
  }

  const cachedRaw = redisUserResult?.[1];
  if (cachedRaw) {
    try {
      const parsed = JSON.parse(cachedRaw);
      recordAuthUserCache('hit');
      authUserCache.set(cacheKey, parsed);
      return parsed;
    } catch {
      // Valor cacheado corrupto: cae al fetch Mongo.
    }
  }

  // 6) Miss real: Mongo + populación de ambas capas.
  recordAuthUserCache('miss');
  const userDoc = await userRepository.findById(userId, {
    select: '-password +currentSessionId'
  });
  if (!userDoc) {
    return null;
  }

  const plain =
    typeof userDoc.toObject === 'function' ? userDoc.toObject({ virtuals: true }) : { ...userDoc };
  delete plain.password;

  authUserCache.set(cacheKey, plain);
  redisService
    .setWithTTL(
      redisService.NAMESPACES.AUTH_USER,
      userId,
      JSON.stringify(plain),
      AUTH_USER_CACHE_TTL_SECONDS
    )
    .catch(err => {
      logger.debug('fetchUserForAuthWithChecks: fallo al cachear (ignorado)', {
        userId,
        error: err.message
      });
    });

  return plain;
};

/**
 * Constantes de seguridad para tokens.
 */
/**
 * Vida útil del refresh token en Redis (7 días). Es el gate REAL de validez:
 * `verifyRefreshToken` exige `getRefreshTokenInfo`, cuya key expira con este TTL,
 * por lo que un refresh token deja de aceptarse a los 7 días aunque el JWT
 * declare un `exp` mayor.
 */
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const TOKEN_SECURITY = {
  /** Grace period para tokens rotados (10 segundos) */
  ROTATION_GRACE_PERIOD_MS: 10000,
  /** Duración del refresh token en segundos (7 días) */
  REFRESH_TOKEN_TTL_SECONDS,
  /**
   * Duración del flag de revocación global (`security:<userId>`).
   *
   * DEBE cubrir toda la vida útil del refresh token. Con el valor previo (1 h)
   * un refresh token robado ANTES de un logout forzado (cambio de contraseña,
   * alta/baja de MFA o robo de token detectado) volvía a ser aceptado pasada
   * esa hora, porque `verifyRefreshToken` solo consulta este flag y, expirado,
   * el token seguía vivo en `NAMESPACES.REFRESH` durante 7 días. Alineándolo con
   * REFRESH_TOKEN_TTL_SECONDS, la revocación global es efectiva durante toda la
   * ventana en que el token podría reutilizarse. La tolerancia de 1 s en
   * `checkSecurityFlag` sigue permitiendo el re-login inmediato legítimo.
   */
  SECURITY_FLAG_TTL_SECONDS: REFRESH_TOKEN_TTL_SECONDS
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
    // Invalidar caches in-memory de Socket.IO inmediatamente
    authEventBus.emit('token_revoked', { jti });
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
    // Invalidar caches in-memory de Socket.IO inmediatamente
    authEventBus.emit('all_tokens_revoked', { userId, reason });
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

  // Tolerancia 1s para el rounding de `iat` (segundos vs ms del flag). Sin
  // esto, un re-login inmediatamente tras revokeAllUserTokens dentro del mismo
  // segundo (típico en setupVerify de MFA, B7) sería rechazado erróneamente.
  // El flag protege contra tokens emitidos ANTES de la revocación; los emitidos
  // en el mismo segundo o posteriores son los nuevos legítimos.
  if (tokenTimeMs + 1000 < flagTime) {
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
      algorithm: 'HS256', // Explícito: bloquea downgrade a "none" o swap a RS256
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
      algorithm: 'HS256', // Explícito: bloquea downgrade a "none" o swap a RS256
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
const verifyAccessToken = async (token, req, { skipRedisChecks = false } = {}) => {
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET, // Sin fallback inseguro - validado en envValidator
      {
        algorithms: ['HS256'], // Whitelist: bloquea "alg: none" y algorithm confusion (HS↔RS)
        issuer: 'rfid-games-platform',
        audience: 'rfid-games-client',
        clockTolerance: 0 // No permitir clock skew para tokens cortos (15min)
      }
    );

    // Strict claims: jti e iat son obligatorios
    if (!decoded.jti) {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        reason: 'ACCESS_TOKEN_MISSING_JTI'
      });
      throw new UnauthorizedError('Token sin JTI', 'TOKEN_INVALID');
    }
    if (!decoded.iat) {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        reason: 'ACCESS_TOKEN_MISSING_IAT'
      });
      throw new UnauthorizedError('Token sin iat', 'TOKEN_INVALID');
    }
    // iat no puede estar en el futuro (clock skew o token forjado)
    if (decoded.iat * 1000 > Date.now() + 5000) {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        reason: 'ACCESS_TOKEN_IAT_FUTURE',
        iat: decoded.iat
      });
      throw new UnauthorizedError('Token con iat en futuro', 'TOKEN_INVALID');
    }

    // Verificar que es un access token
    if (decoded.type !== 'access') {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        userId: decoded.id,
        reason: 'ACCESS_TOKEN_WRONG_TYPE'
      });
      throw new UnauthorizedError('Token type inválido', 'TOKEN_INVALID');
    }

    // T-907 INT1: el caller puede saltarse las consultas Redis aquí cuando ya
    // las hizo agrupadas en un pipeline (un solo round-trip a Upstash) — útil
    // para `authenticate`/`optionalAuth`. Los consumers de socket siguen sin
    // pasar la opción y mantienen el flujo secuencial.
    if (!skipRedisChecks) {
      // Verificar blacklist en Redis
      const revoked = await isTokenRevoked(decoded.jti);
      if (revoked) {
        logSecurityEvent('AUTH_TOKEN_INVALID', {
          ...getRequestContext(req),
          userId: decoded.id,
          jti: decoded.jti,
          reason: 'ACCESS_TOKEN_REVOKED'
        });
        throw new UnauthorizedError('Token revocado', 'TOKEN_REVOKED');
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
          'SESSION_REVOKED'
        );
      }
    }

    // Verificar fingerprint del dispositivo
    const currentFingerprint = generateDeviceFingerprint(req);
    if (decoded.fp !== currentFingerprint) {
      logSecurityEvent('AUTH_TOKEN_FINGERPRINT_MISMATCH', {
        ...getRequestContext(req),
        userId: decoded.id,
        fingerprintMismatch: true
      });
      throw new UnauthorizedError('Token fingerprint inválido', 'TOKEN_FINGERPRINT_MISMATCH');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        reason: 'ACCESS_TOKEN_EXPIRED'
      });
      throw new UnauthorizedError('Access token expirado', 'TOKEN_EXPIRED');
    }
    if (error.name === 'JsonWebTokenError') {
      logSecurityEvent('AUTH_TOKEN_INVALID', {
        ...getRequestContext(req),
        reason: 'ACCESS_TOKEN_INVALID'
      });
      throw new UnauthorizedError('Access token inválido', 'TOKEN_INVALID');
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Error al verificar access token', 'TOKEN_INVALID');
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
        algorithms: ['HS256'], // Whitelist: bloquea "alg: none" y algorithm confusion (HS↔RS)
        issuer: 'rfid-games-platform',
        audience: 'rfid-games-client',
        clockTolerance: 0 // No permitir clock skew
      }
    );

    // Strict claims: jti e iat obligatorios
    if (!decoded.jti) {
      throw new UnauthorizedError('Refresh token sin JTI');
    }
    if (!decoded.iat) {
      throw new UnauthorizedError('Refresh token sin iat');
    }
    if (decoded.iat * 1000 > Date.now() + 5000) {
      throw new UnauthorizedError('Refresh token con iat en futuro');
    }

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
      throw new UnauthorizedError('Access token no proporcionado', 'TOKEN_MISSING');
    }

    // T-907 INT1: decode local (sync JWT verify + fingerprint), checks Redis
    // se agrupan después en una pipeline. Antes esto requería 2 round-trips
    // secuenciales (`isTokenRevoked` + `checkSecurityFlag`) más un tercero
    // dentro de `fetchUserForAuth`. Ahora son 0 round-trips si el LRU local
    // hace hit, o 1 round-trip combinado en miss.
    const decoded = await verifyAccessToken(token, req, { skipRedisChecks: true });

    // Buscar usuario y validar blacklist + security flag en un único viaje.
    const user = await fetchUserForAuthWithChecks(decoded, req);

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
        'Tu sesión ha expirado porque se ha iniciado sesión en otro dispositivo.',
        'SESSION_MISMATCH'
      );
    }

    // Adjuntar usuario y metadata del token a la request
    req.user = user;
    Sentry.setUser({ id: user._id.toString(), role: user.role });
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
    // T-907 INT1: pipeline batch como en authenticate; si lanza el catch lo
    // tragamos abajo igual que el comportamiento previo del modo opcional.
    const decoded = await verifyAccessToken(token, req, { skipRedisChecks: true });
    const user = await fetchUserForAuthWithChecks(decoded, req);

    if (user?.status === 'active') {
      req.user = user;
      req.tokenJti = decoded.jti;
      Sentry.setUser({ id: user._id.toString(), role: user.role });
    }

    return next();
  } catch (error) {
    // Ignorar errores de autenticación en modo opcional
    logger.debug('Token opcional inválido, continuando sin autenticación', {
      error: error.message
    });
    return next();
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
const logout = async (req, res) => {
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

  // SINGLE SESSION: invalidar inmediatamente el access token actual
  // incluso si Redis no está disponible para blacklist.
  // Nota: req.user es un POJO cacheado (slim user), no un Mongoose doc — usamos
  // userRepository.updateById en vez de req.user.save(), e invalidamos el cache
  // para forzar re-fetch en el siguiente request del mismo usuario.
  if (req.user?.currentSessionId) {
    const newSessionId = crypto.randomUUID();
    await userRepository.updateById(req.user._id, { currentSessionId: newSessionId });
    await invalidateUserCache(req.user._id);
    req.user.currentSessionId = newSessionId;
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
  optionalAuth,
  logout,

  // Cache de slim-user (helpers para consumidores que replican el patrón cache-aside)
  invalidateUserCache,
  fetchUserForAuth,

  // Constants
  TOKEN_SECURITY
};
