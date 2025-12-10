/**
 * @fileoverview Modelo de datos para usuarios del sistema (Profesores y Alumnos).
 *
 * CONTEXTO DEL SISTEMA:
 * El sistema contempla dos roles de usuario con características muy diferentes:
 *
 * 1. PROFESORES (role: 'teacher'):
 *    - Son los ÚNICOS que inician sesión y gestionan la aplicación
 *    - Crean y configuran sesiones de juego (GameSession)
 *    - Crean y asignan partidas a los alumnos (GamePlay)
 *    - Consultan mecánicas, contextos y estadísticas
 *    - Pueden añadir contenido a los contextos existentes
 *    - Tienen credenciales de acceso (email/password)
 *
 * 2. ALUMNOS (role: 'student'):
 *    - Usuarios de entre 4-6 años que NO inician sesión
 *    - Son creados y gestionados por los profesores
 *    - NO tienen credenciales de acceso (password es opcional)
 *    - Juegan partidas asignadas por el profesor usando el sensor RFID
 *    - Tienen métricas y estadísticas asociadas a sus partidas
 *    - Permiten al profesor realizar análisis de aprendizaje individual y grupal
 *
 * IMPORTANTE: Solo los profesores interactúan directamente con la aplicación web.
 * Los alumnos solo interactúan con el sensor RFID durante las partidas.
 *
 * @module models/User
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

/**
 * Esquema de Mongoose para usuarios del sistema.
 * Soporta dos roles: 'teacher' (profesor con login) y 'student' (alumno sin login).
 *
 * @typedef {Object} User
 * @property {string} name - Nombre completo del usuario
 * @property {string} [email] - Email del usuario (requerido solo para profesores)
 * @property {string} [password] - Contraseña encriptada (requerido solo para profesores)
 * @property {string} role - Rol del usuario ('teacher' o 'student')
 * @property {Object} [profile] - Información de perfil adicional
 * @property {string} [profile.avatar] - URL del avatar del usuario
 * @property {number} [profile.age] - Edad del alumno (solo para students)
 * @property {string} [profile.classroom] - Aula o clase a la que pertenece el alumno
 * @property {Date} [profile.birthdate] - Fecha de nacimiento del alumno
 * @property {Object} studentMetrics - Métricas agregadas del alumno (solo para students)
 * @property {number} studentMetrics.totalGamesPlayed - Total de partidas jugadas
 * @property {number} studentMetrics.totalScore - Puntuación total acumulada
 * @property {number} studentMetrics.averageScore - Puntuación media por partida
 * @property {number} studentMetrics.bestScore - Mejor puntuación obtenida
 * @property {number} studentMetrics.totalCorrectAnswers - Total de respuestas correctas
 * @property {number} studentMetrics.totalErrors - Total de errores
 * @property {number} studentMetrics.averageResponseTime - Tiempo medio de respuesta en ms
 * @property {Date} studentMetrics.lastPlayedAt - Última fecha de juego
 * @property {string} status - Estado del usuario ('active', 'inactive')
 * @property {string} [createdBy] - ID del profesor que creó al alumno (solo para students)
 * @property {Date} lastLoginAt - Última fecha de inicio de sesión (solo para teachers)
 * @property {Date} createdAt - Fecha de creación del registro
 * @property {Date} updatedAt - Fecha de última actualización
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
      minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
      maxlength: [100, 'El nombre no puede exceder 100 caracteres']
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true, // Permite múltiples documentos con email undefined (para alumnos)
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'El email no es válido']
    },
    password: {
      type: String,
      minlength: [6, 'La contraseña debe tener al menos 6 caracteres']
    },
    role: {
      type: String,
      lowercase: true,
      trim: true,
      enum: {
        values: ['teacher', 'student'],
        message: 'El rol debe ser teacher o student'
      },
      required: [true, 'El rol es obligatorio'],
      default: 'student'
    },
    profile: {
      avatar: {
        type: String,
        default: null
      },
      age: {
        type: Number,
        min: [3, 'La edad mínima es 3 años'],
        max: [99, 'La edad máxima es 99 años']
      },
      classroom: {
        type: String,
        trim: true,
        maxlength: [50, 'El nombre de la clase no puede exceder 50 caracteres']
      },
      birthdate: Date
    },
    studentMetrics: {
      totalGamesPlayed: {
        type: Number,
        default: 0,
        min: 0
      },
      totalScore: {
        type: Number,
        default: 0
      },
      averageScore: {
        type: Number,
        default: 0
      },
      bestScore: {
        type: Number,
        default: 0
      },
      totalCorrectAnswers: {
        type: Number,
        default: 0,
        min: 0
      },
      totalErrors: {
        type: Number,
        default: 0,
        min: 0
      },
      averageResponseTime: {
        type: Number,
        default: 0,
        min: 0
      },
      lastPlayedAt: Date
    },
    status: {
      type: String,
      lowercase: true,
      trim: true,
      enum: ['active', 'inactive'],
      default: 'active'
    },
    assignedTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastLoginAt: Date
  },
  {
    timestamps: true,
    collection: 'users'
  }
);

/**
 * Hook pre-save para validaciones personalizadas.
 * - Los profesores DEBEN tener email y password
 * - Los alumnos NO deben tener email ni password (validación estricta)
 */
