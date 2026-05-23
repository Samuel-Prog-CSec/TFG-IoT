/**
 * @fileoverview Servicio de lógica de negocio para User.
 * Maneja validaciones y cálculos relacionados con usuarios (teachers y students).
 * Principio Single Responsibility: Lógica exclusiva de gestión de usuarios.
 * @module services/userService
 */

const userRepository = require('../repositories/userRepository');
const gamePlayRepository = require('../repositories/gamePlayRepository');
const {
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError
} = require('../utils/errors');
const logger = require('../utils/logger').child({ component: 'userService' });
const { invalidateUserCache } = require('../middlewares/auth');

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

  const existingUser = await userRepository.findOne(query);

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
async function findDuplicateStudent({ name, teacherId, classroom, excludeUserId = null }) {
  const query = {
    role: 'student',
    name,
    createdBy: teacherId
  };

  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }

  if (classroom) {
    query['profile.classroom'] = classroom;
  }

  return userRepository.findOne(query);
}

async function validateStudentNameUniqueness(name, teacherId, classroom, excludeUserId = null) {
  const existingStudent = await findDuplicateStudent({
    name,
    teacherId,
    classroom,
    excludeUserId
  });

  if (existingStudent) {
    const message = classroom
      ? `Ya tienes un alumno llamado "${name}" en la clase "${classroom}"`
      : `Ya tienes un alumno llamado "${name}"`;
    throw new ConflictError(message);
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
  const teacher = await userRepository.findById(teacherId);

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
 * @param {Object} studentData.profile - Perfil del estudiante (age, classroom)
 * @param {string} studentData.createdBy - ID del profesor creador
 * @param {Object} studentData.consent - Consentimiento parental (Art. 8 RGPD + Art. 7 LOPDGDD)
 * @returns {Promise<Object>} Estudiante creado
 * @throws {ValidationError} Si falta edad, consentimiento o el estudiante está fuera del rango
 */
async function createStudent(studentData) {
  const { name, profile, createdBy, consent } = studentData;

  // Validar que el profesor existe
  await validateTeacher(createdBy);

  // Validar que el nombre no esté duplicado para este profesor
  await validateStudentNameUniqueness(name, createdBy, profile?.classroom);

  // Validar edad obligatoria para estudiantes
  if (!profile?.age) {
    throw new ValidationError('La edad es obligatoria para estudiantes');
  }

  if (profile.age < 3 || profile.age > 99) {
    throw new ValidationError('La edad debe estar entre 3 y 99 años');
  }

  // Crear estudiante (sin email ni password, con consentimiento parental)
  const student = await userRepository.create({
    name,
    role: 'student',
    profile,
    consent: {
      granted: consent.granted,
      grantedBy: consent.grantedBy,
      grantedAt: consent.grantedAt || new Date(),
      purposes: consent.purposes || ['educational_tracking', 'performance_analytics'],
      policyVersion: consent.policyVersion || '1.0',
      withdrawnAt: null
    },
    status: 'active',
    createdBy
  });

  logger.info('Estudiante creado via service', {
    studentId: student._id,
    age: profile.age,
    createdBy
  });

  return student;
}

/**
 * Actualiza el consentimiento parental de un estudiante.
 * Art. 7.3 RGPD: la retirada del consentimiento debe ser tan fácil como su otorgamiento.
 *
 * @param {string} studentId - ID del estudiante
 * @param {Object} consentData - Datos del consentimiento
 * @param {boolean} consentData.granted - Si se otorga o revoca
 * @param {string} [consentData.grantedBy] - Nombre del tutor (obligatorio si granted=true)
 * @param {Object} requestingUser - Usuario que solicita el cambio (req.user)
 * @returns {Promise<Object>} Estudiante actualizado
 */
async function updateConsent(studentId, consentData, requestingUser) {
  const student = await userRepository.findById(studentId);

  if (!student) {
    throw new NotFoundError('Estudiante');
  }
  if (student.role !== 'student') {
    throw new ValidationError('El consentimiento parental solo aplica a estudiantes');
  }

  // Verificar ownership: solo profesor creador o super_admin — Art. 5.1.f RGPD
  const isOwner = student.createdBy?.toString() === requestingUser._id.toString();
  const isSuperAdmin = requestingUser.role === 'super_admin';
  if (!isOwner && !isSuperAdmin) {
    throw new ForbiddenError(
      'No tienes permiso para modificar el consentimiento de este estudiante'
    );
  }

  const updates = {};

  // Registrar entrada en historial de consentimiento — Art. 7.1 RGPD (demostrar consentimiento)
  const currentConsent = student.consent?.toObject?.() || student.consent || {};
  const historyEntry = {
    action: consentData.granted ? 'granted' : 'withdrawn',
    grantedBy: consentData.granted ? consentData.grantedBy : currentConsent.grantedBy,
    timestamp: new Date(),
    policyVersion: consentData.granted
      ? consentData.policyVersion || currentConsent.policyVersion || '1.0'
      : currentConsent.policyVersion,
    purposes: consentData.granted
      ? consentData.purposes ||
        currentConsent.purposes || ['educational_tracking', 'performance_analytics']
      : currentConsent.purposes
  };

  // Metadata de canal para trazabilidad (si la proporciona el controller)
  const channelMetadata = {
    ...(consentData.channel && { channel: consentData.channel }),
    ...(consentData.ipAddress && { ipAddress: consentData.ipAddress }),
    ...(consentData.userAgent && { userAgent: consentData.userAgent })
  };

  if (consentData.granted === false) {
    // Revocación — Art. 7.3 RGPD + Art. 17.1.b RGPD (supresión si se retira consentimiento)
    updates.consent = {
      ...currentConsent,
      granted: false,
      withdrawnAt: new Date(),
      ...channelMetadata
    };
    // La revocación desactiva automáticamente al estudiante
    updates.status = 'inactive';

    logger.warn('Consentimiento parental revocado — estudiante desactivado', {
      studentId,
      revokedBy: requestingUser._id
    });
  } else {
    // Otorgamiento o re-otorgamiento
    updates.consent = {
      granted: true,
      grantedBy: consentData.grantedBy,
      grantedAt: new Date(),
      purposes: consentData.purposes || ['educational_tracking', 'performance_analytics'],
      policyVersion: consentData.policyVersion || '1.0',
      withdrawnAt: null,
      ...channelMetadata
    };

    logger.info('Consentimiento parental otorgado', {
      studentId,
      grantedBy: requestingUser._id
    });
  }

  // Usar $set + $push en una sola operación atómica.
  // A.6 (pre-v1.0.0): cap con sliding window a las últimas 100 entradas.
  // RGPD Art. 7.1 exige trazabilidad del consentimiento; 100 entradas
  // cubren holgadamente >10 años de uso normal (revisión anual + cambios
  // ocasionales) y previenen runaway document growth si un bug o un
  // tutor en bucle dispara revoke/grant masivos.
  return userRepository.updateById(studentId, {
    $set: updates,
    $push: { consentHistory: { $each: [historyEntry], $slice: -100 } }
  });
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
  const user = await userRepository.findById(userId);

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
    await validateStudentNameUniqueness(
      updates.name,
      user.createdBy,
      updates.profile?.classroom,
      userId
    );
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

  // Invalidar cache de slim-user para reflejar cambios en el siguiente request autenticado.
  await invalidateUserCache(user._id);

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
  const student = await userRepository.findById(studentId);

  if (!student) {
    throw new NotFoundError('Estudiante');
  }

  if (student.role !== 'student') {
    throw new ValidationError('Este endpoint es solo para estudiantes');
  }

  // Obtener media de la clase (alumnos del mismo profesor)
  const classStats = await userRepository.aggregate([
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
  const students = await userRepository.find(
    {
      role: 'student',
      createdBy: teacherId,
      status: 'active'
    },
    { select: 'name profile.age profile.classroom studentMetrics createdAt', sort: { name: 1 } }
  );

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
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new NotFoundError('Usuario');
  }

  // Si es profesor, verificar que no tenga estudiantes activos
  if (user.role === 'teacher') {
    const activeStudents = await userRepository.count({
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

/**
 * Borrado efectivo (hard delete) de todos los datos de un estudiante.
 * Art. 17 RGPD: derecho de supresión, especialmente Art. 17.1.f (datos de menores).
 * Considerando 65: el derecho es pertinente cuando el interesado dio su consentimiento siendo niño.
 *
 * Cascada de eliminación:
 * 1. Todos los GamePlays del estudiante
 * 2. Documento User de MongoDB
 *
 * @param {string} studentId - ID del estudiante a eliminar
 * @param {Object} requestingUser - Usuario que solicita la eliminación
 * @returns {Promise<Object>} Resumen de la eliminación
 */
async function hardDeleteStudent(studentId, requestingUser) {
  const student = await userRepository.findById(studentId);

  if (!student) {
    throw new NotFoundError('Estudiante');
  }
  if (student.role !== 'student') {
    throw new ValidationError('El borrado efectivo solo aplica a estudiantes');
  }

  // Verificar ownership: solo profesor creador o super_admin
  const isOwner = student.createdBy?.toString() === requestingUser._id.toString();
  const isSuperAdmin = requestingUser.role === 'super_admin';
  if (!isOwner && !isSuperAdmin) {
    throw new ForbiddenError('No tienes permiso para eliminar los datos de este estudiante');
  }

  // 1. Eliminar todos los GamePlays del estudiante
  const deletedPlays = await gamePlayRepository.deleteMany({ playerId: studentId });

  // 2. Eliminar el documento User
  await userRepository.deleteById(studentId);

  // 3. T-931 (pre-v1.0.0): purgar materialización Redis del alumno
  // (Hash `student:metrics:*` + entradas en leaderboards). Fire-and-forget
  // — si Redis cae, la reconciliación nocturna no resucita estos datos
  // porque el alumno ya no existe en Mongo.
  try {
    const materializedAnalytics = require('./analytics/materializedAnalyticsService');
    await materializedAnalytics.purgeStudentMaterialization({
      studentId,
      teacherId: student.createdBy
    });
  } catch (purgeErr) {
    logger.warn('hardDeleteStudent: fallo al purgar materialización Redis (no bloquea)', {
      studentId,
      error: purgeErr.message
    });
  }

  // Log sin PII del estudiante — Art. 5.2 RGPD (accountability)
  logger.warn('Borrado efectivo de estudiante completado (Art. 17 RGPD)', {
    deletedStudentId: studentId,
    deletedBy: requestingUser._id,
    deletedByRole: requestingUser.role,
    gamePlaysDeleted: deletedPlays?.deletedCount || 0
  });

  return {
    userId: studentId,
    gamePlaysDeleted: deletedPlays?.deletedCount || 0
  };
}

module.exports = {
  createStudent,
  updateUser,
  updateConsent,
  hardDeleteStudent,
  getStudentComparativeStats,
  getTeacherStudents,
  validateUserDeletion,
  validateEmailUniqueness,
  validateStudentNameUniqueness,
  findDuplicateStudent,
  validateTeacher
};
