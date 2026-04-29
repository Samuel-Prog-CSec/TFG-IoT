/**
 * @fileoverview Tests de k-anonimidad en analytics y configuración de protección de datos.
 * Verifica que aulas con menos de MIN_ANALYTICS_GROUP_SIZE (5) estudiantes
 * reciben solo datos agregados para prevenir re-identificación (T-714).
 */

const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const { generateTokenPair } = require('../src/middlewares/auth');
const {
  MIN_ANALYTICS_GROUP_SIZE,
  GAMEPLAY_ANONYMIZATION_MONTHS,
  INACTIVE_STUDENT_DELETION_MONTHS,
  CONSENT_PURPOSES
} = require('../src/config/dataRetention');

describe('K-anonimidad y protección de datos (T-714)', () => {
  let teacherUser, teacherToken;

  const mockReq = {
    headers: {
      'user-agent': 'jest-test',
      'accept-language': 'en',
      'accept-encoding': 'gzip'
    }
  };

  const authHeaders = token => ({
    Authorization: `Bearer ${token}`,
    'User-Agent': 'jest-test',
    'Accept-Language': 'en',
    'Accept-Encoding': 'gzip'
  });

  async function createStudents(teacher, count) {
    const created = [];
    for (let i = 0; i < count; i++) {
      created.push(
        await User.create({
          name: `Alumno KAnon ${i + 1}`,
          role: 'student',
          status: 'active',
          createdBy: teacher._id,
          profile: { age: 5 + (i % 4), classroom: '1A' },
          consent: {
            granted: true,
            grantedBy: 'Tutor Test',
            grantedAt: new Date(),
            purposes: ['educational_tracking', 'performance_analytics'],
            policyVersion: '1.0'
          },
          studentMetrics: {
            totalGamesPlayed: 5 + i,
            totalScore: 300 + i * 50,
            averageScore: 60 + i * 5,
            bestScore: 80 + i * 3,
            totalCorrectAnswers: 15 + i,
            totalErrors: 3 + i,
            averageResponseTime: 3000 + i * 200,
            lastPlayedAt: new Date()
          }
        })
      );
    }
    return created;
  }

  beforeEach(async () => {
    await User.deleteMany({});

    teacherUser = await User.create({
      name: 'Teacher KAnon',
      email: 'teacher.kanon@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved',
      lastLoginAt: new Date()
    });

    teacherToken = (await generateTokenPair(teacherUser, mockReq)).accessToken;
  });

  // ────────────────────────────────────────────────────────────
  // Constantes de configuración
  // ────────────────────────────────────────────────────────────

  describe('constantes de dataRetention', () => {
    it('MIN_ANALYTICS_GROUP_SIZE es 5 (umbral k-anonimidad AEPD)', () => {
      expect(MIN_ANALYTICS_GROUP_SIZE).toBe(5);
    });

    it('GamePlays se anonimizan a los 12 meses', () => {
      expect(GAMEPLAY_ANONYMIZATION_MONTHS).toBe(12);
    });

    it('estudiantes inactivos se eliminan a los 24 meses', () => {
      expect(INACTIVE_STUDENT_DELETION_MONTHS).toBe(24);
    });

    it('propósitos de consentimiento son educational_tracking y performance_analytics', () => {
      expect(CONSENT_PURPOSES).toEqual(['educational_tracking', 'performance_analytics']);
    });
  });

  // ────────────────────────────────────────────────────────────
  // K-anonimidad en endpoint de students
  // ────────────────────────────────────────────────────────────

  describe('GET /api/analytics/classroom/students — k-anonimidad', () => {
    it(`devuelve aggregatedOnly para aulas con menos de ${MIN_ANALYTICS_GROUP_SIZE} estudiantes`, async () => {
      await createStudents(teacherUser, 3);

      const res = await request(app)
        .get('/api/analytics/classroom/students')
        .set(authHeaders(teacherToken));

      expect(res.status).toBe(200);

      const payload = res.body.data || res.body;
      expect(payload.aggregatedOnly).toBe(true);
      expect(payload.aggregatedMetrics).toBeDefined();
      expect(payload.aggregatedMetrics.totalGames).toBeDefined();
      expect(payload.aggregatedMetrics.averageScore).toBeDefined();
      // No debe incluir lista individual
      expect(payload.students).toBeUndefined();
    });

    it(`devuelve datos individuales para aulas con ${MIN_ANALYTICS_GROUP_SIZE}+ estudiantes`, async () => {
      await createStudents(teacherUser, MIN_ANALYTICS_GROUP_SIZE);

      const res = await request(app)
        .get('/api/analytics/classroom/students')
        .set(authHeaders(teacherToken));

      expect(res.status).toBe(200);

      const payload = res.body.data || res.body;
      expect(payload.aggregatedOnly).toBeUndefined();
      expect(payload.students).toBeDefined();
      expect(payload.students.length).toBe(MIN_ANALYTICS_GROUP_SIZE);
    });

    it('devuelve lista vacía si el profesor no tiene alumnos', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/students')
        .set(authHeaders(teacherToken));

      expect(res.status).toBe(200);

      const payload = res.body.data || res.body;
      // Sin alumnos: no se activa k-anonimidad (length === 0), devuelve objeto con students vacío
      expect(payload.students).toBeDefined();
      expect(payload.students).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Módulos de seguridad
  // ────────────────────────────────────────────────────────────

  describe('módulos de seguridad', () => {
    it('securityLogger carga correctamente', () => {
      const { logSecurityEvent, getRequestContext } = require('../src/utils/securityLogger');
      expect(typeof logSecurityEvent).toBe('function');
      expect(typeof getRequestContext).toBe('function');
    });

    it('pseudonymize produce hash determinista de longitud fija', () => {
      const { pseudonymize, PSEUDO_ID_LENGTH } = require('../src/utils/pseudonymize');
      const result = pseudonymize('507f1f77bcf86cd799439011');
      expect(result).toHaveLength(PSEUDO_ID_LENGTH);
      expect(pseudonymize('507f1f77bcf86cd799439011')).toBe(result);
      expect(pseudonymize(null)).toBeNull();
    });
  });
});
