/**
 * @fileoverview Controller para gestión CRUD de usuarios.
 * Permite a profesores gestionar alumnos y ver estadísticas.
 * @module controllers/userController
 */

const userRepository = require('../repositories/userRepository');
const {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError
} = require('../utils/errors');
const { ensureResourceOwnership } = require('../utils/ownershipHelpers');
const logger = require('../utils/logger');
const userService = require('../services/userService');
const { toUserDTOV1, toStudentDTOV1, toUserListDTOV1, toUserStatsDTOV1 } = require('../utils/dtos');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/responseHelper');
const { escapeRegex } = require('../utils/escapeRegex');
const { revokeAllUserTokens, invalidateUserCache } = require('../middlewares/auth');
const { disconnectUserSockets } = require('../utils/socketUtils');
const { getRequestContext, logSecurityEvent } = require('../utils/securityLogger');
const { buildFilter } = require('../utils/filterBuilder');
const { pseudonymize } = require('../utils/pseudonymize');
const dataExportService = require('../services/dataExportService');
const { cacheInvalidateNamespace } = require('../utils/cacheHelper');

/**
 * Mappings para construir filtros de búsqueda de usuarios.
 * Utiliza el filterBuilder genérico para reducir boilerplate.
 * @see utils/filterBuilder.js
 */
const userFilterMappings = {
  role: { field: 'role', type: 'exact' },
  classroom: { field: 'profile.classroom', type: 'exact' },
  status: { field: 'status', type: 'exact' },
  search: { type: 'search', fields: ['name', 'email'] },
  requester: {
    type: 'computed',
    compute: (requester, filter) => {
      if (requester.role === 'teacher') {
        filter.role = 'student';
        filter.createdBy = requester._id;
      }
    }
  }
};

const ensureSuperAdmin = user => {
  if (user.role !== 'super_admin') {
    throw new ForbiddenError('No tienes permiso para actualizar usuarios');
  }
};

const updateMutableUserFields = ({ user, name, profile, status }) => {
  if (name && name.trim() !== user.name) {
    user.name = name.trim();
  }

  if (profile) {
    user.profile = { ...user.profile.toObject(), ...profile };
  }

  if (status) {
    user.status = status;
  }
};

