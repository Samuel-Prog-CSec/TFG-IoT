/**
 * @fileoverview Rutas de gestión de usuarios.
 * Endpoints CRUD para profesores y alumnos.
 * @module routes/users
 */

const express = require('express');
const router = express.Router();

const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserStats,
  getStudentsByTeacher,
  transferStudent,
  updateConsent,
  hardDeleteUser,
  exportStudentData,
  updateMyOnboarding
} = require('../controllers/userController');

const { authenticate, requireRole } = require('../middlewares/auth');
const { createResourceRateLimiter, exportDataRateLimiter } = require('../config/security');
const { requireMfa } = require('../middlewares/requireMfa');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const {
  createStudentSchema,
  updateUserSchema,
  userQuerySchema,
  transferStudentSchema,
  userIdParamsSchema,
  teacherIdParamsSchema,
  teacherStudentsQuerySchema,
  updateConsentSchema,
  hardDeleteSchema,
  updateOnboardingSchema
} = require('../validators/userValidator');
const { emptyObjectSchema } = require('../validators/commonValidator');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @route   GET /api/users
 * @desc    Obtener lista de usuarios con filtros
 * @access  Private (Teacher)
 * @validation query: userQuerySchema
 */

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Listar usuarios con filtros
 *     description: Devuelve la lista paginada. Los profesores solo ven sus alumnos.
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [teacher, student, super_admin] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, active, rejected, inactive] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100 }
 *     responses:
 *       200:
 *         description: Lista de usuarios
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/User' } }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 */
router.get(
  '/',
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateQuery(userQuerySchema),
  asyncHandler(getUsers)
);

/**
 * @route   PATCH /api/users/me/onboarding
 * @desc    Actualizar el progreso del onboarding interactivo del usuario autenticado
 * @access  Private (cualquier rol autenticado — el id sale de req.user)
 * @validation body: updateOnboardingSchema | query: emptyObjectSchema
 * @reference T-951 PROP-13 — onboarding interactivo multi-track
 */

/**
 * @openapi
 * /users/me/onboarding:
 *   patch:
 *     tags: [Users]
 *     summary: Actualizar progreso del onboarding del usuario autenticado
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               track: { type: string, enum: [teacher, super_admin] }
 *               currentStep: { type: integer, minimum: 0 }
 *               completed: { type: boolean }
 *     responses:
 *       200: { description: Progreso actualizado }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */
router.patch(
  '/me/onboarding',
  authenticate,
  validateQuery(emptyObjectSchema),
  validateBody(updateOnboardingSchema),
  asyncHandler(updateMyOnboarding)
);

/**
 * @route   GET /api/users/teacher/:teacherId/students
 * @desc    Obtener alumnos de un profesor específico
 * @access  Private (Teacher)
 * @validation params: teacherIdParamsSchema | query: teacherStudentsQuerySchema
 */
router.get(
  '/teacher/:teacherId/students',
  authenticate,
  requireRole('teacher', 'super_admin'),
  validateParams(teacherIdParamsSchema),
  validateQuery(teacherStudentsQuerySchema),
  asyncHandler(getStudentsByTeacher)
);

/**
 * @route   GET /api/users/:id/export-data
 * @desc    Exportar todos los datos personales de un estudiante (portabilidad)
 * @access  Private (Super Admin — operación RGPD centralizada, ADR-032)
 * @validation params: userIdParamsSchema
 * @normativa Art. 20 RGPD (derecho a la portabilidad de datos)
 */
router.get(
  '/:id/export-data',
  authenticate,
  requireRole('super_admin'),
  exportDataRateLimiter,
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(exportStudentData)
);

/**
 * @route   GET /api/users/:id
 * @desc    Obtener usuario por ID
 * @access  Private
 * @validation params: userIdParamsSchema | query: emptyObjectSchema
 */

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Obtener usuario por ID
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Usuario encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get(
  '/:id',
  authenticate,
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(getUserById)
);

/**
 * @route   GET /api/users/:id/stats
 * @desc    Obtener estadísticas de un alumno
 * @access  Private
 * @validation params: userIdParamsSchema | query: emptyObjectSchema
 */
