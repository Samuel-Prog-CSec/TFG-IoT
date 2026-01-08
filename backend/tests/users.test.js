const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const { generateTokenPair } = require('../src/middlewares/auth');

describe('User Management Endpoints', () => {
  let teacherToken;
  let teacherUser;
  let studentUser;

  const validTeacher = {
    name: 'Teacher User',
    email: 'teacher.crud@test.com',
    password: 'password123',
    role: 'teacher',
    status: 'active'
  };

  beforeAll(async () => {
    // Create teacher once for the suite?
    // Better to do it in beforeEach to avoid state pollution,
    // but if we use beforeAll we must ensure cleanup.
    // We rely on setup.js clearing DB? No, setup.js is generic.
    // Let's rely on beforeEach clearing DB.
  });

  beforeEach(async () => {
    await User.deleteMany({});

    // Create teacher manually to bypass auth middleware restrictions for registration if any
    teacherUser = await User.create(validTeacher);

    // Generate token - generateTokenPair es async, necesita await
    // Mock request object con headers para fingerprint
    const mockReq = {
      headers: {
        'user-agent': 'jest-test',
        'accept-language': 'en',
        'accept-encoding': 'gzip'
      }
    };
    teacherToken = (await generateTokenPair(teacherUser, mockReq)).accessToken;
  });

  describe('POST /api/users (Create Student)', () => {
    const newStudent = {
      name: 'Student One',
      profile: { classroom: '1A' }
    };

    it('should create a student successfully as teacher', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('User-Agent', 'jest-test') // Must match fingerprint
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip')
        .send(newStudent);

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(newStudent.name);
      expect(res.body.data.role).toBe('student');
    });

    it('should fail if creating student with same name and classroom', async () => {
      // Create first
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip')
        .send(newStudent);

      // Create second
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip')
        .send(newStudent);

      expect(res.statusCode).toEqual(409);
    });
  });

  describe('GET /api/users', () => {
    beforeEach(async () => {
      // Create some students
      await User.create({
        name: 'S1',
        role: 'student',
        createdBy: teacherUser._id,
        status: 'active'
      });
      await User.create({
        name: 'S2',
        role: 'student',
        createdBy: teacherUser._id,
        status: 'active'
      });
    });

    it('should list all students for the teacher', async () => {
      const res = await request(app)
        .get('/api/users?role=student')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.statusCode).toEqual(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('DELETE /api/users/:id', () => {
    let studentId;
    beforeEach(async () => {
      const s = await User.create({
        name: 'To Delete',
        role: 'student',
        createdBy: teacherUser._id,
        status: 'active'
      });
      studentId = s._id;
    });

    it('should soft delete a student', async () => {
      const res = await request(app)
        .delete(`/api/users/${studentId}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.statusCode).toEqual(200);

      // Verify in DB
      const deletedUser = await User.findById(studentId);
      expect(deletedUser.status).toBe('inactive');
    });
  });
});
