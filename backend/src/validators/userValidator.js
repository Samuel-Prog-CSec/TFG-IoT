/**
 * @fileoverview Validadores Zod para el modelo User.
 * Define esquemas de validación para crear y actualizar usuarios (profesores y alumnos).
 * @module validators/userValidator
 */

const { z } = require('zod');

/**
 * Schema para validar ObjectId de MongoDB.
 * @type {import('zod').ZodString}
 */
const objectIdSchema = z.string().regex(
  /^[0-9a-fA-F]{24}$/,
  'ID de MongoDB inválido'
);

/**
 * Schema para validar email.
 * @type {import('zod').ZodString}
 */
const emailSchema = z.string()
  .email('Email inválido')
  .toLowerCase()
  .trim();

/**
 * Schema para validar contraseña.
 * Mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número.
 * @type {import('zod').ZodString}
 */
const passwordSchema = z.string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .regex(/[A-Z]/, 'La contraseña debe contener al menos una mayúscula')
  .regex(/[a-z]/, 'La contraseña debe contener al menos una minúscula')
  .regex(/[0-9]/, 'La contraseña debe contener al menos un número');

/**
 * Schema para crear un nuevo usuario (profesor o alumno).
 * Validación condicional según el rol.
 */
const createUserSchema = z.object({
  name: z.string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),

  email: emailSchema.optional(),

  password: passwordSchema.optional(),

  role: z.enum(['teacher', 'student'], {
    errorMap: () => ({ message: 'El rol debe ser teacher o student' })
  }).default('student'),

  profile: z.object({
    avatar: z.string().url('URL de avatar inválida').optional(),
    age: z.number()
      .int('La edad debe ser un número entero')
      .min(3, 'La edad mínima es 3 años')
      .max(99, 'La edad máxima es 99 años')
      .optional(),
    classroom: z.string()
      .trim()
      .max(50, 'El nombre de la clase no puede exceder 50 caracteres')
      .optional(),
    birthdate: z.string()
      .datetime({ message: 'Fecha de nacimiento inválida' })
      .or(z.date())
      .optional()
  }).optional(),

  status: z.enum(['active', 'inactive']).default('active'),

  createdBy: objectIdSchema.optional()
}).refine(
  // Validación: Los profesores DEBEN tener email y password
  (data) => {
    if (data.role === 'teacher') {
      return !!data.email && !!data.password;
    }
    return true;
  },
  {
    message: 'Los profesores deben tener email y contraseña',
    path: ['email']
  }
).refine(
  // Validación: Los alumnos NO deberían tener email ni password
  (data) => {
    if (data.role === 'student') {
      return !data.email && !data.password;
    }
    return true;
  },
  {
    message: 'Los alumnos no deben tener email ni contraseña',
    path: ['email']
  }
);

/**
 * Schema específico para crear ALUMNOS desde POST /api/users.
 * Los alumnos NO tienen email ni password.
 * Solo profesores autenticados pueden crear alumnos.
 *
 * ⚠️ IMPORTANTE: Este es el schema que se usa en userController.createUser()
 */
const createStudentSchema = z.object({
  name: z.string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),

  profile: z.object({
    avatar: z.string().url('URL de avatar inválida').optional(),
    age: z.number()
      .int('La edad debe ser un número entero')
      .min(3, 'La edad mínima es 3 años')
      .max(99, 'La edad máxima es 99 años')
      .optional(),
    classroom: z.string()
      .trim()
      .max(50, 'El nombre de la clase no puede exceder 50 caracteres')
      .optional(),
    birthdate: z.string()
      .datetime({ message: 'Fecha de nacimiento inválida' })
      .or(z.date())
      .optional()
  }).optional()
  // ✅ NO incluye email, password, role, createdBy - se asignan automáticamente en el controller
}).strict(); // Rechaza campos extra como email/password

/**
 * Schema para registrar un PROFESOR en POST /api/auth/register.
 * Los profesores DEBEN tener email y password.
 */
const registerTeacherSchema = z.object({
  name: z.string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),

  email: emailSchema,

  password: passwordSchema,

  profile: z.object({
    avatar: z.string().url('URL de avatar inválida').optional()
  }).optional()
  // ✅ NO incluye role, createdBy - se asignan automáticamente en el controller
}).strict(); // Rechaza campos extra como role

/**
 * Schema para actualizar un usuario existente.
 * Todos los campos son opcionales.
 *
 * NUEVO: Incluye createdBy para permitir reasignar alumnos a otro profesor.
 */
const updateUserSchema = z.object({
  name: z.string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres')
    .optional(),

  email: emailSchema.optional(),

  password: passwordSchema.optional(),

  profile: z.object({
    avatar: z.string().url('URL de avatar inválida').optional(),
    age: z.number()
      .int()
      .min(3)
      .max(99)
      .optional(),
    classroom: z.string()
      .trim()
      .max(50)
      .optional(),
    birthdate: z.string()
      .datetime()
      .or(z.date())
      .optional()
  }).optional(),

  status: z.enum(['active', 'inactive']).optional(),

  // ✅ NUEVO: Permitir cambiar el profesor asignado
  // Caso de uso: Alumno cambia de profesor o de responsable
  createdBy: objectIdSchema.optional()
});

/**
 * Schema para login de profesores.
 */
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'La contraseña es requerida')
});

/**
 * Schema para query de búsqueda de usuarios.
 */
const userQuerySchema = z.object({
  role: z.enum(['teacher', 'student']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  classroom: z.string().trim().optional(),
  createdBy: objectIdSchema.optional(),
  page: z.string()
    .transform(val => parseInt(val, 10))
    .pipe(z.number().int().min(1).default(1))
    .optional(),
  limit: z.string()
    .transform(val => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100).default(20))
    .optional(),
  sortBy: z.enum(['createdAt', 'name', 'lastLoginAt']).default('createdAt').optional(),
  order: z.enum(['asc', 'desc']).default('desc').optional()
});

module.exports = {
  createUserSchema,
  createStudentSchema,
  registerTeacherSchema,
  updateUserSchema,
  loginSchema,
  userQuerySchema
};
