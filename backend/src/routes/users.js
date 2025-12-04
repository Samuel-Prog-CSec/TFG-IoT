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
  getStudentsByTeacher
} = require('../controllers/userController');

const { authenticate, requireRole } = require('../middlewares/auth');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validation');
const { createResourceRateLimiter } = require('../config/security');
const {
  createStudentSchema,
  updateUserSchema,
  userQuerySchema
} = require('../validators/userValidator');
const { z } = require('zod');

const paramsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido')
});

/**
 * @route   GET /api/users
 * @desc    Obtener lista de usuarios con filtros
 * @access  Private (Teacher)
 */
router.get('/', authenticate, requireRole('teacher'), validateQuery(userQuerySchema), getUsers);

/**
 * @route   GET /api/users/teacher/:teacherId/students
 * @desc    Obtener alumnos de un profesor específico
 * @access  Private (Teacher)
 */
router.get(
  '/teacher/:teacherId/students',
  authenticate,
  requireRole('teacher'),
  validateParams(paramsSchema.extend({ teacherId: paramsSchema.shape.id })),
  getStudentsByTeacher
);

/**
 * @route   GET /api/users/:id
 * @desc    Obtener usuario por ID
 * @access  Private
 */
router.get('/:id', authenticate, validateParams(paramsSchema), getUserById);

/**
 * @route   GET /api/users/:id/stats
 * @desc    Obtener estadísticas de un alumno
 * @access  Private
 */
router.get('/:id/stats', authenticate, validateParams(paramsSchema), getUserStats);

/**
 * @route   POST /api/users
 * @desc    Crear nuevo ALUMNO (profesor autenticado crea alumnos sin credenciales)
 * @access  Private (Teacher)
 * Este endpoint solo crea alumnos (role='student', sin email/password)
 */
router.post(
  '/',
  createResourceRateLimiter, // Rate limiting para prevenir spam
  authenticate,
  requireRole('teacher'),
  validateBody(createStudentSchema),
  createUser
);

/**
 * @route   PUT /api/users/:id
 * @desc    Actualizar usuario
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  validateParams(paramsSchema),
  validateBody(updateUserSchema),
  updateUser
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Eliminar usuario (soft delete)
 * @access  Private (Teacher)
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('teacher'),
  validateParams(paramsSchema),
  deleteUser
);

module.exports = router;
