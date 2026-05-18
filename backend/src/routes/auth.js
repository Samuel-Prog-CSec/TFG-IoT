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

const { authenticate, logout, requireRole } = require('../middlewares/auth');
const {
  registerRateLimiter,
  authRateLimiter,
  authLooseRateLimiter
} = require('../config/security');
const { requireCaptchaIfFlagged } = require('../middlewares/turnstileGuard');
const { requireMfa } = require('../middlewares/requireMfa');
const {
  setupInit,
  setupVerify,
  challenge: mfaChallenge,
  verifyBackupCode,
  regenerateBackupCodes,
  disable: mfaDisable,
  status: mfaStatus
} = require('../controllers/mfaController');
const {
  setupVerifySchema,
  challengeSchema,
  verifyBackupCodeSchema,
  disableSchema
} = require('../validators/mfaValidator');
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
  authRateLimiter, // T-905 B4: strict 5/15min en prod, ataque brute-force
  validateQuery(emptyObjectSchema),
  validateBody(loginSchema),
  asyncHandler(requireCaptchaIfFlagged), // T-905 B6: CAPTCHA tras 3 fallos (opt-in env)
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
router.get(
  '/me',
  authLooseRateLimiter, // T-905 B4: loose 20/15min — frecuente durante sesión activa
  authenticate,
  validateQuery(emptyObjectSchema),
  asyncHandler(getProfile)
);

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
  authLooseRateLimiter, // T-905 B4: loose 20/15min — refresh ~cada 5min sesión activa
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

// ============================================================================
// MFA TOTP (T-905 B7) — super_admin
// ============================================================================

router.get(
  '/mfa/status',
  authenticate,
  requireRole('super_admin'),
  validateQuery(emptyObjectSchema),
  asyncHandler(mfaStatus)
);

router.post(
  '/mfa/setup-init',
  authLooseRateLimiter,
  authenticate,
  requireRole('super_admin'),
  validateQuery(emptyObjectSchema),
  validateBody(emptyObjectSchema),
  asyncHandler(setupInit)
);

router.post(
  '/mfa/setup-verify',
  authLooseRateLimiter,
  authenticate,
  requireRole('super_admin'),
  validateQuery(emptyObjectSchema),
  validateBody(setupVerifySchema),
  asyncHandler(setupVerify)
);

router.post(
  '/mfa/challenge',
  authRateLimiter, // strict: este endpoint es el único gate antes de mfaToken
  authenticate,
  requireRole('super_admin'),
  validateQuery(emptyObjectSchema),
  validateBody(challengeSchema),
  asyncHandler(mfaChallenge)
);

router.post(
  '/mfa/verify-backup-code',
  authRateLimiter,
  authenticate,
  requireRole('super_admin'),
  validateQuery(emptyObjectSchema),
  validateBody(verifyBackupCodeSchema),
  asyncHandler(verifyBackupCode)
);

router.post(
  '/mfa/backup-codes/regenerate',
  authLooseRateLimiter,
  authenticate,
  requireRole('super_admin'),
  requireMfa,
  validateQuery(emptyObjectSchema),
  validateBody(emptyObjectSchema),
  asyncHandler(regenerateBackupCodes)
);

router.delete(
  '/mfa',
  authRateLimiter,
  authenticate,
  requireRole('super_admin'),
  requireMfa,
  validateQuery(emptyObjectSchema),
  validateBody(disableSchema),
  asyncHandler(mfaDisable)
);

module.exports = router;
