/**
 * @fileoverview Validadores Zod para el modelo User.
 * Define esquemas de validación para crear y actualizar usuarios (profesores y alumnos).
 * @module validators/userValidator
 */

const { z } = require('zod');
const { objectIdSchema, userFiltersSchema } = require('./commonValidator');
const { ROLES, USER_STATUS, CONSENT_PURPOSES } = require('../constants/enums');

/**
 * Schema para validar email.
 * @type {import('zod').ZodString}
 */
const emailSchema = z.string().email('Email inválido').toLowerCase().trim();

/**
 * Schema para validar contraseña.
 * Mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número.
 * @type {import('zod').ZodString}
 */
const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .regex(/[A-Z]/, 'La contraseña debe contener al menos una mayúscula')
  .regex(/[a-z]/, 'La contraseña debe contener al menos una minúscula')
  .regex(/\d/, 'La contraseña debe contener al menos un número');

/**
 * Schema para crear un nuevo usuario (profesor o alumno).
 * Validación condicional según el rol.
 */
const createUserSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(100, 'El nombre no puede exceder 100 caracteres'),

    email: emailSchema.optional(),

    password: passwordSchema.optional(),

    role: z
      .enum([...ROLES], {
        errorMap: () => ({ message: 'El rol debe ser super_admin, teacher o student' })
      })
      .default('student'),

    profile: z
      .object({
        avatar: z.string().url('URL de avatar inválida').optional(),
        age: z
          .number()
          .int('La edad debe ser un número entero')
          .min(3, 'La edad mínima es 3 años')
          .max(99, 'La edad máxima es 99 años')
          .optional(),
        classroom: z
          .string()
          .trim()
          .max(50, 'El nombre de la clase no puede exceder 50 caracteres')
          .optional(),
        birthdate: z
          .string()
          .datetime({ message: 'Fecha de nacimiento inválida' })
          .or(z.date())
          .optional()
        // Nota: birthdate solo se mantiene como opcional para profesores.
        // Para alumnos, el modelo User.js lo rechaza en pre-save (Art. 5.1.c RGPD)
      })
      .optional(),

    status: z.enum([...USER_STATUS]).default('active'),

    createdBy: objectIdSchema.optional()
  })
  .refine(
    // Validación: Roles con login DEBEN tener email y password
    data => {
      if (data.role === 'teacher' || data.role === 'super_admin') {
        return !!data.email && !!data.password;
      }
      return true;
    },
    {
      message: 'Los usuarios con login deben tener email y contraseña',
      path: ['email']
    }
  )
  .refine(
    // Validación: Los alumnos NO deberían tener email ni password
    data => {
      if (data.role === 'student') {
        return !data.email && !data.password;
      }
      return true;
    },
    {
      message: 'Los alumnos no deben tener email ni contraseña',
      path: ['email']
    }
  )
  .strict();

/**
 * Schema específico para crear ALUMNOS desde POST /api/users.
 * Los alumnos NO tienen email ni password.
 * Solo super administradores pueden crear alumnos asignándolos a un teacherId.
 *
 * ⚠️ IMPORTANTE: Este es el schema que se usa en userController.createUser()
 */
const createStudentSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(100, 'El nombre no puede exceder 100 caracteres'),

    profile: z.object({
      avatar: z.string().url('URL de avatar inválida').optional(),
      age: z
        .number()
        .int('La edad debe ser un número entero')
        .min(3, 'La edad mínima es 3 años')
        .max(99, 'La edad máxima es 99 años'),
      classroom: z
        .string()
        .trim()
        .max(50, 'El nombre de la clase no puede exceder 50 caracteres')
        .optional()
      // birthdate ELIMINADO: Art. 5.1.c RGPD (minimización de datos).
      // La fecha de nacimiento completa tiene alto potencial identificativo
      // y no aporta valor pedagógico respecto a profile.age.
    }),

    teacherId: objectIdSchema,

    // Consentimiento parental — Art. 8 RGPD + Art. 7 LOPDGDD
    consent: z.object({
      granted: z.literal(true, {
        errorMap: () => ({
          message:
            'El consentimiento parental debe ser otorgado para crear un alumno (Art. 8 RGPD + Art. 7 LOPDGDD)'
        })
      }),
      grantedBy: z
        .string()
        .trim()
        .min(2, 'El nombre del tutor debe tener al menos 2 caracteres')
        .max(100, 'El nombre del tutor no puede exceder 100 caracteres'),
      purposes: z.array(z.enum([...CONSENT_PURPOSES])).optional(),
      policyVersion: z.string().trim().optional()
    })
  })
  .strict(); // Rechaza campos extra como email/password

/**
 * Schema para registrar un PROFESOR en POST /api/auth/register.
 * Los profesores DEBEN tener email y password.
 */
const registerTeacherSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(100, 'El nombre no puede exceder 100 caracteres'),

    email: emailSchema,

    password: passwordSchema,

    profile: z
      .object({
        avatar: z.string().url('URL de avatar inválida').optional()
      })
      .optional(),

    // Honeypot anti-bot: debe quedar vacío
    website: z.string().trim().max(0, 'Campo no permitido').optional()
    // ✅ NO incluye role, createdBy - se asignan automáticamente en el controller
  })
  .strict(); // Rechaza campos extra como role

