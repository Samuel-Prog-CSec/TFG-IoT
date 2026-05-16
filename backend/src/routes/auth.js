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
const { registerRateLimiter } = require('../config/security');
const { validateBody, validateQuery } = require('../middlewares/validation');
const { registerTeacherSchema, loginSchema } = require('../validators/userValidator');
const {
  updateProfileSchema,
  changePasswordSchema,
  refreshTokenSchema,
  emptyObjectSchema
} = require('../validators/authValidator');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Registrar nuevo docente
 *     description: |
 *       Crea una cuenta de docente con estado `pending` (requiere aprobación del super admin).
 *       Los alumnos NO se registran aquí — los crea el docente via `POST /api/users`.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               organization: { type: string }
 *     responses:
 *       201: { description: Cuenta creada en estado `pending` }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409: { description: Email ya registrado }
 *       429: { $ref: '#/components/responses/RateLimitError' }
 */
router.post(
  '/register',
  registerRateLimiter,
  validateQuery(emptyObjectSchema),
  validateBody(registerTeacherSchema),
  asyncHandler(register)
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login (docente o super admin)
 *     description: |
 *       Devuelve `accessToken` (JWT 15min) y `refreshToken` (JWT 7d) como cookies HttpOnly +
 *       cuerpo de respuesta. La cookie CSRF se setea automáticamente para los siguientes requests.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login exitoso
 *         headers:
 *           Set-Cookie:
 *             description: accessToken + refreshToken + xsrf-token
 *             schema: { type: string }
 *       401: { description: Credenciales inválidas o cuenta no aprobada }
 *       429: { $ref: '#/components/responses/RateLimitError' }
 */
router.post(
  '/login',
  validateQuery(emptyObjectSchema),
  validateBody(loginSchema),
  asyncHandler(login)
);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Perfil del usuario autenticado
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200: { description: Perfil del usuario }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */
router.get('/me', authenticate, validateQuery(emptyObjectSchema), asyncHandler(getProfile));

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
  asyncHandler(updateProfile)
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
  asyncHandler(changePassword)
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refrescar access token con cookie refreshToken (implementa token rotation)
 * @access  Public (pero requiere cookie refresh token válida)
 * @validation body: refreshTokenSchema (vacío) | query: emptyObjectSchema
 */
router.post(
  '/refresh',
  validateQuery(emptyObjectSchema),
  validateBody(refreshTokenSchema),
  asyncHandler(refreshAccessToken)
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
  asyncHandler(logout)
);

module.exports = router;
