/**
 * @fileoverview Modelo de datos para usuarios del sistema (Profesores y Alumnos).
 *
 * CONTEXTO DEL SISTEMA:
 * El sistema contempla tres roles de usuario con características muy diferentes:
 *
 * 1. SUPER ADMIN (role: 'super_admin'):
 *    - Valida (aprueba/rechaza) nuevos profesores antes de que puedan acceder al sistema
 *    - Tiene credenciales de acceso (email/password)
 *
 * 2. PROFESORES (role: 'teacher'):
 *    - Son los ÚNICOS que inician sesión y gestionan la aplicación
 *    - Crean y configuran sesiones de juego (GameSession)
 *    - Crean y asignan partidas a los alumnos (GamePlay)
 *    - Consultan mecánicas, contextos y estadísticas
 *    - Pueden añadir contenido a los contextos existentes
 *    - Tienen credenciales de acceso (email/password)
 *
 * 3. ALUMNOS (role: 'student'):
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
const {
  ROLES,
  USER_STATUS,
  ACCOUNT_STATUS,
  CONSENT_PURPOSES,
  CONSENT_CHANNEL,
  CONSENT_ACTION
} = require('../constants/enums');

const hasLoginRole = role => role === 'teacher' || role === 'super_admin';

const validateLoginRoleRequirements = user => {
  if (!user.email) {
    throw new Error('Los profesores deben tener un email');
  }
  if (!user.password && user.isNew) {
    throw new Error('Los profesores deben tener una contraseña');
  }
};

const validateStudentRequirements = user => {
  if (user.email) {
    throw new Error(
      'Los alumnos NO deben tener email. Son creados por profesores y no inician sesión.'
    );
  }
  if (user.password) {
    throw new Error(
      'Los alumnos NO deben tener contraseña. Son creados por profesores y no inician sesión.'
    );
  }
  if (!user.createdBy && user.isNew) {
    throw new Error('Los alumnos deben ser creados por un profesor (campo createdBy requerido)');
  }
  // Minimización de datos — Art. 5.1.c RGPD: la fecha de nacimiento completa
  // tiene alto potencial identificativo y no aporta valor pedagógico respecto a la edad simple
  if (user.profile?.birthdate) {
    throw new Error(
      'Los alumnos NO deben tener fecha de nacimiento (principio de minimización, Art. 5.1.c RGPD). Usar profile.age en su lugar.'
    );
  }
  // Consentimiento parental obligatorio — Art. 8 RGPD + Art. 7 LOPDGDD
  if (user.isNew) {
    if (!user.consent?.granted) {
      throw new Error(
        'El consentimiento parental es obligatorio para crear alumnos (Art. 8 RGPD + Art. 7 LOPDGDD)'
      );
    }
    if (!user.consent?.grantedBy) {
      throw new Error('Se requiere el nombre del tutor que otorga el consentimiento');
    }
    if (!user.consent.grantedAt) {
      user.consent.grantedAt = new Date();
    }
    if (!user.consent.purposes || user.consent.purposes.length === 0) {
      user.consent.purposes = ['educational_tracking', 'performance_analytics'];
    }
  }
};

const hashPasswordIfNeeded = async user => {
  if (!user.isModified('password') || !user.password) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(user.password, salt);
};

/**
 * Esquema de Mongoose para usuarios del sistema.
 * Soporta tres roles: 'super_admin' (valida profesores), 'teacher' (profesor con login) y
 * 'student' (alumno sin login).
 *
 * @typedef {Object} User
 * @property {string} name - Nombre completo del usuario
 * @property {string} [email] - Email del usuario (requerido solo para profesores)
 * @property {string} [password] - Contraseña encriptada (requerido solo para profesores)
 * @property {string} role - Rol del usuario ('super_admin', 'teacher' o 'student')
 * @property {string} [accountStatus] - Estado de la cuenta para roles con login
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
      match: [/^[\w.%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i, 'El email no es válido']
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
        values: ROLES,
        message: 'El rol debe ser super_admin, teacher o student'
      },
      required: [true, 'El rol es obligatorio'],
      default: 'student'
    },
    accountStatus: {
      type: String,
      lowercase: true,
      trim: true,
      enum: ACCOUNT_STATUS,
      default: 'approved'
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
      birthdate: Date,
      // Estado del onboarding interactivo (T-951 PROP-13). Se persiste
      // en backend en lugar de solo localStorage para que el progreso
      // sobreviva al cambio de dispositivo — crítico para super_admin
      // que entra desde su laptop y desde el PC del centro.
      onboarding: {
        teacherCompleted: { type: Boolean, default: false },
        superAdminCompleted: { type: Boolean, default: false },
        currentStep: {
          type: Number,
          default: 0,
          min: [0, 'El paso del onboarding no puede ser negativo']
        },
        currentTrack: {
          type: String,
          enum: {
            values: ['teacher', 'super_admin', null],
            message: 'El track del onboarding debe ser teacher o super_admin'
          },
          default: null
        },
        // Versión del tour: si se publican nuevos pasos relevantes en el
        // futuro, basta con incrementar la versión del cliente y el
        // backend invalidará el "completed" para forzar la repetición
        // del tour modificado (sin perder el flag legacy).
        version: { type: Number, default: 1 },
        lastSeenAt: { type: Date, default: null }
      }
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
      totalTimeouts: {
        type: Number,
        default: 0,
        min: 0
      },
      totalAbandonedGames: {
        type: Number,
        default: 0,
        min: 0
      },
      // Mejor longitud de secuencia alcanzada en cualquier partida (mecánica
      // Secuencia). Se actualiza monótonicamente en updateStudentMetrics si
      // la partida actual supera el récord histórico del alumno.
      maxSequenceLengthAchieved: {
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
      enum: USER_STATUS,
      default: 'active'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    // Consentimiento parental — Art. 8 RGPD + Art. 7 LOPDGDD
    // Obligatorio para estudiantes menores de 14 años.
    // Registra quién otorgó el consentimiento, cuándo, para qué finalidades y bajo qué versión de la política.
    consent: {
      granted: {
        type: Boolean,
        default: false
      },
      grantedBy: {
        type: String,
        trim: true,
        maxlength: [100, 'El nombre del tutor no puede exceder 100 caracteres']
      },
      grantedAt: {
        type: Date
      },
      purposes: [
        {
          type: String,
          enum: CONSENT_PURPOSES
        }
      ],
      policyVersion: {
        type: String,
        trim: true,
        default: '1.0'
      },
      withdrawnAt: {
        type: Date,
        default: null
      },
      // Metadata del canal de recogida — Art. 7.1 RGPD (demostrar consentimiento)
      channel: {
        type: String,
        trim: true,
        enum: CONSENT_CHANNEL,
        default: 'web_form'
      },
      ipAddress: {
        type: String,
        trim: true
      },
      userAgent: {
        type: String,
        trim: true
      }
    },
    // Historial de cambios de consentimiento — Art. 7.1 RGPD (demostrar consentimiento)
    // Cada otorgamiento o revocación se registra para trazabilidad completa.
    consentHistory: [
      {
        action: {
          type: String,
          enum: CONSENT_ACTION
        },
        grantedBy: String,
        timestamp: {
          type: Date,
          default: Date.now
        },
        policyVersion: String,
        purposes: [
          {
            type: String,
            enum: CONSENT_PURPOSES
          }
        ]
      }
    ],
    currentSessionId: {
      type: String,
      default: null,
      select: false // No exponer por defecto por seguridad
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
userSchema.pre('save', async function () {
  if (hasLoginRole(this.role)) {
    validateLoginRoleRequirements(this);
    await hashPasswordIfNeeded(this);
  }

  if (this.role === 'student') {
    validateStudentRequirements(this);
  }

  // En hooks async no se usa callback next(); la promesa resuelta continúa el save.
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
 * @param {number} [playResults.timeoutAttempts=0] - Cantidad de timeouts
 * @param {number} playResults.averageResponseTime - Tiempo medio de respuesta en ms
 * @returns {Promise<User>} Promesa que resuelve con el documento actualizado
 * @example
 * await student.updateStudentMetrics({
 *   score: 50,
 *   correctAttempts: 8,
 *   errorAttempts: 2,
 *   timeoutAttempts: 1,
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

  // Actualizar contadores de aciertos, errores y timeouts
  this.studentMetrics.totalCorrectAnswers += playResults.correctAttempts;
  this.studentMetrics.totalErrors += playResults.errorAttempts;
  this.studentMetrics.totalTimeouts += playResults.timeoutAttempts || 0;

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

  // Si la partida es de Secuencia y trae un nuevo récord de longitud, lo
  // persistimos. Idempotente: si maxSequenceLengthAchieved no viene en
  // playResults (Asociación / Memoria), no se modifica nada.
  if (Number.isFinite(Number(playResults.maxSequenceLengthAchieved))) {
    const candidate = Number(playResults.maxSequenceLengthAchieved);
    const current = Number(this.studentMetrics.maxSequenceLengthAchieved || 0);
    if (candidate > current) {
      this.studentMetrics.maxSequenceLengthAchieved = candidate;
    }
  }

  return this.save();
};

/**
 * Registra una partida abandonada en las métricas del alumno.
 * No afecta al averageScore (las abandonadas no cuentan para la media).
 * Solo incrementa el contador de abandonos y actualiza lastPlayedAt.
 *
 * @instance
 * @memberof User
 * @returns {Promise<User>} Promesa que resuelve con el documento actualizado
 */
