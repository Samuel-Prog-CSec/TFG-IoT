/**
 * @fileoverview Controller para autenticación y gestión de usuarios.
 * Maneja registro, login, perfil y CRUD de usuarios (teachers y students).
 * @module controllers/authController
 */

const User = require('../models/User');
const {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ConflictError
} = require('../utils/errors');
const {
  generateTokenPair,
  verifyRefreshToken,
  revokeToken
} = require('../middlewares/auth');
const logger = require('../utils/logger');
const { userDTO } = require('../utils/dtos');

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
  try {
    const { name, email, password, profile } = req.body;

    // Validar campos obligatorios para profesores
    if (!email) {
      throw new ValidationError('El email es obligatorio para profesores');
    }

    if (!password) {
      throw new ValidationError('La contraseña es obligatoria para profesores');
    }

    // Verificar si el email ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ConflictError('El email ya está registrado');
    }

    // Crear profesor (role hardcodeado a 'teacher')
    const teacher = await User.create({
      name,
      email,
      password, // Se encripta automáticamente en el pre-save hook
      role: 'teacher', // ✅ FORZADO - Este endpoint solo crea profesores
      profile: profile || {},
      status: 'active'
    });

    logger.info('Profesor registrado', {
      userId: teacher._id,
      role: teacher.role,
      email: teacher.email
    });

    // Generar par de tokens para login automático
    const tokens = generateTokenPair(teacher, req);

    res.status(201).json({
      success: true,
      message: 'Profesor registrado exitosamente',
      data: {
        user: userDTO(teacher),
        ...tokens
      }
    });
  } catch (error) {
    next(error);
  }
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
  try {
    const { email, password } = req.body;

    // Buscar usuario por email (incluir password para comparación)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    // Verificar que sea un profesor
    if (user.role !== 'teacher') {
      throw new UnauthorizedError('Solo los profesores pueden iniciar sesión');
    }

    // Verificar que esté activo
    if (user.status !== 'active') {
      throw new UnauthorizedError('Usuario inactivo');
    }

    // Comparar contraseña
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    // Actualizar lastLoginAt
    await user.updateLastLogin();

    // Generar par de tokens (access + refresh)
    const tokens = generateTokenPair(user, req);

    logger.info('Login exitoso', {
      userId: user._id,
      email: user.email,
      role: user.role
    });

    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        user: userDTO(user),
        ...tokens
      }
    });
  } catch (error) {
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
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new NotFoundError('Usuario');
    }

    res.json({
      success: true,
      data: userDTO(user)
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

    const user = await User.findById(req.user._id);

    if (!user) {
      throw new NotFoundError('Usuario');
    }

    // Actualizar campos
    if (name) user.name = name;
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
      data: userDTO(user)
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
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      throw new NotFoundError('Usuario');
    }

    // Verificar contraseña actual
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Contraseña actual incorrecta');
    }

    // Actualizar contraseña (se encripta automáticamente)
    user.password = newPassword;
    await user.save();

    logger.info('Contraseña cambiada', {
      userId: user._id,
      email: user.email
    });

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refrescar access token usando un refresh token válido.
 * Implementa token rotation: revoca el viejo refresh token y genera uno nuevo.
 *
 * POST /api/auth/refresh
 * Body: { refreshToken }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ValidationError('Refresh token requerido');
    }

    // Verificar refresh token (incluye fingerprint y blacklist)
    const decoded = verifyRefreshToken(refreshToken, req);

    // Buscar usuario
    const user = await User.findById(decoded.id);

    if (!user) {
      throw new UnauthorizedError('Usuario no encontrado');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('Usuario inactivo');
    }

    // TOKEN ROTATION: Revocar el refresh token actual
    const oldRefreshTokenExp = decoded.exp * 1000;
    revokeToken(decoded.jti, oldRefreshTokenExp);

    // Generar nuevo par de tokens
    const tokens = generateTokenPair(user, req);

    logger.info('Tokens refrescados con token rotation', {
      userId: user._id,
      email: user.email,
      oldRefreshTokenJti: decoded.jti,
      newRefreshTokenJti: 'generated'
    });

    res.json({
      success: true,
      message: 'Tokens refrescados exitosamente',
      data: {
        ...tokens
      }
    });
  } catch (error) {
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
