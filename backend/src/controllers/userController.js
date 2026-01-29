/**
 * @fileoverview Controller para gestión CRUD de usuarios.
 * Permite a profesores gestionar alumnos y ver estadísticas.
 * @module controllers/userController
 */

const User = require('../models/User');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');
const {
  toUserDTOV1,
  toStudentDTOV1,
  toUserListDTOV1,
  toPaginatedDTOV1,
  toUserStatsDTOV1
} = require('../utils/dtos');
const { escapeRegex } = require('../utils/escapeRegex');
const { revokeAllUserTokens } = require('../middlewares/auth');
const { disconnectUserSockets } = require('../utils/socketUtils');
const { getRequestContext } = require('../utils/securityLogger');

/**
 * Obtener lista de usuarios con paginación y filtros.
 * Solo profesores pueden acceder.
 *
 * GET /api/users?page=1&limit=20&role=student&classroom=A1&sortBy=name&order=asc
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getUsers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc',
      role,
      classroom,
      status,
      search
    } = req.query;

    // Construir filtro
    const filter = {};

    if (role) {
      filter.role = role;
    }
    if (classroom) {
      filter['profile.classroom'] = classroom;
    }
    if (status) {
      filter.status = status;
    }

    // Búsqueda por nombre o email
    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    // Solo profesores ven a todos - los alumnos no deberían llegar aquí
    // pero por seguridad, filtramos por createdBy si no es teacher
    if (req.user.role !== 'teacher') {
      filter._id = req.user._id; // Solo puede ver su propio perfil
    }

    // Paginación
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

    // Ejecutar query
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort(sortOptions)
        .limit(Number.parseInt(limit, 10))
        .skip(skip)
        .select('-password'),
      User.countDocuments(filter)
    ]);

    logger.info('Lista de usuarios obtenida', {
      requestedBy: req.user._id,
      filters: filter,
      resultsCount: users.length
    });

    res.json({
      success: true,
      ...toPaginatedDTOV1(
        toUserListDTOV1(users),
        Number.parseInt(page, 10),
        Number.parseInt(limit, 10),
        total
      )
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener un usuario específico por ID.
 *
 * GET /api/users/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('-password');

    if (!user) {
      throw new NotFoundError('Usuario');
    }

    // Verificar permisos: solo el mismo usuario o un profesor
    if (req.user.role !== 'teacher' && req.user._id.toString() !== id) {
      throw new ForbiddenError('No tienes permiso para ver este usuario');
    }

    const userPayload = user.role === 'student' ? toStudentDTOV1(user) : toUserDTOV1(user);

    res.json({
      success: true,
      data: userPayload
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Crear un nuevo ALUMNO (solo profesores autenticados pueden crear alumnos).
 *
 * POST /api/users
 * Headers: Authorization: Bearer <token>
 * Body: { name, profile? }
 *
 * IMPORTANTE: Este endpoint crea SOLO alumnos (role='student').
 * Los alumnos NO tienen email ni password, son identificados por su _id.
 * El profesor autenticado se asigna automáticamente como createdBy.
 *
 * VALIDACIÓN DE DUPLICADOS:
 * - Se verifica que no exista un alumno activo con el mismo nombre creado por el mismo profesor
 * - Esto previene duplicados accidentales (ej: "Lucas Martínez" creado dos veces)
 * - Si el alumno está inactivo (eliminado), se puede crear uno nuevo con el mismo nombre
 *
 * Para registrar profesores, usar POST /api/auth/register (público).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createUser = async (req, res, next) => {
  try {
    const { name, profile } = req.body;

    // Validar que el usuario autenticado sea profesor
    if (req.user.role !== 'teacher') {
      throw new ForbiddenError('Solo los profesores pueden crear alumnos');
    }

    // ✅ VALIDAR DUPLICADOS: Verificar que no exista un alumno activo con el mismo nombre
    // creado por este profesor en la misma clase (si se especifica)
    const duplicateFilter = {
      name: { $regex: `^${escapeRegex(name.trim())}$`, $options: 'i' }, // Case-insensitive
      role: 'student',
      createdBy: req.user._id,
      status: 'active'
    };

    // Si se especifica classroom, también verificar en esa clase
    if (profile?.classroom) {
      duplicateFilter['profile.classroom'] = profile.classroom;
    }

    const existingStudent = await User.findOne(duplicateFilter);

    if (existingStudent) {
      const errorMsg = profile?.classroom
        ? `Ya existe un alumno activo llamado "${name}" en la clase "${profile.classroom}"`
        : `Ya existe un alumno activo llamado "${name}" creado por ti`;

      logger.warn('Intento de crear alumno duplicado', {
        teacherId: req.user._id,
        studentName: name,
        classroom: profile?.classroom,
        existingStudentId: existingStudent._id
      });

      return res.status(409).json({
        success: false,
        message: errorMsg,
        data: {
          existingStudent: toStudentDTOV1(existingStudent)
        }
      });
    }

    // ✅ Crear alumno SIN email ni password
    const userData = {
      name,
      role: 'student', // ✅ FORZADO - Este endpoint solo crea alumnos
      profile: profile || {},
      createdBy: req.user._id, // ✅ Asignar automáticamente al profesor autenticado
      status: 'active'
      // ⚠️ NO incluimos email ni password para alumnos
    };

    const student = await User.create(userData);

    logger.info('Alumno creado por profesor', {
      studentId: student._id,
      studentName: student.name,
      classroom: student.profile?.classroom,
      createdBy: req.user._id,
      teacherName: req.user.name
    });

    res.status(201).json({
      success: true,
      message: 'Alumno creado exitosamente',
      data: toStudentDTOV1(student)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Actualizar un usuario existente.
 *
 * PUT /api/users/:id
 * Headers: Authorization: Bearer <token>
 * Body: { name?, profile?, status?, createdBy? }
 *
 * IMPORTANTE:
 * - Profesores pueden actualizar cualquier campo de sus alumnos
 * - Alumnos NO pueden actualizar su propio perfil (deben ser menores de edad)
 * - Se puede cambiar el profesor asignado (createdBy) para transferir alumnos
 * - Se valida duplicidad si se cambia el nombre
 *
 * CASOS DE USO:
 * - Cambio de clase: profile.classroom
 * - Cambio de profesor: createdBy (solo profesores)
 * - Corrección de nombre: name (valida duplicados)
 * - Actualización de edad/cumpleaños: profile.age, profile.birthdate
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const buildDuplicateFilter = ({ user, name, profile, createdBy }) => {
  const duplicateFilter = {
    _id: { $ne: user._id },
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: 'i' },
    role: user.role,
    status: 'active'
  };

  if (user.role !== 'student') {
    return duplicateFilter;
  }

  const teacherToCheck = createdBy || user.createdBy;
  duplicateFilter.createdBy = teacherToCheck;

  const classroomToCheck = profile?.classroom || user.profile?.classroom;
  if (classroomToCheck) {
    duplicateFilter['profile.classroom'] = classroomToCheck;
  }

  return duplicateFilter;
};

const ensureNewTeacherExists = async createdBy => {
  if (!createdBy) {
    return null;
  }

  const newTeacher = await User.findOne({
    _id: createdBy,
    role: 'teacher',
    status: 'active'
  });

  if (!newTeacher) {
    const error = new ValidationError('El profesor especificado no existe o no está activo');
    error.statusCode = 400;
    throw error;
  }

  return newTeacher;
};

const validateDuplicateName = async ({ user, name, profile, createdBy, updatedBy }) => {
  if (!name || name.trim() === user.name) {
    return null;
  }

  const duplicateFilter = buildDuplicateFilter({ user, name, profile, createdBy });
  const existingUser = await User.findOne(duplicateFilter);

  if (!existingUser) {
    return null;
  }

  const errorMsg =
    user.role === 'student' && duplicateFilter['profile.classroom']
      ? `Ya existe un alumno activo llamado "${name}" en la clase "${duplicateFilter['profile.classroom']}"`
      : `Ya existe un usuario activo llamado "${name}"`;

  logger.warn('Intento de actualizar con nombre duplicado', {
    userId: user._id,
    newName: name,
    existingUserId: existingUser._id,
    updatedBy
  });

  return {
    message: errorMsg,
    existingUser
  };
};

const buildUserPayload = user =>
  user.role === 'student' ? toStudentDTOV1(user) : toUserDTOV1(user);

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, profile, status, createdBy } = req.body;

    const user = await User.findById(id);

    if (!user) {
      throw new NotFoundError('Usuario');
    }

    // Verificar permisos: solo profesores pueden actualizar alumnos
    // Los alumnos NO pueden actualizar su propio perfil (son menores de edad)
    if (req.user.role !== 'teacher') {
      throw new ForbiddenError('Solo los profesores pueden actualizar alumnos');
    }

    // ✅ VALIDAR DUPLICADOS si se cambia el nombre
    const duplicate = await validateDuplicateName({
      user,
      name,
      profile,
      createdBy,
      updatedBy: req.user._id
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: duplicate.message,
        data: {
          existingUser: toUserDTOV1(duplicate.existingUser)
        }
      });
    }

    if (name && name.trim() !== user.name) {
      user.name = name.trim();
    }

    // Actualizar profile (merge con existente)
    if (profile) {
      user.profile = { ...user.profile.toObject(), ...profile };
    }

    // Solo profesores pueden cambiar status
    if (status) {
      user.status = status;
    }

    // ✅ NUEVO: Permitir cambiar el profesor asignado (createdBy)
    // Caso de uso: Un alumno cambia de profesor
    if (createdBy && user.role === 'student') {
      await ensureNewTeacherExists(createdBy);

      logger.info('Reasignando alumno a nuevo profesor', {
        studentId: user._id,
        studentName: user.name,
        oldTeacherId: user.createdBy,
        newTeacherId: createdBy,
        updatedBy: req.user._id
      });

      user.createdBy = createdBy;
    }

    await user.save();

    if (status === 'inactive' && ['teacher', 'super_admin'].includes(user.role)) {
      await revokeAllUserTokens(user._id.toString(), 'account_inactivated', {
        ...getRequestContext(req),
        userId: user._id,
        updatedBy: req.user._id
      });
      const io = req.app.get('io');
      disconnectUserSockets(io, user._id.toString(), 'ACCOUNT_INACTIVATED');
    }

    logger.info('Usuario actualizado', {
      userId: user._id,
      updatedBy: req.user._id,
      changes: {
        name: name ? 'updated' : 'unchanged',
        profile: profile ? 'updated' : 'unchanged',
        status: status ? 'updated' : 'unchanged',
        createdBy: createdBy ? 'updated' : 'unchanged'
      }
    });

    const userPayload = buildUserPayload(user);

    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: userPayload
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Eliminar un usuario (soft delete cambiando status a 'inactive').
 *
 * DELETE /api/users/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      throw new NotFoundError('Usuario');
    }

    // Solo profesores pueden eliminar usuarios
    if (req.user.role !== 'teacher') {
      throw new ForbiddenError('No tienes permiso para eliminar usuarios');
    }

    // Soft delete
    user.status = 'inactive';
    await user.save();

    if (['teacher', 'super_admin'].includes(user.role)) {
      await revokeAllUserTokens(user._id.toString(), 'account_deleted', {
        ...getRequestContext(req),
        userId: user._id,
        deletedBy: req.user._id
      });
      const io = req.app.get('io');
      disconnectUserSockets(io, user._id.toString(), 'ACCOUNT_INACTIVATED');
    }

    logger.info('Usuario eliminado (soft delete)', {
      userId: user._id,
      deletedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener estadísticas de un alumno.
 *
 * GET /api/users/:id/stats
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getUserStats = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('name role studentMetrics profile');

    if (!user) {
      throw new NotFoundError('Usuario');
    }

    // Verificar permisos
    if (req.user.role !== 'teacher' && req.user._id.toString() !== id) {
      throw new ForbiddenError('No tienes permiso para ver estas estadísticas');
    }

    const accuracyRate =
      user.studentMetrics && user.studentMetrics.totalGamesPlayed > 0
        ? (
            (user.studentMetrics.totalCorrectAnswers /
              (user.studentMetrics.totalCorrectAnswers + user.studentMetrics.totalErrors)) *
            100
          ).toFixed(2)
        : 0;

    res.json({
      success: true,
      data: toUserStatsDTOV1(
        user,
        user.studentMetrics?.toObject?.() || user.studentMetrics,
        Number.parseFloat(accuracyRate)
      )
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener alumnos de un profesor específico.
 *
 * GET /api/users/teacher/:teacherId/students
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getStudentsByTeacher = async (req, res, next) => {
  try {
    const { teacherId } = req.params;
    const { classroom, sortBy = 'name', order = 'asc' } = req.query;

    // Verificar permisos: solo el profesor o un admin
    // Verificar permisos: solo el profesor o un super admin
    if (req.user._id.toString() !== teacherId && req.user.role !== 'super_admin') {
      throw new ForbiddenError('No tienes permiso para ver estos alumnos');
    }

    // Filtro
    const filter = {
      role: 'student',
      createdBy: teacherId,
      status: 'active'
    };

    if (classroom) {
      filter['profile.classroom'] = classroom;
    }

    const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

    const students = await User.find(filter).sort(sortOptions).select('-password');

    res.json({
      success: true,
      data: toUserListDTOV1(students),
      meta: {
        count: students.length
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Transferir un alumno a otro profesor.
 *
 * POST /api/users/:id/transfer
 * Headers: Authorization: Bearer <token>
 * Body: { newTeacherId, newClassroom }
 *
 * REGLAS DE SEGURIDAD (PUSH MODEL):
 * - Solo el profesor actual (createdBy) o un super_admin pueden iniciar la transferencia.
 * - Esto previene que otros profesores "reclamen" alumnos que no les pertenecen.
 * - El nuevo profesor debe existir y ser válido.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const transferStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newTeacherId, newClassroom } = req.body;

    if (!newTeacherId || !newClassroom) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere newTeacherId y newClassroom'
      });
    }

    const student = await User.findById(id);

    if (!student) {
      throw new NotFoundError('Alumno');
    }

    if (student.role !== 'student') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden transferir usuarios con rol de alumno'
      });
    }

    // VERIFICACIÓN DE SEGURIDAD: Solo el dueño actual o super admin puede transferir
    const isOwner = student.createdBy.toString() === req.user._id.toString();
    const isSuperAdmin = req.user.role === 'super_admin';

    if (!isOwner && !isSuperAdmin) {
      throw new ForbiddenError('Solo el profesor actual puede transferir a este alumno');
    }

    // Verificar que el nuevo profesor existe y es válido
    const newTeacher = await User.findOne({
      _id: newTeacherId,
      role: 'teacher',
      status: 'active'
    });

    if (!newTeacher) {
      return res.status(400).json({
        success: false,
        message: 'El nuevo profesor no existe o no está activo'
      });
    }

    // Registrar cambios para auditoría (log)
    logger.info('Iniciando transferencia de alumno', {
      studentId: student._id,
      studentName: student.name,
      fromTeacher: student.createdBy,
      toTeacher: newTeacherId,
      initiatedBy: req.user._id
    });

    // Realizar transferencia
    student.createdBy = newTeacherId;
    student.profile.classroom = newClassroom;

    await student.save();

    res.json({
      success: true,
      message: 'Alumno transferido exitosamente',
      data: toStudentDTOV1(student)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserStats,
  getStudentsByTeacher,
  transferStudent
};
