/**
 * @fileoverview Rutas de autenticación y gestión de perfil.
 * Endpoints: register, login, profile, change-password.
 * @module routes/auth
 */

const express = require('express');
const router = express.Router();

const {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  refreshAccessToken
} = require('../controllers/authController');

const { authenticate, logout } = require('../middlewares/auth');

/**
 * @route   POST /api/auth/register
 * @desc    Registrar nuevo PROFESOR (solo profesores, endpoint público)
 * @access  Public
 * IMPORTANTE: Los alumnos NO se registran aquí, son creados en POST /api/users
 */


/**
 * @route   POST /api/auth/login
 * @desc    Login de profesor (solo teachers)
 * @access  Public
 */


// Sprint 2 (mantenimiento): Zod deshabilitado temporalmente en rutas.
router.post('/register', register);

// Sprint 2 (mantenimiento): Zod deshabilitado temporalmente en rutas.
router.post('/login', login);

/**
 * @route   GET /api/auth/me
 * @desc    Obtener perfil del usuario autenticado
 * @access  Private
 */
router.get('/me', authenticate, getProfile);

/**
 * @route   PUT /api/auth/me
 * @desc    Actualizar perfil del usuario autenticado
 * @access  Private
 */
router.put('/me', authenticate, updateProfile);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Cambiar contraseña del usuario autenticado
 * @access  Private
 */
router.put('/change-password', authenticate, changePassword);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refrescar access token con refresh token (implementa token rotation)
 * @access  Public (pero requiere refresh token válido)
 */
router.post('/refresh', refreshAccessToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Cerrar sesión y revocar tokens
 * @access  Private
 */
router.post('/logout', authenticate, logout);

module.exports = router;
