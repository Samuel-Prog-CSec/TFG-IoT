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
  transferStudent
} = require('../controllers/userController');

const { authenticate, requireRole } = require('../middlewares/auth');
const { createResourceRateLimiter } = require('../config/security');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const {
  createStudentSchema,
  updateUserSchema,
  userQuerySchema,
  transferStudentSchema,
  userIdParamsSchema,
  teacherIdParamsSchema,
  teacherStudentsQuerySchema
} = require('../validators/userValidator');
const { emptyObjectSchema } = require('../validators/commonValidator');

/**
 * @route   GET /api/users
 * @desc    Obtener lista de usuarios con filtros
 * @access  Private (Teacher)
 * @validation query: userQuerySchema
 */
router.get('/', authenticate, requireRole('teacher'), validateQuery(userQuerySchema), getUsers);

/**
 * @route   GET /api/users/teacher/:teacherId/students
 * @desc    Obtener alumnos de un profesor específico
 * @access  Private (Teacher)
 * @validation params: teacherIdParamsSchema | query: teacherStudentsQuerySchema
 */
router.get(
  '/teacher/:teacherId/students',
  authenticate,
  requireRole('teacher'),
  validateParams(teacherIdParamsSchema),
  validateQuery(teacherStudentsQuerySchema),
  getStudentsByTeacher
);

/**
 * @route   GET /api/users/:id
 * @desc    Obtener usuario por ID
 * @access  Private
 * @validation params: userIdParamsSchema | query: emptyObjectSchema
 */
router.get(
  '/:id',
  authenticate,
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  getUserById
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
  getUserStats
);

/**
 * @route   POST /api/users
 * @desc    Crear nuevo ALUMNO (profesor autenticado crea alumnos sin credenciales)
 * @access  Private (Teacher)
 * Este endpoint solo crea alumnos (role='student', sin email/password)
 * @validation body: createStudentSchema | query: emptyObjectSchema
 */
router.post(
  '/',
  createResourceRateLimiter, // Rate limiting para prevenir spam
  authenticate,
  requireRole('teacher'),
  validateQuery(emptyObjectSchema),
  validateBody(createStudentSchema),
  createUser
);

/**
 * @route   PUT /api/users/:id
 * @desc    Actualizar usuario
 * @access  Private
 * @validation params: userIdParamsSchema | body: updateUserSchema | query: emptyObjectSchema
 */
router.put(
  '/:id',
  authenticate,
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(updateUserSchema),
  updateUser
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Eliminar usuario (soft delete)
 * @access  Private (Teacher)
 * @validation params: userIdParamsSchema | query: emptyObjectSchema
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  deleteUser
);

/**
 * @route   POST /api/users/:id/transfer
 * @desc    Transferir alumno a otro profesor
 * @access  Private (Teacher)
 * @validation params: userIdParamsSchema | body: transferStudentSchema | query: emptyObjectSchema
 */
router.post(
  '/:id/transfer',
  authenticate,
  requireRole('teacher'),
  validateParams(userIdParamsSchema),
  validateQuery(emptyObjectSchema),
  validateBody(transferStudentSchema),
  transferStudent
);

module.exports = router;