userSchema.methods.recordAbandonedGame = function () {
  if (this.role !== 'student') {
    throw new Error('Solo los alumnos tienen métricas de juego');
  }

  this.studentMetrics.totalAbandonedGames += 1;
  this.studentMetrics.lastPlayedAt = new Date();

  return this.save();
};

/**
 * Verifica si el estudiante tiene consentimiento activo para un propósito específico.
 *
 * @instance
 * @memberof User
 * @param {string} purpose - Propósito a verificar ('educational_tracking' o 'performance_analytics')
 * @returns {boolean} true si el consentimiento está activo y el propósito incluido
 */
userSchema.methods.hasConsentFor = function (purpose) {
  return (
    this.consent?.granted === true &&
    !this.consent?.withdrawnAt &&
    this.consent?.purposes?.includes(purpose)
  );
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
 * Verifica si el usuario es un super admin.
 *
 * @instance
 * @memberof User
 * @returns {boolean} true si el rol es 'super_admin', false en caso contrario
 */
userSchema.methods.isSuperAdmin = function () {
  return this.role === 'super_admin';
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
  transform(doc, ret, _options) {
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

/**
 * Índice compuesto para analytics de clase: estudiantes de un profesor por rol.
 * Caso de uso: GET /api/analytics/classroom/students (lista filtrada por profesor).
 */
userSchema.index({ createdBy: 1, role: 1 });

module.exports = mongoose.model('User', userSchema);
