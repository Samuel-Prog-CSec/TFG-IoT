/**
 * @fileoverview Tests unitarios dirigidos para userValidator.
 *
 * Cubre ramas infra-cubiertas: refines condicionales por rol en createUserSchema,
 * el sub-schema profile (avatar/age/classroom), updateUserSchema, userQuerySchema,
 * transferStudentSchema, teacherStudentsQuerySchema, updateOnboardingSchema y los
 * params. Complementa los tests de integración (validationEndpoints) ejercitando
 * cada regla/regex/límite a nivel de schema con safeParse.
 */

const {
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
  updateOnboardingSchema,
  emailSchema,
  passwordSchema
} = require('../../src/validators/userValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';
const OTHER_OBJECT_ID = '507f1f77bcf86cd799439012';

describe('userValidator (unit)', () => {
  describe('emailSchema', () => {
    it('normaliza a minúsculas', () => {
      const result = emailSchema.safeParse('TEST@Example.COM');
      expect(result.success).toBe(true);
      expect(result.data).toBe('test@example.com');
    });

    // Documenta el comportamiento ACTUAL (ver informe — finding orden trim/email):
    // el chain es `.email().toLowerCase().trim()`, así que `.email()` valida ANTES
    // del `.trim()` y un email con espacios alrededor se rechaza.
    it('rechaza un email válido con espacios alrededor (trim posterior a email)', () => {
      expect(emailSchema.safeParse('  test@example.com  ').success).toBe(false);
    });

    it('rechaza email malformado', () => {
      expect(emailSchema.safeParse('no-arroba').success).toBe(false);
    });
  });

  describe('passwordSchema (cada regla por separado)', () => {
    it('acepta una contraseña fuerte', () => {
      expect(passwordSchema.safeParse('Abcd1234').success).toBe(true);
    });

    it('rechaza por longitud < 8 con mensaje específico', () => {
      const result = passwordSchema.safeParse('Ab1');
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toMatch(/al menos 8 caracteres/);
    });

    it('rechaza sin mayúscula', () => {
      const result = passwordSchema.safeParse('abcd1234');
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /mayúscula/.test(i.message))).toBe(true);
    });

    it('rechaza sin minúscula', () => {
      const result = passwordSchema.safeParse('ABCD1234');
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /minúscula/.test(i.message))).toBe(true);
    });

    it('rechaza sin dígito', () => {
      const result = passwordSchema.safeParse('Abcdefgh');
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /número/.test(i.message))).toBe(true);
    });
  });

  describe('createUserSchema', () => {
    it('acepta un teacher con email y password (rama login)', () => {
      const result = createUserSchema.safeParse({
        name: 'Profe Uno',
        email: 'profe@test.com',
        password: 'Abcd1234',
        role: 'teacher'
      });
      expect(result.success).toBe(true);
    });

    it('acepta un super_admin con credenciales', () => {
      const result = createUserSchema.safeParse({
        name: 'Admin Uno',
        email: 'admin@test.com',
        password: 'Abcd1234',
        role: 'super_admin'
      });
      expect(result.success).toBe(true);
    });

    it('rechaza teacher sin password (refine login) con path email', () => {
      const result = createUserSchema.safeParse({
        name: 'Profe Sin Pass',
        email: 'profe@test.com',
        role: 'teacher'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toContain('email');
    });

    it('rechaza super_admin sin email', () => {
      const result = createUserSchema.safeParse({
        name: 'Admin Sin Email',
        password: 'Abcd1234',
        role: 'super_admin'
      });
      expect(result.success).toBe(false);
    });

    it('aplica el default role=student cuando se omite', () => {
      const result = createUserSchema.safeParse({ name: 'Alumno Default' });
      expect(result.success).toBe(true);
      expect(result.data.role).toBe('student');
      expect(result.data.status).toBe('active');
    });

    it('rechaza student CON email/password (segundo refine)', () => {
      const result = createUserSchema.safeParse({
        name: 'Alumno Con Login',
        role: 'student',
        email: 'alumno@test.com',
        password: 'Abcd1234'
      });
      expect(result.success).toBe(false);
    });

    it('rechaza rol fuera del enum con el mensaje custom', () => {
      const result = createUserSchema.safeParse({ name: 'X Rol', role: 'hacker' });
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /super_admin, teacher o student/.test(i.message))).toBe(
        true
      );
    });

    it('acepta profile completo (avatar URL, age, classroom)', () => {
      const result = createUserSchema.safeParse({
        name: 'Alumno Profile',
        role: 'student',
        profile: {
          avatar: 'https://cdn.test/avatar.png',
          age: 8,
          classroom: '3A'
        }
      });
      expect(result.success).toBe(true);
    });

    it('rechaza avatar con URL inválida', () => {
      const result = createUserSchema.safeParse({
        name: 'Alumno Avatar',
        role: 'student',
        profile: { avatar: 'no-es-url' }
      });
      expect(result.success).toBe(false);
    });

    it('rechaza age no entero', () => {
      const result = createUserSchema.safeParse({
        name: 'Alumno Edad',
        role: 'student',
        profile: { age: 7.5 }
      });
      expect(result.success).toBe(false);
    });

    it('rechaza age < 3 (límite inferior)', () => {
      const result = createUserSchema.safeParse({
        name: 'Alumno Edad',
        role: 'student',
        profile: { age: 2 }
      });
      expect(result.success).toBe(false);
    });

    it('rechaza age > 99 (límite superior)', () => {
      const result = createUserSchema.safeParse({
        name: 'Alumno Edad',
        role: 'student',
        profile: { age: 100 }
      });
      expect(result.success).toBe(false);
    });

    it('rechaza classroom de más de 50 caracteres', () => {
      const result = createUserSchema.safeParse({
        name: 'Alumno Aula',
        role: 'student',
        profile: { classroom: 'a'.repeat(51) }
      });
      expect(result.success).toBe(false);
    });

    it('descarta birthdate silenciosamente vía strict (campo extra → rechazo)', () => {
      // El schema es strict, así que un campo extra como birthdate se rechaza.
      const result = createUserSchema.safeParse({
        name: 'Alumno Birthdate',
        role: 'student',
        birthdate: '2015-01-01'
      });
      expect(result.success).toBe(false);
    });

    it('acepta createdBy ObjectId válido', () => {
      const result = createUserSchema.safeParse({
        name: 'Alumno Creado',
        role: 'student',
        createdBy: VALID_OBJECT_ID
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createStudentSchema', () => {
    const buildStudent = () => ({
      name: 'Alumno Test',
      profile: { age: 8 },
      teacherId: VALID_OBJECT_ID,
      consent: { granted: true, grantedBy: 'Tutor Test' }
    });

    it('acepta un alumno válido', () => {
      expect(createStudentSchema.safeParse(buildStudent()).success).toBe(true);
    });

    it('exige age (no opcional aquí)', () => {
      const student = buildStudent();
      delete student.profile.age;
      expect(createStudentSchema.safeParse(student).success).toBe(false);
    });

    it('rechaza consent.granted distinto de true (literal)', () => {
      const student = buildStudent();
      student.consent.granted = false;
      const result = createStudentSchema.safeParse(student);
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /consentimiento parental/.test(i.message))).toBe(true);
    });

    it('rechaza grantedBy demasiado corto', () => {
      const student = buildStudent();
      student.consent.grantedBy = 'A';
      expect(createStudentSchema.safeParse(student).success).toBe(false);
    });

    it('acepta purposes y policyVersion opcionales', () => {
      const student = buildStudent();
      student.consent.purposes = ['educational_tracking', 'performance_analytics'];
      student.consent.policyVersion = 'v1.2';
      expect(createStudentSchema.safeParse(student).success).toBe(true);
    });

    it('rechaza purposes con valor fuera del enum', () => {
      const student = buildStudent();
      student.consent.purposes = ['mining'];
      expect(createStudentSchema.safeParse(student).success).toBe(false);
    });

    it('acepta classroom y avatar opcionales en profile', () => {
      const student = buildStudent();
      student.profile.classroom = '2B';
      student.profile.avatar = 'https://cdn.test/a.png';
      expect(createStudentSchema.safeParse(student).success).toBe(true);
    });
  });

  describe('registerTeacherSchema', () => {
    const valid = { name: 'Profe Reg', email: 'reg@test.com', password: 'Abcd1234' };

    it('acepta registro válido y normaliza email', () => {
      const result = registerTeacherSchema.safeParse({ ...valid, email: 'REG@Test.com' });
      expect(result.success).toBe(true);
      expect(result.data.email).toBe('reg@test.com');
    });

    it('acepta honeypot website vacío', () => {
      expect(registerTeacherSchema.safeParse({ ...valid, website: '' }).success).toBe(true);
    });

    it('rechaza honeypot website con contenido', () => {
      expect(registerTeacherSchema.safeParse({ ...valid, website: 'spam' }).success).toBe(false);
    });

    it('acepta profile.avatar opcional', () => {
      expect(
        registerTeacherSchema.safeParse({ ...valid, profile: { avatar: 'https://cdn/a.png' } })
          .success
      ).toBe(true);
    });

    it('rechaza email faltante (obligatorio para teacher)', () => {
      const noEmail = { name: valid.name, password: valid.password };
      expect(registerTeacherSchema.safeParse(noEmail).success).toBe(false);
    });
  });

  describe('updateUserSchema', () => {
    it('acepta actualización de name', () => {
      expect(updateUserSchema.safeParse({ name: 'Nuevo Nombre' }).success).toBe(true);
    });

    it('acepta actualización de status', () => {
      expect(updateUserSchema.safeParse({ status: 'inactive' }).success).toBe(true);
    });

    it('acepta profile parcial', () => {
      expect(updateUserSchema.safeParse({ profile: { age: 10 } }).success).toBe(true);
    });

    it('rechaza email (mass-assignment, strict)', () => {
      expect(updateUserSchema.safeParse({ email: 'x@test.com' }).success).toBe(false);
    });

    it('rechaza password (strict)', () => {
      expect(updateUserSchema.safeParse({ password: 'Abcd1234' }).success).toBe(false);
    });

    it('rechaza status fuera del enum', () => {
      expect(updateUserSchema.safeParse({ status: 'banned' }).success).toBe(false);
    });

    it('rechaza age fuera de rango en profile', () => {
      expect(updateUserSchema.safeParse({ profile: { age: 1 } }).success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('acepta captchaToken opcional', () => {
      const result = loginSchema.safeParse({
        email: 'a@test.com',
        password: 'x',
        captchaToken: 'tok'
      });
      expect(result.success).toBe(true);
    });

    it('rechaza captchaToken de más de 2048 chars', () => {
      const result = loginSchema.safeParse({
        email: 'a@test.com',
        password: 'x',
        captchaToken: 'a'.repeat(2049)
      });
      expect(result.success).toBe(false);
    });
  });

  describe('userQuerySchema', () => {
    it('aplica default sortBy=createdAt', () => {
      const result = userQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.sortBy).toBe('createdAt');
    });

    it('acepta sortBy=lastLoginAt', () => {
      expect(userQuerySchema.safeParse({ sortBy: 'lastLoginAt' }).success).toBe(true);
    });

    it('acepta filtros role/status/classroom heredados', () => {
      const result = userQuerySchema.safeParse({
        role: 'teacher',
        status: 'active',
        classroom: '1A'
      });
      expect(result.success).toBe(true);
    });

    it('rechaza sortBy desconocido', () => {
      expect(userQuerySchema.safeParse({ sortBy: 'random' }).success).toBe(false);
    });
  });

  describe('transferStudentSchema', () => {
    it('acepta transferencia válida con reason', () => {
      const result = transferStudentSchema.safeParse({
        newTeacherId: VALID_OBJECT_ID,
        newClassroom: '4C',
        reason: 'Cambio de grupo'
      });
      expect(result.success).toBe(true);
    });

    it('acepta sin reason (opcional)', () => {
      expect(
        transferStudentSchema.safeParse({ newTeacherId: VALID_OBJECT_ID, newClassroom: '4C' })
          .success
      ).toBe(true);
    });

    it('rechaza newTeacherId inválido', () => {
      expect(
        transferStudentSchema.safeParse({ newTeacherId: 'bad', newClassroom: '4C' }).success
      ).toBe(false);
    });

    it('rechaza newClassroom vacío (min 1)', () => {
      expect(
        transferStudentSchema.safeParse({ newTeacherId: VALID_OBJECT_ID, newClassroom: '' }).success
      ).toBe(false);
    });

    it('rechaza reason de más de 200 caracteres', () => {
      expect(
        transferStudentSchema.safeParse({
          newTeacherId: VALID_OBJECT_ID,
          newClassroom: '4C',
          reason: 'a'.repeat(201)
        }).success
      ).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(
        transferStudentSchema.safeParse({
          newTeacherId: VALID_OBJECT_ID,
          newClassroom: '4C',
          extra: 1
        }).success
      ).toBe(false);
    });
  });

  describe('params schemas', () => {
    it('userIdParamsSchema acepta ObjectId y rechaza basura', () => {
      expect(userIdParamsSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(userIdParamsSchema.safeParse({ id: 'nope' }).success).toBe(false);
    });

    it('teacherIdParamsSchema acepta ObjectId y rechaza basura', () => {
      expect(teacherIdParamsSchema.safeParse({ teacherId: OTHER_OBJECT_ID }).success).toBe(true);
      expect(teacherIdParamsSchema.safeParse({ teacherId: '1' }).success).toBe(false);
    });
  });

  describe('teacherStudentsQuerySchema', () => {
    it('aplica defaults sortBy=name order=asc', () => {
      const result = teacherStudentsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.sortBy).toBe('name');
      expect(result.data.order).toBe('asc');
    });

    it('acepta classroom y sortBy=createdAt order=desc', () => {
      const result = teacherStudentsQuerySchema.safeParse({
        classroom: '5A',
        sortBy: 'createdAt',
        order: 'desc'
      });
      expect(result.success).toBe(true);
    });

    it('rechaza order desconocido', () => {
      expect(teacherStudentsQuerySchema.safeParse({ order: 'sideways' }).success).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(teacherStudentsQuerySchema.safeParse({ foo: 1 }).success).toBe(false);
    });
  });

  describe('updateConsentSchema (refine grantedBy)', () => {
    it('acepta revocación (granted:false) sin grantedBy', () => {
      expect(updateConsentSchema.safeParse({ granted: false }).success).toBe(true);
    });

    it('rechaza granted:true sin grantedBy (refine) con path correcto', () => {
      const result = updateConsentSchema.safeParse({ granted: true });
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => i.path.includes('grantedBy'))).toBe(true);
    });

    it('acepta policyVersion opcional', () => {
      expect(
        updateConsentSchema.safeParse({ granted: true, grantedBy: 'Tutor', policyVersion: 'v2' })
          .success
      ).toBe(true);
    });
  });

  describe('updateOnboardingSchema', () => {
    it('acepta currentStep válido', () => {
      expect(updateOnboardingSchema.safeParse({ currentStep: 3 }).success).toBe(true);
    });

    it('acepta currentTrack=teacher', () => {
      expect(updateOnboardingSchema.safeParse({ currentTrack: 'teacher' }).success).toBe(true);
    });

    it('acepta currentTrack=null (nullable)', () => {
      expect(updateOnboardingSchema.safeParse({ currentTrack: null }).success).toBe(true);
    });

    it('acepta reset (currentStep:0 + teacherCompleted:false)', () => {
      const result = updateOnboardingSchema.safeParse({
        currentStep: 0,
        teacherCompleted: false
      });
      expect(result.success).toBe(true);
    });

    it('acepta superAdminCompleted boolean', () => {
      expect(updateOnboardingSchema.safeParse({ superAdminCompleted: true }).success).toBe(true);
    });

    it('rechaza currentStep negativo', () => {
      expect(updateOnboardingSchema.safeParse({ currentStep: -1 }).success).toBe(false);
    });

    it('rechaza currentStep > 50', () => {
      expect(updateOnboardingSchema.safeParse({ currentStep: 51 }).success).toBe(false);
    });

    it('rechaza currentStep no entero', () => {
      expect(updateOnboardingSchema.safeParse({ currentStep: 2.5 }).success).toBe(false);
    });

    it('rechaza currentTrack fuera del enum con mensaje custom', () => {
      const result = updateOnboardingSchema.safeParse({ currentTrack: 'student' });
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /teacher o super_admin/.test(i.message))).toBe(true);
    });

    it('rechaza objeto vacío (refine: al menos un campo)', () => {
      const result = updateOnboardingSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /al menos un campo/.test(i.message))).toBe(true);
    });

    it('rechaza campos extra (strict)', () => {
      expect(updateOnboardingSchema.safeParse({ currentStep: 1, hack: true }).success).toBe(false);
    });
  });
});
