/**
 * @fileoverview Servicio de lógica de negocio para User.
 * Maneja validaciones y cálculos relacionados con usuarios (teachers y students).
 * Principio Single Responsibility: Lógica exclusiva de gestión de usuarios.
 * @module services/userService
 */

const User = require('../models/User');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger').child({ component: 'userService' });

/**
 * Valida que un email no esté duplicado al crear o actualizar usuarios.
 *
 * @param {string} email - Email a validar
 * @param {string} [excludeUserId] - ID del usuario a excluir de la búsqueda (para updates)
 * @returns {Promise<void>}
 * @throws {ConflictError} Si el email ya existe
 */
async function validateEmailUniqueness(email, excludeUserId = null) {
  const query = { email };

  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }

  const existingUser = await User.findOne(query);

  if (existingUser) {
    throw new ConflictError('El email ya está en uso');
  }
}

/**
 * Valida que un nombre no esté duplicado para estudiantes del mismo profesor.
 * Esto previene confusión cuando el profesor asigna partidas.
 *
 * @param {string} name - Nombre del estudiante
 * @param {string} teacherId - ID del profesor
 * @param {string} [excludeUserId] - ID del usuario a excluir (para updates)
 * @returns {Promise<void>}
 * @throws {ConflictError} Si el nombre ya existe para ese profesor
 */
async function validateStudentNameUniqueness(name, teacherId, excludeUserId = null) {
  const query = {
    role: 'student',
    name,
    createdBy: teacherId
  };

  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }

  const existingStudent = await User.findOne(query);

  if (existingStudent) {
    throw new ConflictError(`Ya tienes un alumno llamado "${name}"`);
  }
}

/**
 * Valida que el createdBy exista y sea un profesor.
 *
 * @param {string} teacherId - ID del profesor
 * @returns {Promise<Object>} Profesor validado
 * @throws {NotFoundError} Si el profesor no existe
 * @throws {ValidationError} Si el usuario no es profesor
 */
async function validateTeacher(teacherId) {
  const teacher = await User.findById(teacherId);

  if (!teacher) {
    throw new NotFoundError('Profesor');
  }

  if (teacher.role !== 'teacher') {
    throw new ValidationError('El usuario especificado no es un profesor');
  }

  return teacher;
}

/**
 * Crea un nuevo estudiante con validaciones.
 * Los estudiantes no tienen credenciales (sin email/password).
 *
 * @param {Object} studentData - Datos del estudiante
 * @param {string} studentData.name - Nombre del estudiante
 * @param {Object} studentData.profile - Perfil del estudiante (age, classroom, birthdate)
 * @param {string} studentData.createdBy - ID del profesor creador
 * @returns {Promise<Object>} Estudiante creado
 * @throws {ValidationError} Si falta edad o el estudiante está fuera del rango 4-6 años
 */
async function createStudent(studentData) {
  const { name, profile, createdBy } = studentData;

  // Validar que el profesor existe
  await validateTeacher(createdBy);

  // Validar que el nombre no esté duplicado para este profesor
  await validateStudentNameUniqueness(name, createdBy);

  // Validar edad obligatoria para estudiantes
  if (!profile?.age) {
    throw new ValidationError('La edad es obligatoria para estudiantes');
  }

  if (profile.age < 3 || profile.age > 99) {
    throw new ValidationError('La edad debe estar entre 3 y 99 años');
  }

  // Crear estudiante (sin email ni password)
  const student = await User.create({
    name,
    role: 'student',
    profile,
    status: 'active',
    createdBy
  });

  logger.info('Estudiante creado via service', {
    studentId: student._id,
    name: student.name,
    age: profile.age,
    createdBy
  });

  return student;
}

/**
 * Actualiza un usuario existente con validaciones.
 *
 * @param {string} userId - ID del usuario a actualizar
 * @param {Object} updates - Campos a actualizar
 * @param {string} [updates.name] - Nuevo nombre
 * @param {string} [updates.email] - Nuevo email (solo profesores)
 * @param {Object} [updates.profile] - Nuevos datos de perfil
 * @param {string} [updates.status] - Nuevo estado
 * @param {string} requestingUserId - ID del usuario que solicita la actualización
 * @returns {Promise<Object>} Usuario actualizado
 * @throws {NotFoundError} Si el usuario no existe
 * @throws {ValidationError} Si intenta modificar el role o actualizar datos inválidos
 */
