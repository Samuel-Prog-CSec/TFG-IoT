/**
 * @fileoverview Tests de /api/admin/analytics/overview (T-942 Fase B).
 *
 * Cubre autorización por rol y verificación del shape básico.
 */

const request = require('supertest');
const { app } = require('../../src/server');
const User = require('../../src/models/User');
const { generateTokenPair } = require('../../src/middlewares/auth');

const mockReq = {
  headers: {
    'user-agent': 'jest-test',
    'accept-language': 'en',
    'accept-encoding': 'gzip'
  }
};

const fingerprintHeaders = {
  'User-Agent': 'jest-test',
  'Accept-Language': 'en',
  'Accept-Encoding': 'gzip'
};

describe('GET /api/admin/analytics/overview (T-942)', () => {
  let teacherToken;
  let superAdminToken;

  beforeEach(async () => {
    await User.deleteMany({});

    const teacher = await User.create({
      name: 'Teacher Test',
      email: 'teacher-admin-overview@test.com',
      password: 'Password123',
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });
    const superAdmin = await User.create({
      name: 'Super Admin',
      email: 'admin-overview@test.com',
      password: 'Admin1234!',
      role: 'super_admin',
      accountStatus: 'approved',
      status: 'active'
    });

    [teacherToken, superAdminToken] = await Promise.all([
      generateTokenPair(teacher, mockReq).then(t => t.accessToken),
      generateTokenPair(superAdmin, mockReq).then(t => t.accessToken)
    ]);
  });

  it('responde 401 sin autenticación', async () => {
    const res = await request(app).get('/api/admin/analytics/overview');
    expect(res.statusCode).toBe(401);
  });

  it('responde 403 cuando el caller es teacher (no super_admin)', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/overview')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders);
    expect(res.statusCode).toBe(403);
  });

  it('responde 200 al super_admin y devuelve el agregado con el shape esperado', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/overview?timeRange=7d')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set(fingerprintHeaders);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        timeRange: '7d',
        users: expect.objectContaining({
          totalStudents: expect.any(Number),
          totalTeachers: expect.any(Number),
          activeTeachers: expect.any(Number),
          pendingTeachers: expect.any(Number)
        }),
        activity: expect.objectContaining({
          totalPlaysInRange: expect.any(Number),
          avgScoreInRange: expect.any(Number),
          playsToday: expect.any(Number),
          playsByMechanic: expect.any(Array)
        }),
        content: expect.objectContaining({
          totalDecks: expect.any(Number),
          totalSessions: expect.any(Number),
          activeSessions: expect.any(Number),
          totalContexts: expect.any(Number),
          totalMechanics: expect.any(Number)
        }),
        alerts: expect.objectContaining({
          totalCriticalActive: expect.any(Number),
          byTeacher: expect.any(Array)
        }),
        topTeachers: expect.any(Array),
        topMechanics: expect.any(Array),
        topContexts: expect.any(Array)
      })
    );
  });
});