router.get(
  '/:id/stats',
  authenticate,
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(getUserStats)
);

/**
 * POST /api/users
 * @desc    Crear nuevo ALUMNO (super admin)
 * @access  Private (Super Admin)
 * Este endpoint solo crea alumnos (role='student', sin email/password)
 * @validation body: createStudentSchema | query: emptyObjectSchema
 */

/**
 * @openapi
 * /users:
 *   post:
 *     tags: [Users]
 *     summary: Crear alumno (super_admin)
 *     description: Solo el super_admin puede crear alumnos. Los profesores reciben los alumnos vía transferencia.
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, classroom]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               classroom: { type: string }
 *               assignedTeacher: { type: string, description: 'ID del docente asignado' }
 *     responses:
 *       201:
 *         description: Alumno creado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/User' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       429: { $ref: '#/components/responses/RateLimitError' }
 */
router.post(
  '/',
  authenticate,
  createResourceRateLimiter, // Rate limiting para prevenir spam (keyed por usuario)
  requireRole('super_admin'),
  validateQuery(emptyObjectSchema),
  validateBody(createStudentSchema),
  asyncHandler(createUser)
);

/**
 * @route   PUT /api/users/:id
 * @desc    Actualizar usuario
 * @access  Private (Super Admin)
 * @validation params: userIdParamsSchema | body: updateUserSchema | query: emptyObjectSchema
 */
router.put(
  '/:id',
  authenticate,
  requireRole('super_admin'),
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(updateUserSchema),
  asyncHandler(updateUser)
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Eliminar usuario (soft delete)
 * @access  Private (Super Admin)
 * @validation params: userIdParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('super_admin'),
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  asyncHandler(deleteUser)
);

/**
 * @route   POST /api/users/:id/transfer
 * @desc    Transferir alumno a otro profesor
 * @access  Private (Super Admin)
 * @validation params: userIdParamsSchema | body: transferStudentSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/transfer',
  authenticate,
  requireRole('super_admin'),
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(transferStudentSchema),
  asyncHandler(transferStudent)
);

/**
 * @route   PATCH /api/users/:id/consent
 * @desc    Actualizar consentimiento parental de un estudiante
 * @access  Private (Super Admin — operación RGPD centralizada, ADR-032)
 * @validation params: userIdParamsSchema | body: updateConsentSchema
 * @normativa Art. 7.3 RGPD (retirada de consentimiento), Art. 8 RGPD (consentimiento menores)
 */
router.patch(
  '/:id/consent',
  authenticate,
  requireRole('super_admin'),
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(updateConsentSchema),
  asyncHandler(updateConsent)
);

/**
 * @route   DELETE /api/users/:id/data
 * @desc    Borrado efectivo (hard delete) de todos los datos de un estudiante
 * @access  Private (Super Admin — operación RGPD centralizada, ADR-032)
 * @validation params: userIdParamsSchema | body: hardDeleteSchema
 * @normativa Art. 17 RGPD (derecho de supresión), Art. 17.1.f (datos de menores)
 */

/**
 * @openapi
 * /users/{id}/data:
 *   delete:
 *     tags: [Users]
 *     summary: Borrado efectivo de un estudiante (RGPD Art. 17)
 *     description: |
 *       Operación destructiva irreversible reservada al super_admin. Requiere MFA reciente
 *       (T-905 B7) y un motivo justificado. Elimina datos personales, GamePlays y
 *       referencias asociadas. Auditado en el log de seguridad.
 *     security: [{ bearerAuth: [] }, { cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason, confirmation]
 *             properties:
 *               reason: { type: string, description: 'Motivo de la supresión (auditable)' }
 *               confirmation: { type: string, description: 'Texto literal "DELETE" para confirmar' }
 *     responses:
 *       204: { description: Estudiante eliminado por completo }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.delete(
  '/:id/data',
  authenticate,
  requireRole('super_admin'),
  requireMfa, // T-905 B7: hard delete RGPD requiere MFA reciente
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(hardDeleteSchema),
  asyncHandler(hardDeleteUser)
);

module.exports = router;
