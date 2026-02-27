/**
 * @fileoverview Controller para autenticación y gestión de usuarios.
 * Maneja registro, login, perfil y CRUD de usuarios (teachers y students).
 * @module controllers/authController
 */

const userRepository = require('../repositories/userRepository');
const {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError
} = require('../utils/errors');
const {
  generateTokenPair,
  verifyRefreshToken,
  markRefreshTokenAsUsed,
  deleteRefreshToken,
  revokeAllUserTokens
} = require('../middlewares/auth');
const logger = require('../utils/logger');
const { logSecurityEvent, getRequestContext } = require('../utils/securityLogger');
const { toUserDTOV1, toAuthResponseDTOV1 } = require('../utils/dtos');
const { disconnectUserSockets } = require('../utils/socketUtils');
const crypto = require('node:crypto');

const REFRESH_COOKIE_NAME = 'refreshToken';

const buildRefreshCookieOptions = maxAgeMs => {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: maxAgeMs
  };
};

/**
 * Registrar un nuevo PROFESOR (SOLO para profesores, endpoint público).
 *
 * POST /api/auth/register
 * Body: { name, email, password, profile? }
 *
 * IMPORTANTE: Este endpoint es SOLO para registro de profesores.
 * Los alumnos NO se registran aquí, son creados por profesores en POST /api/users.
 *
 * Validaciones:
 * - Email y password son obligatorios
 * - Email único
 * - Password mínimo 6 caracteres
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const register = async (req, res, next) => {
  let securityLogged = false;
  try {
    const { name, email, password, profile, website } = req.body;
    const requestContext = getRequestContext(req);

    if (website?.trim()) {
      logSecurityEvent('AUTH_REGISTER_FAILED', {
        ...requestContext,
        reason: 'HONEYPOT_TRIGGERED',
        email
      });
      securityLogged = true;
      throw new ForbiddenError('Registro no permitido');
    }

    // Validar campos obligatorios para profesores
    if (!email) {
      logSecurityEvent('AUTH_REGISTER_FAILED', {
        ...requestContext,
        reason: 'EMAIL_REQUIRED'
      });
      securityLogged = true;
      throw new ValidationError('El email es obligatorio para profesores');
    }

    if (!password) {
      logSecurityEvent('AUTH_REGISTER_FAILED', {
        ...requestContext,
        reason: 'PASSWORD_REQUIRED',
        email
      });
      securityLogged = true;
      throw new ValidationError('La contraseña es obligatoria para profesores');
    }

    // Verificar si el email ya existe
    const existingUser = await userRepository.findOne({ email });
    if (existingUser) {
      logSecurityEvent('AUTH_REGISTER_FAILED', {
        ...requestContext,
        reason: 'EMAIL_ALREADY_REGISTERED',
        email
      });
      securityLogged = true;
      throw new ConflictError('El email ya está registrado');
    }

    // Crear profesor (role hardcodeado a 'teacher')
    const teacher = await userRepository.create({
      name,
      email,
      password, // Se encripta automáticamente en el pre-save hook
      role: 'teacher', // ✅ FORZADO - Este endpoint solo crea profesores
      profile: profile || {},
      status: 'active',
      accountStatus: 'pending_approval'
    });

    logSecurityEvent('AUTH_REGISTER_SUCCESS', {
      ...requestContext,
      userId: teacher._id,
      role: teacher.role,
      email: teacher.email
    });

    res.status(201).json({
      success: true,
      message: 'Profesor registrado. Cuenta pendiente de aprobación por Super Admin.',
      data: {
        user: toUserDTOV1(teacher)
      }
    });
  } catch (error) {
    if (!securityLogged && (error instanceof ValidationError || error instanceof ConflictError)) {
      logSecurityEvent('AUTH_REGISTER_FAILED', {
        ...getRequestContext(req),
        reason: error.message,
        email: req.body?.email
      });
    }
    next(error);
  }
};

const assertAccountApprovedForLogin = user => {
  if (!['teacher', 'super_admin'].includes(user.role)) {
    return;
  }

  if (user.accountStatus === 'approved') {
    return;
  }

  if (user.accountStatus === 'pending_approval') {
    throw new ForbiddenError('Cuenta pendiente de aprobación');
  }

  if (user.accountStatus === 'rejected') {
    throw new ForbiddenError('Cuenta rechazada');
  }

  throw new ForbiddenError('Cuenta no aprobada');
};

/**
 * Login de profesor (solo teachers pueden hacer login).
 *
 * POST /api/auth/login
 * Body: { email, password }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const login = async (req, res, next) => {
  let securityLogged = false;
  let user = null;
  try {
    const { email, password } = req.body;
    const requestContext = getRequestContext(req);

    // Buscar usuario por email (incluir password para comparación)
    user = await userRepository.findOne({ email }, { select: '+password' });

    if (!user) {
      logSecurityEvent('AUTH_LOGIN_FAILED', {
        ...requestContext,
        reason: 'USER_NOT_FOUND',
        email
      });
      securityLogged = true;
      throw new UnauthorizedError('Credenciales inválidas');
    }

    // Verificar que sea un usuario con login
    if (!['teacher', 'super_admin'].includes(user.role)) {
      logSecurityEvent('AUTH_LOGIN_FAILED', {
        ...requestContext,
        reason: 'ROLE_NOT_ALLOWED',
        email,
        userId: user._id,
        role: user.role
      });
      securityLogged = true;
      throw new UnauthorizedError('Solo profesores y super admin pueden iniciar sesión');
    }

    // Verificar que esté activo
    if (user.status !== 'active') {
      logSecurityEvent('AUTH_LOGIN_FAILED', {
        ...requestContext,
        reason: 'USER_INACTIVE',
        email,
        userId: user._id,
        status: user.status
      });
      securityLogged = true;
      throw new UnauthorizedError('Usuario inactivo');
    }

    // Verificar aprobación de cuenta (para roles con login)
    try {
      assertAccountApprovedForLogin(user);
    } catch (error) {
      logSecurityEvent('AUTH_LOGIN_FAILED', {
        ...requestContext,
        reason: error.message,
        email,
        userId: user._id,
        accountStatus: user.accountStatus
      });
      securityLogged = true;
      throw error;
    }

    // Comparar contraseña
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      logSecurityEvent('AUTH_LOGIN_FAILED', {
        ...requestContext,
        reason: 'INVALID_PASSWORD',
        email,
        userId: user._id
      });
      securityLogged = true;
      throw new UnauthorizedError('Credenciales inválidas');
    }

    // SINGLE SESSION: Invalidar sesión anterior
    const sessionId = crypto.randomUUID();
    user.currentSessionId = sessionId;

    // Actualizar lastLoginAt (esto guarda también el currentSessionId)
    await user.updateLastLogin();

    // Notificar al dispositivo anterior vía WebSocket
    const io = req.app.get('io');
    if (io) {
      disconnectUserSockets(io, user._id.toString(), 'NEW_LOGIN');
      logSecurityEvent('AUTH_SESSION_INVALIDATED', {
        ...requestContext,
        userId: user._id,
        reason: 'NEW_LOGIN'
      });
    }

    // Generar par de tokens (access + refresh) con nueva familia y sessionId
    const tokens = await generateTokenPair(user, req, sessionId);

    // Eliminar datos internos antes de enviar respuesta
    const { _internal, ...publicTokens } = tokens;

    // Guardar refresh token en cookie httpOnly
    res.cookie(
      REFRESH_COOKIE_NAME,
      tokens.refreshToken,
      buildRefreshCookieOptions(tokens.refreshTokenExpiresIn * 1000)
    );

    logSecurityEvent('AUTH_LOGIN_SUCCESS', {
      ...requestContext,
      userId: user._id,
      email: user.email,
      role: user.role
    });

    res.json({
      success: true,
      message: 'Login exitoso',
      data: toAuthResponseDTOV1(user, publicTokens)
    });
  } catch (error) {
    if (
      !securityLogged &&
      (error instanceof UnauthorizedError || error instanceof ForbiddenError)
    ) {
      logSecurityEvent('AUTH_LOGIN_FAILED', {
        ...getRequestContext(req),
        reason: error.message,
        email: req.body?.email,
        userId: user?._id
      });
    }
    next(error);
  }
};

/**
 * Obtener perfil del usuario autenticado.
 *
 * GET /api/auth/me
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getProfile = async (req, res, next) => {
  try {
    // req.user ya está disponible por el middleware authenticate
    const user = await userRepository.findById(req.user._id);

    if (!user) {
      throw new NotFoundError('Usuario');
    }

    res.json({
      success: true,
      data: toUserDTOV1(user)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Actualizar perfil del usuario autenticado.
 *
 * PUT /api/auth/me
 * Headers: Authorization: Bearer <token>
 * Body: { name?, profile? }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name, profile } = req.body;

    const user = await userRepository.findById(req.user._id);

    if (!user) {
      throw new NotFoundError('Usuario');
    }

    // Actualizar campos
    if (name) {
      user.name = name;
    }
    if (profile) {
      user.profile = { ...user.profile.toObject(), ...profile };
    }

    await user.save();

    logger.info('Perfil actualizado', {
      userId: user._id,
      email: user.email
    });

    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: toUserDTOV1(user)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cambiar contraseña del usuario autenticado.
 *
 * PUT /api/auth/change-password
 * Headers: Authorization: Bearer <token>
 * Body: { currentPassword, newPassword }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const changePassword = async (req, res, next) => {
  let securityLogged = false;
  try {
    const { currentPassword, newPassword } = req.body;
    const requestContext = getRequestContext(req);

    const user = await userRepository.findById(req.user._id, { select: '+password' });

    if (!user) {
      throw new NotFoundError('Usuario');
    }

    // Verificar contraseña actual
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      logSecurityEvent('AUTH_PASSWORD_CHANGE_FAILED', {
        ...requestContext,
        userId: user._id,
        reason: 'INVALID_CURRENT_PASSWORD'
      });
      securityLogged = true;
      throw new UnauthorizedError('Contraseña actual incorrecta');
    }

    // Actualizar contraseña (se encripta automáticamente)
    user.password = newPassword;
    user.currentSessionId = crypto.randomUUID();
    await user.save();

    await revokeAllUserTokens(user._id.toString(), 'password_changed', {
      ...requestContext,
      userId: user._id
    });

    const io = req.app.get('io');
    if (io) {
      disconnectUserSockets(io, user._id.toString(), 'PASSWORD_CHANGED');
    }

    logSecurityEvent('AUTH_PASSWORD_CHANGED', {
      ...requestContext,
      userId: user._id,
      email: user.email
    });

    res.clearCookie(REFRESH_COOKIE_NAME, buildRefreshCookieOptions(0));

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente. Inicia sesión nuevamente.'
    });
  } catch (error) {
    if (!securityLogged && error instanceof UnauthorizedError) {
      logSecurityEvent('AUTH_PASSWORD_CHANGE_FAILED', {
        ...getRequestContext(req),
        userId: req.user?._id,
        reason: error.message
      });
    }
    next(error);
  }
};

/**
 * Refrescar access token usando un refresh token válido.
 * Implementa token rotation: revoca el viejo refresh token y genera uno nuevo.
 *
 * POST /api/auth/refresh
 * Cookie: refreshToken (httpOnly)
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const refreshAccessToken = async (req, res, next) => {
  let securityLogged = false;
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const requestContext = getRequestContext(req);

    if (!refreshToken) {
      logSecurityEvent('AUTH_REFRESH_FAILED', {
        ...requestContext,
        reason: 'REFRESH_TOKEN_REQUIRED'
      });
      securityLogged = true;
      throw new ValidationError('Refresh token requerido');
    }

    // Verificar refresh token (incluye fingerprint, blacklist y detección de robo)
    const decoded = await verifyRefreshToken(refreshToken, req);

    // Buscar usuario (incluyendo currentSessionId para validación)
    const user = await userRepository.findById(decoded.id, { select: '+currentSessionId' });

    if (!user) {
      throw new UnauthorizedError('Usuario no encontrado');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('Usuario inactivo');
    }

    // Bloquear refresh para cuentas no aprobadas
    assertAccountApprovedForLogin(user);

    // Obtener información del token para mantener la familia
    const { getRefreshTokenInfo } = require('../middlewares/auth');
    const tokenInfo = await getRefreshTokenInfo(decoded.jti);
    const familyId = tokenInfo?.familyId || crypto.randomUUID();

    // SINGLE SESSION VALIDATION
    if (decoded.sid && user.currentSessionId && decoded.sid !== user.currentSessionId) {
      throw new UnauthorizedError('Tu sesión ha expirado (nueva sesión activa)');
    }

    // Asegurar que el usuario tenga sesión si no la tenía (migración legacy)
    let sessionId = user.currentSessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      user.currentSessionId = sessionId;
      await user.save();
    }

    // TOKEN ROTATION:
    // 1. Marcar el token actual como "usado" (para detectar reuso)
    await markRefreshTokenAsUsed(decoded.jti, familyId);

    // 2. Eliminar el token de la lista de tokens activos
    await deleteRefreshToken(decoded.jti);

    // 3. Generar nuevo par de tokens (mantiene la familia y sesión)
    const tokens = await generateTokenPair(user, req, sessionId, familyId);

    // Eliminar datos internos antes de enviar
    const { _internal, ...publicTokens } = tokens;

    // Rotar refresh token en cookie httpOnly
    res.cookie(
      REFRESH_COOKIE_NAME,
      tokens.refreshToken,
      buildRefreshCookieOptions(tokens.refreshTokenExpiresIn * 1000)
    );

    logSecurityEvent('AUTH_REFRESH_SUCCESS', {
      ...requestContext,
      userId: user._id,
      email: user.email,
      oldRefreshTokenJti: decoded.jti,
      newRefreshTokenJti: _internal.refreshTokenJti,
      familyId
    });

    res.json({
      success: true,
      message: 'Tokens refrescados exitosamente',
      data: {
        accessToken: publicTokens.accessToken,
        accessTokenExpiresIn: publicTokens.accessTokenExpiresIn,
        tokenType: publicTokens.tokenType
      }
    });
  } catch (error) {
    if (!securityLogged) {
      logSecurityEvent('AUTH_REFRESH_FAILED', {
        ...getRequestContext(req),
        reason: error.message
      });
    }
    next(error);
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  refreshAccessToken
};
