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

/**
 * @route   GET /api/users
 * @desc    Obtener lista de usuarios con filtros
 * @access  Private (Teacher)
 */
router.get('/', authenticate, requireRole('teacher'), getUsers);

/**
 * @route   GET /api/users/teacher/:teacherId/students
 * @desc    Obtener alumnos de un profesor específico
 * @access  Private (Teacher)
 */
router.get(
  '/teacher/:teacherId/students',
  authenticate,
  requireRole('teacher'),
  getStudentsByTeacher
);

/**
 * @route   GET /api/users/:id
 * @desc    Obtener usuario por ID
 * @access  Private
 */
router.get('/:id', authenticate, getUserById);

/**
 * @route   GET /api/users/:id/stats
 * @desc    Obtener estadísticas de un alumno
 * @access  Private
 */
router.get('/:id/stats', authenticate, getUserStats);

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
  createUser
);

/**
 * @route   PUT /api/users/:id
 * @desc    Actualizar usuario
 * @access  Private
 */
router.put('/:id', authenticate, updateUser);

/**
 * @route   DELETE /api/users/:id
 * @desc    Eliminar usuario (soft delete)
 * @access  Private (Teacher)
 */
router.delete('/:id', authenticate, requireRole('teacher'), deleteUser);

/**
 * @route   POST /api/users/:id/transfer
 * @desc    Transferir alumno a otro profesor
 * @access  Private (Teacher)
 */
router.post('/:id/transfer', authenticate, requireRole('teacher'), transferStudent);

module.exports = router;
