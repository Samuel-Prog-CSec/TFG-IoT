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
const { validateBody, validateQuery } = require('../middlewares/validation');
const { registerTeacherSchema, loginSchema } = require('../validators/userValidator');
const {
  updateProfileSchema,
  changePasswordSchema,
  refreshTokenSchema,
  emptyObjectSchema
} = require('../validators/authValidator');

/**
 * @route   POST /api/auth/register
 * @desc    Registrar nuevo PROFESOR (solo profesores, endpoint público)
 * @access  Public
 * IMPORTANTE: Los alumnos NO se registran aquí, son creados en POST /api/users
 * @validation body: registerTeacherSchema | query: emptyObjectSchema
 */

/**
 * @route   POST /api/auth/login
 * @desc    Login de profesor (solo teachers)
 * @access  Public
 * @validation body: loginSchema | query: emptyObjectSchema
 */

router.post(
  '/register',
  validateQuery(emptyObjectSchema),
  validateBody(registerTeacherSchema),
  register
);

router.post('/login', validateQuery(emptyObjectSchema), validateBody(loginSchema), login);

/**
 * @route   GET /api/auth/me
 * @desc    Obtener perfil del usuario autenticado
 * @access  Private
 * @validation query: emptyObjectSchema
 */
router.get('/me', authenticate, validateQuery(emptyObjectSchema), getProfile);

/**
 * @route   PUT /api/auth/me
 * @desc    Actualizar perfil del usuario autenticado
 * @access  Private
 * @validation body: updateProfileSchema | query: emptyObjectSchema
 */
router.put(
  '/me',
  authenticate,
  validateQuery(emptyObjectSchema),
  validateBody(updateProfileSchema),
  updateProfile
);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Cambiar contraseña del usuario autenticado
 * @access  Private
 * @validation body: changePasswordSchema | query: emptyObjectSchema
 */
router.put(
  '/change-password',
  authenticate,
  validateQuery(emptyObjectSchema),
  validateBody(changePasswordSchema),
  changePassword
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refrescar access token con refresh token (implementa token rotation)
 * @access  Public (pero requiere refresh token válido)
 * @validation body: refreshTokenSchema | query: emptyObjectSchema
 */
router.post(
  '/refresh',
  validateQuery(emptyObjectSchema),
  validateBody(refreshTokenSchema),
  refreshAccessToken
);

/**
 * @route   POST /api/auth/logout
 * @desc    Cerrar sesión y revocar tokens
 * @access  Private
 * @validation body: emptyObjectSchema | query: emptyObjectSchema
 */
router.post(
  '/logout',
  authenticate,
  validateQuery(emptyObjectSchema),
  validateBody(emptyObjectSchema),
  logout
);

module.exports = router;