async function updateUser(userId, updates, requestingUserId) {
  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError('Usuario');
  }

  // Validar que no se intente cambiar el role
  if (updates.role && updates.role !== user.role) {
    throw new ValidationError('No se puede cambiar el rol de un usuario');
  }

  // Si actualiza email, validar unicidad
  if (updates.email && updates.email !== user.email) {
    if (user.role !== 'teacher') {
      throw new ValidationError('Los estudiantes no pueden tener email');
    }
    await validateEmailUniqueness(updates.email, userId);
  }

  // Si actualiza nombre de estudiante, validar unicidad con el mismo profesor
  if (updates.name && updates.name !== user.name && user.role === 'student') {
    await validateStudentNameUniqueness(updates.name, user.createdBy, userId);
  }

  // Actualizar campos
  if (updates.name) {
    user.name = updates.name;
  }
  if (updates.email) {
    user.email = updates.email;
  }
  if (updates.status) {
    user.status = updates.status;
  }

  if (updates.profile) {
    user.profile = { ...user.profile.toObject(), ...updates.profile };
  }

  await user.save();

  logger.info('Usuario actualizado via service', {
    userId: user._id,
    role: user.role,
    updatedBy: requestingUserId
  });

  return user;
}

/**
 * Calcula estadísticas comparativas de un estudiante vs la media de su clase.
 *
 * @param {string} studentId - ID del estudiante
 * @returns {Promise<Object>} Estadísticas del estudiante y comparación con media
 * @throws {NotFoundError} Si el estudiante no existe
 */
async function getStudentComparativeStats(studentId) {
  const student = await User.findById(studentId);

  if (!student) {
    throw new NotFoundError('Estudiante');
  }

  if (student.role !== 'student') {
    throw new ValidationError('Este endpoint es solo para estudiantes');
  }

  // Obtener media de la clase (alumnos del mismo profesor)
  const classStats = await User.aggregate([
    {
      $match: {
        role: 'student',
        createdBy: student.createdBy,
        _id: { $ne: student._id } // Excluir al estudiante actual
      }
    },
    {
      $group: {
        _id: null,
        avgScore: { $avg: '$studentMetrics.averageScore' },
        avgGamesPlayed: { $avg: '$studentMetrics.totalGamesPlayed' },
        avgResponseTime: { $avg: '$studentMetrics.averageResponseTime' },
        avgCorrectAnswers: { $avg: '$studentMetrics.totalCorrectAnswers' }
      }
    }
  ]);

  const classAverage = classStats[0] || {
    avgScore: 0,
    avgGamesPlayed: 0,
    avgResponseTime: 0,
    avgCorrectAnswers: 0
  };

  // Calcular comparación porcentual
  const comparison = {
    scoreVsClass:
      classAverage.avgScore > 0
        ? Number.parseFloat(
            (
              ((student.studentMetrics.averageScore - classAverage.avgScore) /
                classAverage.avgScore) *
              100
            ).toFixed(2)
          )
        : 0,
    gamesVsClass:
      classAverage.avgGamesPlayed > 0
        ? Number.parseFloat(
            (
              ((student.studentMetrics.totalGamesPlayed - classAverage.avgGamesPlayed) /
                classAverage.avgGamesPlayed) *
              100
            ).toFixed(2)
          )
        : 0,
    responseTimeVsClass:
      classAverage.avgResponseTime > 0
        ? Number.parseFloat(
            (
              ((student.studentMetrics.averageResponseTime - classAverage.avgResponseTime) /
                classAverage.avgResponseTime) *
              100
            ).toFixed(2)
          )
        : 0
  };

  return {
    student: {
      id: student._id,
      name: student.name,
      metrics: student.studentMetrics
    },
    classAverage,
    comparison
  };
}

/**
 * Obtiene la lista de estudiantes de un profesor con métricas resumidas.
 *
 * @param {string} teacherId - ID del profesor
 * @returns {Promise<Array>} Lista de estudiantes con métricas
 */
async function getTeacherStudents(teacherId) {
  const students = await User.find({
    role: 'student',
    createdBy: teacherId,
    status: 'active'
  })
    .select('name profile.age profile.classroom studentMetrics createdAt')
    .sort({ name: 1 });

  logger.info('Estudiantes obtenidos via service', {
    teacherId,
    count: students.length
  });

  return students;
}

/**
 * Valida que un usuario puede ser eliminado.
 * Los profesores no pueden ser eliminados si tienen estudiantes activos.
 *
 * @param {string} userId - ID del usuario a eliminar
 * @returns {Promise<Object>} Usuario validado para eliminación
 * @throws {NotFoundError} Si el usuario no existe
 * @throws {ValidationError} Si el profesor tiene estudiantes activos
 */
async function validateUserDeletion(userId) {
  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError('Usuario');
  }

  // Si es profesor, verificar que no tenga estudiantes activos
  if (user.role === 'teacher') {
    const activeStudents = await User.countDocuments({
      role: 'student',
      createdBy: userId,
      status: 'active'
    });

    if (activeStudents > 0) {
      throw new ValidationError(
        `No se puede eliminar el profesor porque tiene ${activeStudents} estudiante(s) activo(s)`
      );
    }
  }

  return user;
}

module.exports = {
  createStudent,
  updateUser,
  getStudentComparativeStats,
  getTeacherStudents,
  validateUserDeletion,
  validateEmailUniqueness,
  validateStudentNameUniqueness,
  validateTeacher
};