userSchema.pre('save', async function (next) {
  // ========================================
  // VALIDACIÓN PARA PROFESORES (role: 'teacher')
  // ========================================
  if (this.role === 'teacher') {
    if (!this.email) {
      return next(new Error('Los profesores deben tener un email'));
    }
    if (!this.password && this.isNew) {
      return next(new Error('Los profesores deben tener una contraseña'));
    }

    // Encriptar contraseña solo si fue modificada
    if (this.isModified('password') && this.password) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
  }

  // ========================================
  // VALIDACIÓN PARA ALUMNOS (role: 'student')
  // ========================================
  if (this.role === 'student') {
    // VALIDACIÓN ESTRICTA: Los alumnos NO deben tener email ni password
    if (this.email) {
      return next(
        new Error(
          'Los alumnos NO deben tener email. Son creados por profesores y no inician sesión.'
        )
      );
    }
    if (this.password) {
      return next(
        new Error(
          'Los alumnos NO deben tener contraseña. Son creados por profesores y no inician sesión.'
        )
      );
    }

    // VALIDAR que tenga un creador (profesor)
    if (!this.createdBy && this.isNew) {
      return next(
        new Error('Los alumnos deben ser creados por un profesor (campo createdBy requerido)')
      );
    }
  }

  next();
});

/**
 * Compara una contraseña proporcionada con el hash almacenado.
 * Solo aplicable para usuarios con contraseña (profesores).
 *
 * @instance
 * @memberof User
 * @param {string} candidatePassword - Contraseña en texto plano a verificar
 * @returns {Promise<boolean>} true si la contraseña es correcta, false en caso contrario
 * @example
 * const user = await User.findOne({ email: 'profesor@example.com' });
 * const isMatch = await user.comparePassword('miPassword123');
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Actualiza la fecha del último inicio de sesión.
 * Solo aplicable para profesores.
 *
 * @instance
 * @memberof User
 * @returns {Promise<User>} Promesa que resuelve con el documento actualizado
 * @example
 * await teacher.updateLastLogin();
 */
userSchema.methods.updateLastLogin = function () {
  this.lastLoginAt = new Date();
  return this.save();
};