const shouldDisconnectByStatus = ({ status, role }) =>
  status === 'inactive' && ['teacher', 'super_admin'].includes(role);

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
const getUsers = async (req, res) => {
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

  const filter = buildFilter(
    { role, classroom, status, search, requester: req.user },
    userFilterMappings
  );

  // Paginación
  const skip = (page - 1) * limit;
  const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

  // Ejecutar query.
  // Para alumnos, poblamos createdBy (profesor) con su nombre/email para que la UI
  // de admin pueda mostrar a quien pertenece cada alumno (evita el placeholder "Sistema").
  const findOptions = {
    sort: sortOptions,
    limit: Number.parseInt(limit, 10),
    skip,
    select: '-password'
  };
  if (role === 'student') {
    findOptions.populate = { path: 'createdBy', select: 'name email' };
  }

  const [users, total] = await Promise.all([
    userRepository.find(filter, findOptions),
    userRepository.count(filter)
  ]);

  logger.info('Lista de usuarios obtenida', {
    requestedBy: req.user._id,
    filters: filter,
    resultsCount: users.length
  });

  sendPaginated(res, toUserListDTOV1(users), {
    page: Number.parseInt(page, 10),
    limit: Number.parseInt(limit, 10),
    total
  });
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
const getUserById = async (req, res) => {
  const { id } = req.params;

  const user = await userRepository.findById(id, { select: '-password' });

  if (!user) {
    throw new NotFoundError('Usuario');
  }

  const isSuperAdmin = req.user.role === 'super_admin';
  if (user.role === 'student') {
    const ownsStudent = user.createdBy?.toString() === req.user._id.toString();
    if (!isSuperAdmin && !ownsStudent) {
      throw new ForbiddenError('No tienes permiso para ver este alumno');
    }
  } else if (!isSuperAdmin && req.user._id.toString() !== id) {
    throw new ForbiddenError('No tienes permiso para ver este usuario');
  }

  const userPayload = user.role === 'student' ? toStudentDTOV1(user) : toUserDTOV1(user);

  sendSuccess(res, userPayload);
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
const createUser = async (req, res) => {
  // Enriquece ConflictError con datos del estudiante existente para UX
  try {
    const { name, profile } = req.body;

    // Validar que el usuario autenticado sea super admin (el validador de rutas ya lo hace pero por seguridad)
    if (req.user.role !== 'super_admin') {
      throw new ForbiddenError('Solo los administradores pueden crear alumnos');
    }

    // Como lo crea un super_admin, requiere un `teacherId` explícito en el body
    // (Aseguraremos esto en el validation schema más adelante)
    const { teacherId } = req.body;
    if (!teacherId) {
      throw new ForbiddenError('Se debe especificar a qué profesor pertenece el alumno');
    }

    const { consent } = req.body;
    const student = await userService.createStudent({
      name,
      profile: profile || {},
      createdBy: teacherId,
      consent
    });

    logger.info('Alumno creado por super admin', {
      studentPseudoId: pseudonymize(student._id),
      createdBy: req.user._id
    });

    sendCreated(res, toStudentDTOV1(student), 'Alumno creado exitosamente');
  } catch (error) {
    if (error instanceof ConflictError) {
      const existingStudent = await userService.findDuplicateStudent({
        name: req.body.name,
        classroom: req.body.profile?.classroom,
        teacherId: req.body.teacherId
      });

      if (existingStudent) {
        logger.warn('Intento de crear alumno duplicado por admin', {
          adminId: req.user._id,
          existingStudentPseudoId: pseudonymize(existingStudent._id),
          teacherId: req.body.teacherId
        });

        throw new ConflictError(error.message, {
          existingStudent: toStudentDTOV1(existingStudent)
        });
      }
    }

    throw error;
  }
};

/**
 * Actualizar un usuario existente.
 *
 * PUT /api/users/:id
 * Headers: Authorization: Bearer <token>
 * Body: { name?, profile?, status? }
 *
 * IMPORTANTE:
 * - Profesores pueden actualizar cualquier campo de sus alumnos
 * - Alumnos NO pueden actualizar su propio perfil (deben ser menores de edad)
 * - Transferencia de ownership (createdBy) NO permitida en esta ruta
 * - Transferencias solo por POST /api/users/:id/transfer
 * - Se valida duplicidad si se cambia el nombre
 *
 * CASOS DE USO:
 * - Cambio de clase: profile.classroom
 * - Corrección de nombre: name (valida duplicados)
 * - Actualización de edad: profile.age
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

const validateDuplicateName = async ({ user, name, profile, createdBy, updatedBy }) => {
  if (!name || name.trim() === user.name) {
    return null;
  }

  const duplicateFilter = buildDuplicateFilter({ user, name, profile, createdBy });
  const existingUser = await userRepository.findOne(duplicateFilter);

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

const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, profile, status } = req.body;

  const user = await userRepository.findById(id);

  if (!user) {
    throw new NotFoundError('Usuario');
  }

  ensureSuperAdmin(req.user);

  // ✅ VALIDAR DUPLICADOS si se cambia el nombre
  const duplicate = await validateDuplicateName({
    user,
    name,
    profile,
    createdBy: user.createdBy,
    updatedBy: req.user._id
  });

  if (duplicate) {
    throw new ConflictError(duplicate.message, {
      existingUser: toUserDTOV1(duplicate.existingUser)
    });
  }

  // Capturar valores PII originales para audit trail de rectificación (Art. 16 RGPD)
  const originalPII =
    user.role === 'student'
      ? { name: user.name, age: user.profile?.age, classroom: user.profile?.classroom }
      : null;

  updateMutableUserFields({ user, name, profile, status });

  // Registrar rectificación de datos de menores si cambiaron campos PII
  if (originalPII) {
    const rectifiedFields = [];
    if (name && name.trim() !== originalPII.name) {
      rectifiedFields.push('name');
    }
    if (profile?.age !== undefined && profile.age !== originalPII.age) {
      rectifiedFields.push('profile.age');
    }
    if (profile?.classroom !== undefined && profile.classroom !== originalPII.classroom) {
      rectifiedFields.push('profile.classroom');
    }

    if (rectifiedFields.length > 0) {
      logSecurityEvent('DATA_RECTIFICATION', {
        ...getRequestContext(req),
        studentPseudoId: pseudonymize(user._id),
        rectifiedFields,
        rectifiedBy: req.user._id
      });
    }
  }

  await user.save();

  // Invalidar cache de slim-user: cambios en status/name/profile afectan a la
  // entrada cacheada que consume el middleware authenticate.
  await invalidateUserCache(user._id);

  if (shouldDisconnectByStatus({ status, role: user.role })) {
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
      status: status ? 'updated' : 'unchanged'
    }
  });

  const userPayload = buildUserPayload(user);

  sendSuccess(res, userPayload, 'Usuario actualizado exitosamente');
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
const deleteUser = async (req, res) => {
  const { id } = req.params;

  const user = await userRepository.findById(id);

  if (!user) {
    throw new NotFoundError('Usuario');
  }

  const isSuperAdmin = req.user.role === 'super_admin';
  if (!isSuperAdmin) {
    throw new ForbiddenError('No tienes permiso para eliminar usuarios');
  }

  // Soft delete
  user.status = 'inactive';
  await user.save();

  // Invalidar cache: status cambió de activo a inactivo.
  await invalidateUserCache(user._id);

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

  sendSuccess(res, null, 'Usuario eliminado exitosamente');
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
const getUserStats = async (req, res) => {
  const { id } = req.params;

  const user = await userRepository.findById(id, {
    select: 'name role studentMetrics profile createdBy'
  });

  if (!user) {
    throw new NotFoundError('Usuario');
  }

  const isSuperAdmin = req.user.role === 'super_admin';
  if (req.user.role === 'teacher' && user.role === 'student') {
    ensureResourceOwnership(user, req.user._id, 'alumno');
  } else if (!isSuperAdmin && req.user._id.toString() !== id) {
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

  sendSuccess(
    res,
    toUserStatsDTOV1(
      user,
      user.studentMetrics?.toObject?.() || user.studentMetrics,
      Number.parseFloat(accuracyRate)
    )
  );
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
const getStudentsByTeacher = async (req, res) => {
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

  const students = await userRepository.find(filter, {
    sort: sortOptions,
    select: '-password'
  });

  sendSuccess(res, toUserListDTOV1(students));
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
const transferStudent = async (req, res) => {
  const { id } = req.params;
  const { newTeacherId, newClassroom, reason } = req.body;

  if (!newTeacherId || !newClassroom) {
    throw new ValidationError('Se requiere newTeacherId y newClassroom');
  }

  const student = await userRepository.findById(id);

  if (!student) {
    throw new NotFoundError('Alumno');
  }

  if (student.role !== 'student') {
    throw new ValidationError('Solo se pueden transferir usuarios con rol de alumno');
  }

  // VERIFICACIÓN DE SEGURIDAD: Solo el super admin puede transferir
  const isSuperAdmin = req.user.role === 'super_admin';

  if (!isSuperAdmin) {
    throw new ForbiddenError('Solo los administradores pueden transferir alumnos');
  }

  // Verificar que el nuevo profesor existe y es válido
  const newTeacher = await userRepository.findOne({
    _id: newTeacherId,
    role: 'teacher',
    status: 'active'
  });

  if (!newTeacher) {
    throw new NotFoundError('Profesor destino');
  }

  const fromTeacherId = student.createdBy;

  // Registrar cambios para auditoría (log) — seudonimizado (Art. 25 RGPD)
  logger.info('Iniciando transferencia de alumno', {
    studentPseudoId: pseudonymize(student._id),
    fromTeacher: fromTeacherId,
    toTeacher: newTeacherId,
    initiatedBy: req.user._id,
    reason
  });

  // Realizar transferencia
  student.createdBy = newTeacherId;
  student.profile.classroom = newClassroom;

  await student.save();

  logSecurityEvent('STUDENT_TRANSFER', {
    ...getRequestContext(req),
    studentPseudoId: pseudonymize(student._id),
    fromTeacher: fromTeacherId,
    toTeacher: newTeacherId,
    initiatedBy: req.user._id,
    newClassroom,
    reason
  });

  sendSuccess(res, toStudentDTOV1(student), 'Alumno transferido exitosamente');
};

/**
 * Actualizar consentimiento parental de un estudiante.
 * Art. 7.3 RGPD: la retirada del consentimiento debe ser tan fácil como su otorgamiento.
 *
 * PATCH /api/users/:id/consent
 */
const updateConsent = async (req, res) => {
  const { id } = req.params;
  const consentData = {
    ...req.body,
    // Metadata de canal — Art. 7.1 RGPD (demostrar consentimiento)
    channel: 'web_form',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  };

  const updatedUser = await userService.updateConsent(id, consentData, req.user);

  // Si se revocó, revocar tokens Redis y desconectar WebSocket — Art. 7.3 RGPD
  if (!consentData.granted) {
    await revokeAllUserTokens(id, 'consent_withdrawn', getRequestContext(req));
    const io = req.app.get('io');
    if (io) {
      disconnectUserSockets(io, id, 'CONSENT_WITHDRAWN');
    }
  }

  logSecurityEvent('DATA_CONSENT_CHANGE', {
    ...getRequestContext(req),
    studentId: id,
    action: consentData.granted ? 'granted' : 'withdrawn',
    changedBy: req.user._id
  });

  // Invalidar cache de analytics para reflejar cambio de consent inmediatamente
  await cacheInvalidateNamespace('cache:analytics');

  sendSuccess(
    res,
    toStudentDTOV1(updatedUser),
    consentData.granted
      ? 'Consentimiento parental otorgado'
      : 'Consentimiento parental revocado — estudiante desactivado'
  );
};

/**
 * Borrado efectivo (hard delete) de todos los datos de un estudiante.
 * Art. 17 RGPD: derecho de supresión, especialmente Art. 17.1.f (datos de menores).
 *
 * DELETE /api/users/:id/data
 */
const hardDeleteUser = async (req, res) => {
  const { id } = req.params;

  const result = await userService.hardDeleteStudent(id, req.user);

  // Revocar tokens Redis y desconectar WebSocket
  await revokeAllUserTokens(id, 'hard_delete', getRequestContext(req));
  const io = req.app.get('io');
  if (io) {
    disconnectUserSockets(io, id, 'ACCOUNT_HARD_DELETED');
  }

  logSecurityEvent('DATA_HARD_DELETE', {
    ...getRequestContext(req),
    deletedUserId: id,
    deletedBy: req.user._id,
    gamePlaysDeleted: result.gamePlaysDeleted
  });

  sendSuccess(
    res,
    {
      deleted: true,
      summary: {
        gamePlaysDeleted: result.gamePlaysDeleted
      }
    },
    'Datos del estudiante eliminados permanentemente (Art. 17 RGPD)'
  );
};

/**
 * Exportar datos personales de un estudiante (Art. 20 RGPD — portabilidad).
 * Genera un paquete JSON descargable con todos los datos del estudiante.
 *
 * GET /api/users/:id/export-data
 */
const exportStudentData = async (req, res) => {
  const { id } = req.params;
  const data = await dataExportService.exportStudentData(id, req.user);

  logSecurityEvent('DATA_EXPORT', {
    ...getRequestContext(req),
    studentPseudoId: pseudonymize(id),
    exportedBy: req.user._id
  });

  const pseudoId = pseudonymize(id);
  const date = new Date().toISOString().split('T')[0];

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="student-data-${pseudoId}-${date}.json"`
  );
  res.json(data);
};

module.exports = {
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
  exportStudentData
};
