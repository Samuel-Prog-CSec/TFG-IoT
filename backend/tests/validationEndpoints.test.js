const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');

const fingerprintHeaders = {
  'User-Agent': 'jest-test',
  'Accept-Language': 'en',
  'Accept-Encoding': 'gzip'
};

const makeAuthHeaders = token => ({
  Authorization: `Bearer ${token}`,
  ...fingerprintHeaders
});

const loginUser = async ({ email, password }) => {
  const res = await request(app)
    .post('/api/auth/login')
    .set(fingerprintHeaders)
    .send({ email, password });

  expect(res.statusCode).toBe(200);
  return res.body.data.accessToken;
};

describe('Validation (Zod) - All API endpoints', () => {
  let teacherToken;
  let superAdminToken;

  beforeEach(async () => {
    await User.deleteMany({});

    await User.create({
      name: 'Teacher Validations',
      email: 'teacher.validations@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    await User.create({
      name: 'Super Admin',
      email: 'super.admin@test.com',
      password: 'Password123',
      role: 'super_admin',
      status: 'active',
      accountStatus: 'approved'
    });

    teacherToken = await loginUser({
      email: 'teacher.validations@test.com',
      password: 'Password123'
    });

    superAdminToken = await loginUser({
      email: 'super.admin@test.com',
      password: 'Password123'
    });
  });

  describe('Auth routes', () => {
    it('POST /api/auth/register - invalid body', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set(fingerprintHeaders)
        .send({ name: 'No email' });

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/auth/login - invalid body', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set(fingerprintHeaders)
        .send({ email: 'bad' });

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/auth/me - invalid query', async () => {
      const res = await request(app)
        .get('/api/auth/me?unexpected=1')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('PUT /api/auth/me - empty body', async () => {
      const res = await request(app)
        .put('/api/auth/me')
        .set(makeAuthHeaders(teacherToken))
        .send({});

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/auth/refresh - rejects refreshToken in body', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set(fingerprintHeaders)
        .send({ refreshToken: 'legacy-token' });

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/auth/logout - invalid query', async () => {
      const res = await request(app)
        .post('/api/auth/logout?extra=1')
        .set(makeAuthHeaders(teacherToken))
        .send({});

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Users routes', () => {
    it('GET /api/users - invalid query', async () => {
      const res = await request(app).get('/api/users?limit=0').set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/users/:id - invalid params', async () => {
      const res = await request(app)
        .get('/api/users/invalid-id')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/users - invalid body (student schema)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set(makeAuthHeaders(superAdminToken))
        .send({ name: 'Student', email: 'not-allowed@test.com' });

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/users/:id/transfer - invalid body', async () => {
      const res = await request(app)
        .post('/api/users/507f1f77bcf86cd799439011/transfer')
        .set(makeAuthHeaders(superAdminToken))
        .send({ newTeacherId: 'bad' });

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/users - rejects NoSQL operator payload', async () => {
      const res = await request(app)
        .post('/api/users')
        .set(makeAuthHeaders(superAdminToken))
        .send({
          name: 'Alumno Seguro',
          profile: { classroom: '1A' },
          $where: 'this.role === "teacher"'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/política de seguridad/i);
    });

    it('POST /api/users - rejects constructor.prototype payload', async () => {
      const maliciousPayload = JSON.parse(
        '{"name":"Alumno Seguro","profile":{"classroom":"1A"},"constructor":{"prototype":{"polluted":true}}}'
      );

      const res = await request(app)
        .post('/api/users')
        .set(makeAuthHeaders(superAdminToken))
        .send(maliciousPayload);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/política de seguridad/i);
    });
  });

  describe('Cards routes', () => {
    it('GET /api/cards - invalid query', async () => {
      const res = await request(app).get('/api/cards?limit=0').set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/cards/stats - invalid query', async () => {
      const res = await request(app)
        .get('/api/cards/stats?extra=1')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/cards/:id - invalid params', async () => {
      const res = await request(app).get('/api/cards/not-valid').set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/cards - invalid body', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set(makeAuthHeaders(teacherToken))
        .send({ uid: '123' });

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/cards/batch - invalid body', async () => {
      const res = await request(app)
        .post('/api/cards/batch')
        .set(makeAuthHeaders(teacherToken))
        .send({ cards: [] });

      expect(res.statusCode).toBe(400);
    });

    it('PUT /api/cards/:id - invalid params', async () => {
      const res = await request(app)
        .put('/api/cards/invalid')
        .set(makeAuthHeaders(teacherToken))
        .send({ status: 'active' });

      expect(res.statusCode).toBe(400);
    });

    it('DELETE /api/cards/:id - invalid params', async () => {
      const res = await request(app)
        .delete('/api/cards/invalid')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Mechanics routes', () => {
    it('GET /api/mechanics - invalid query', async () => {
      const res = await request(app)
        .get('/api/mechanics?sortBy=unknown')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/mechanics/:id - invalid params', async () => {
      const res = await request(app)
        .get('/api/mechanics/Invalid Name')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/mechanics - invalid body', async () => {
      const res = await request(app)
        .post('/api/mechanics')
        .set(makeAuthHeaders(teacherToken))
        .send({});

      expect(res.statusCode).toBe(400);
    });

    it('PUT /api/mechanics/:id - invalid params', async () => {
      const res = await request(app)
        .put('/api/mechanics/invalid')
        .set(makeAuthHeaders(teacherToken))
        .send({ displayName: 'Test' });

      expect(res.statusCode).toBe(400);
    });

    it('DELETE /api/mechanics/:id - invalid params', async () => {
      const res = await request(app)
        .delete('/api/mechanics/invalid')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Contexts routes', () => {
    it('GET /api/contexts - invalid query', async () => {
      const res = await request(app)
        .get('/api/contexts?limit=0')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/contexts/:id - invalid params', async () => {
      const res = await request(app)
        .get('/api/contexts/Invalid Id')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/contexts - invalid body', async () => {
      const res = await request(app)
        .post('/api/contexts')
        .set(makeAuthHeaders(teacherToken))
        .send({ contextId: 'geo' });

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/contexts/:id/assets - invalid body', async () => {
      const res = await request(app)
        .post('/api/contexts/507f1f77bcf86cd799439011/assets')
        .set(makeAuthHeaders(teacherToken))
        .send({ key: 'spain' });

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/contexts/upload-config - invalid query', async () => {
      const res = await request(app)
        .get('/api/contexts/upload-config?x=1')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/contexts/:id/images - invalid params', async () => {
      const res = await request(app)
        .post('/api/contexts/invalid/images')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/contexts/:id/audio - invalid params', async () => {
      const res = await request(app)
        .post('/api/contexts/invalid/audio')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('DELETE /api/contexts/:id/assets/:assetKey - invalid assetKey', async () => {
      const res = await request(app)
        .delete('/api/contexts/507f1f77bcf86cd799439011/assets/Invalid Key')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Sessions routes', () => {
    it('GET /api/sessions - invalid query', async () => {
      const res = await request(app)
        .get('/api/sessions?limit=0')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/sessions/:id - invalid params', async () => {
      const res = await request(app)
        .get('/api/sessions/invalid')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/sessions - invalid body', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .set(makeAuthHeaders(teacherToken))
        .send({ mechanicId: 'bad' });

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/sessions/:id/start - invalid params', async () => {
      const res = await request(app)
        .post('/api/sessions/invalid/start')
        .set(makeAuthHeaders(teacherToken))
        .send({});

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/sessions/:id/end - invalid params', async () => {
      const res = await request(app)
        .post('/api/sessions/invalid/end')
        .set(makeAuthHeaders(teacherToken))
        .send({});

      expect(res.statusCode).toBe(400);
    });

    it('PUT /api/sessions/:id - invalid body', async () => {
      const res = await request(app)
        .put('/api/sessions/507f1f77bcf86cd799439011')
        .set(makeAuthHeaders(teacherToken))
        .send({});

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Plays routes', () => {
    it('GET /api/plays - invalid query', async () => {
      const res = await request(app).get('/api/plays?limit=0').set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/plays/:id - invalid params', async () => {
      const res = await request(app).get('/api/plays/invalid').set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/plays - invalid body', async () => {
      const res = await request(app).post('/api/plays').set(makeAuthHeaders(teacherToken)).send({});

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/plays/:id/events - invalid body', async () => {
      const res = await request(app)
        .post('/api/plays/507f1f77bcf86cd799439011/events')
        .set(makeAuthHeaders(teacherToken))
        .send({});

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/plays/:id/complete - invalid params', async () => {
      const res = await request(app)
        .post('/api/plays/invalid/complete')
        .set(makeAuthHeaders(teacherToken))
        .send({});

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/plays/:id/pause - invalid params', async () => {
      const res = await request(app)
        .post('/api/plays/invalid/pause')
        .set(makeAuthHeaders(teacherToken))
        .send({});

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/plays/stats/:playerId - invalid params', async () => {
      const res = await request(app)
        .get('/api/plays/stats/invalid')
        .set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/plays/:id/abandon - invalid params', async () => {
      const res = await request(app)
        .post('/api/plays/invalid/abandon')
        .set(makeAuthHeaders(teacherToken))
        .send({});

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/plays/:id/resume - invalid params', async () => {
      const res = await request(app)
        .post('/api/plays/invalid/resume')
        .set(makeAuthHeaders(teacherToken))
        .send({});

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Decks routes', () => {
    it('GET /api/decks - invalid query', async () => {
      const res = await request(app).get('/api/decks?limit=0').set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/decks - invalid body', async () => {
      const res = await request(app)
        .post('/api/decks')
        .set(makeAuthHeaders(teacherToken))
        .send({ name: 'Deck' });

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/decks/:id - invalid params', async () => {
      const res = await request(app).get('/api/decks/invalid').set(makeAuthHeaders(teacherToken));

      expect(res.statusCode).toBe(400);
    });

    it('PUT /api/decks/:id - invalid body', async () => {
      const res = await request(app)
        .put('/api/decks/507f1f77bcf86cd799439011')
        .set(makeAuthHeaders(teacherToken))
        .send({});

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Admin routes', () => {
    it('POST /api/admin/users/:id/approve - invalid params', async () => {
      const res = await request(app)
        .post('/api/admin/users/invalid/approve')
        .set(makeAuthHeaders(superAdminToken));

      expect(res.statusCode).toBe(400);
    });

    it('POST /api/admin/users/:id/reject - invalid params', async () => {
      const res = await request(app)
        .post('/api/admin/users/invalid/reject')
        .set(makeAuthHeaders(superAdminToken));

      expect(res.statusCode).toBe(400);
    });
  });
});