/**
 * Actualiza las métricas del alumno después de completar una partida.
 * Este método debe ser llamado por el GameEngine al finalizar una partida.
 *
 * @instance
 * @memberof User
 * @param {Object} playResults - Resultados de la partida completada
 * @param {number} playResults.score - Puntuación obtenida en la partida
 * @param {number} playResults.correctAttempts - Cantidad de respuestas correctas
 * @param {number} playResults.errorAttempts - Cantidad de errores
 * @param {number} playResults.averageResponseTime - Tiempo medio de respuesta en ms
 * @returns {Promise<User>} Promesa que resuelve con el documento actualizado
 * @example
 * await student.updateStudentMetrics({
 *   score: 50,
 *   correctAttempts: 8,
 *   errorAttempts: 2,
 *   averageResponseTime: 3500
 * });
 */
userSchema.methods.updateStudentMetrics = function (playResults) {
  if (this.role !== 'student') {
    throw new Error('Solo los alumnos tienen métricas de juego');
  }

  // Incrementar contador de partidas
  this.studentMetrics.totalGamesPlayed += 1;

  // Actualizar puntuación total
  this.studentMetrics.totalScore += playResults.score;

  // Recalcular puntuación media
  this.studentMetrics.averageScore =
    this.studentMetrics.totalScore / this.studentMetrics.totalGamesPlayed;

  // Actualizar mejor puntuación si aplica
  if (playResults.score > this.studentMetrics.bestScore) {
    this.studentMetrics.bestScore = playResults.score;
  }

  // Actualizar contadores de aciertos y errores
  this.studentMetrics.totalCorrectAnswers += playResults.correctAttempts;
  this.studentMetrics.totalErrors += playResults.errorAttempts;

  // Recalcular tiempo medio de respuesta (promedio ponderado)
  const totalAttempts = this.studentMetrics.totalCorrectAnswers + this.studentMetrics.totalErrors;
  const previousWeight = totalAttempts - playResults.correctAttempts - playResults.errorAttempts;
  const newWeight = playResults.correctAttempts + playResults.errorAttempts;

  if (totalAttempts > 0) {
    this.studentMetrics.averageResponseTime =
      (this.studentMetrics.averageResponseTime * previousWeight +
        playResults.averageResponseTime * newWeight) /
      totalAttempts;
  }

  // Actualizar última fecha de juego
  this.studentMetrics.lastPlayedAt = new Date();

  return this.save();
};

/**
 * Obtiene una representación segura del usuario sin información sensible.
 * Elimina el campo password del objeto retornado.
 *
 * @instance
 * @memberof User
 * @returns {Object} Objeto con los datos del usuario sin campos sensibles
 */
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

/**
 * Verifica si el usuario es un profesor.
 *
 * @instance
 * @memberof User
 * @returns {boolean} true si el rol es 'teacher', false en caso contrario
 */
userSchema.methods.isTeacher = function () {
  return this.role === 'teacher';
};

/**
 * Verifica si el usuario es un alumno.
 *
 * @instance
 * @memberof User
 * @returns {boolean} true si el rol es 'student', false en caso contrario
 */
userSchema.methods.isStudent = function () {
  return this.role === 'student';
};

/**
 * Excluir el campo password del resultado de consultas por defecto.
 * Esto mejora la seguridad evitando exponer contraseñas accidentalmente.
 */
userSchema.set('toJSON', {
  transform(doc, ret, options) {
    delete ret.password;
    return ret;
  }
});

/**
 * Índice para filtrar usuarios por rol.
 * Útil para listar todos los profesores o todos los alumnos.
 */
userSchema.index({ role: 1 });

/**
 * Índice para filtrar usuarios por estado.
 * Útil para listar usuarios activos/inactivos.
 */
userSchema.index({ status: 1 });

/**
 * Índice compuesto para filtrar alumnos de un aula específica.
 * Útil para análisis de clase y estadísticas grupales.
 */
userSchema.index({ role: 1, 'profile.classroom': 1 });

/**
 * Índice para búsqueda de alumnos por profesor creador.
 * Permite a un profesor ver todos sus alumnos.
 */
userSchema.index({ createdBy: 1 });

module.exports = mongoose.model('User', userSchema);