/**
 * Schema para actualizar un usuario existente.
 * Todos los campos son opcionales.
 */
const updateUserSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(100, 'El nombre no puede exceder 100 caracteres')
      .optional(),

    email: emailSchema.optional(),

    password: passwordSchema.optional(),

    profile: z
      .object({
        avatar: z.string().url('URL de avatar inválida').optional(),
        age: z.number().int().min(3).max(99).optional(),
        classroom: z.string().trim().max(50).optional()
        // birthdate ELIMINADO: Art. 5.1.c RGPD (minimización)
      })
      .optional(),

    status: z.enum([...USER_STATUS]).optional()
  })
  .strict();

/**
 * Schema para login de profesores.
 */
const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'La contraseña es requerida')
  })
  .strict();

/**
 * Schema para query de búsqueda de usuarios.
 */
const userQuerySchema = userFiltersSchema.extend({
  sortBy: z.enum(['createdAt', 'name', 'lastLoginAt']).default('createdAt').optional()
});

/**
 * Schema para transferir alumno a otro profesor.
 */
const transferStudentSchema = z
  .object({
    newTeacherId: objectIdSchema,
    newClassroom: z
      .string()
      .trim()
      .min(1, 'newClassroom es requerido')
      .max(50, 'newClassroom no puede exceder 50 caracteres'),
    reason: z.string().trim().max(200, 'reason no puede exceder 200 caracteres').optional()
  })
  .strict();

/**
 * Schemas para params de rutas de usuarios.
 */
const userIdParamsSchema = z
  .object({
    id: objectIdSchema
  })
  .strict();

const teacherIdParamsSchema = z
  .object({
    teacherId: objectIdSchema
  })
  .strict();

/**
 * Schema para query de alumnos por profesor.
 */
const teacherStudentsQuerySchema = z
  .object({
    classroom: z.string().trim().max(50).optional(),
    sortBy: z.enum(['name', 'createdAt']).optional().default('name'),
    order: z.enum(['asc', 'desc']).optional().default('asc')
  })
  .strict();

/**
 * Schema para actualizar consentimiento parental (PATCH /api/users/:id/consent).
 * Art. 7.3 RGPD: la retirada del consentimiento debe ser tan fácil como su otorgamiento.
 */
const updateConsentSchema = z
  .object({
    granted: z.boolean(),
    grantedBy: z
      .string()
      .trim()
      .min(2, 'El nombre del tutor debe tener al menos 2 caracteres')
      .max(100, 'El nombre del tutor no puede exceder 100 caracteres')
      .optional(),
    purposes: z.array(z.enum([...CONSENT_PURPOSES])).optional(),
    policyVersion: z.string().trim().optional()
  })
  .strict()
  .refine(data => !(data.granted === true && !data.grantedBy), {
    message: 'Se requiere el nombre del tutor cuando se otorga el consentimiento',
    path: ['grantedBy']
  });

/**
 * Schema para borrado efectivo de datos de estudiante (DELETE /api/users/:id/data).
 * Art. 17 RGPD: derecho de supresión. Requiere confirmación explícita.
 */
const hardDeleteSchema = z
  .object({
    confirmDeletion: z.literal(true, {
      errorMap: () => ({
        message: 'Debe confirmar la eliminación permanente con confirmDeletion: true'
      })
    })
  })
  .strict();

/**
 * Schema para actualizar el progreso del onboarding interactivo
 * (PATCH /api/users/me/onboarding — T-951 PROP-13).
 *
 * El cliente puede enviar cualquier subset: paso actual, marca de
 * completado, o reset (currentStep=0 + completed=false). Usamos `partial`
 * sobre los campos editables, refinando que al menos uno esté presente.
 */
const updateOnboardingSchema = z
  .object({
    currentStep: z
      .number()
      .int('El paso actual debe ser un número entero')
      .min(0, 'El paso actual no puede ser negativo')
      .max(50, 'El paso actual excede el rango razonable')
      .optional(),
    currentTrack: z
      .enum(['teacher', 'super_admin'], {
        errorMap: () => ({
          message: 'El track del onboarding debe ser teacher o super_admin'
        })
      })
      .nullable()
      .optional(),
    teacherCompleted: z.boolean().optional(),
    superAdminCompleted: z.boolean().optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'Debes incluir al menos un campo a actualizar'
  });

module.exports = {
  createUserSchema,
  createStudentSchema,
  registerTeacherSchema,
  updateUserSchema,
  loginSchema,
  userQuerySchema,
  transferStudentSchema,
  userIdParamsSchema,
  teacherIdParamsSchema,
  teacherStudentsQuerySchema,
  updateConsentSchema,
  hardDeleteSchema,
  updateOnboardingSchema,
  emailSchema,
  passwordSchema,
  objectIdSchema
};
