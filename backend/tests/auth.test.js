const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');

describe('Authentication Endpoints', () => {
  let teacherToken;
  let teacherUser;

  const validTeacher = {
    name: 'Test Teacher',
    email: 'teacher@test.com',
    password: 'password123',
    role: 'teacher'
  };

  beforeEach(async () => {
    // Clean users collection before each test
    await User.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('should register a new teacher successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validTeacher);

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toHaveProperty('email', validTeacher.email);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should fail to register with existing email', async () => {
      // First registration
      await request(app).post('/api/auth/register').send(validTeacher);

      // Second registration (duplicate)
      const res = await request(app)
        .post('/api/auth/register')
        .send(validTeacher);

      expect(res.statusCode).toEqual(409); // Conflict
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a user for login tests
      const res = await request(app).post('/api/auth/register').send(validTeacher);
      teacherToken = res.body.data.accessToken;
      teacherUser = res.body.data.user;
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: validTeacher.email,
          password: validTeacher.password
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should fail login with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: validTeacher.email,
          password: 'wrongpassword'
        });

      expect(res.statusCode).toEqual(401);
    });
  });

  describe('GET /api/auth/me', () => {
    beforeEach(async () => {
      const res = await request(app).post('/api/auth/register').send(validTeacher);
      teacherToken = res.body.data.accessToken;
    });

    it('should return profile for authenticated user', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data).toHaveProperty('email', validTeacher.email);
    });

    it('should fail for unauthenticated request', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    beforeEach(async () => {
      const res = await request(app).post('/api/auth/register').send(validTeacher);
      teacherToken = res.body.data.accessToken;
    });

    it('should logout successfully', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });

    // NOTA: Este test requiere Redis real para funcionar correctamente.
    // ioredis-mock no comparte estado entre instancias diferentes.
    // Se salta en CI/tests con mock, pero funciona en integración con Redis real.
    it.skip('should invalidate token after logout', async () => {
      // 1. Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${teacherToken}`);

      // 2. Try to access protected route with same token
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.statusCode).toEqual(401);
    });
  });
});
