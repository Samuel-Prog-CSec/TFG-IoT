const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const { generateTokenPair } = require('../src/middlewares/auth');

describe('User Management Endpoints', () => {
  let teacherToken;
  let teacherUser;
  let adminToken;
  let adminUser;

  const validAdmin = {
    name: 'Admin User',
    email: 'admin.crud@test.com',
    password: 'Password123',
    role: 'super_admin',
    status: 'active'
  };

  const validTeacher = {
    name: 'Teacher User',
    email: 'teacher.crud@test.com',
    password: 'Password123',
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

    // Create users
    teacherUser = await User.create(validTeacher);
    adminUser = await User.create(validAdmin);

    // Common request for fingerprint
    const mockReq = {
      headers: {
        'user-agent': 'jest-test',
        'accept-language': 'en',
        'accept-encoding': 'gzip'
      }
    };

    teacherToken = (await generateTokenPair(teacherUser, mockReq)).accessToken;
    adminToken = (await generateTokenPair(adminUser, mockReq)).accessToken;
  });

  describe('POST /api/users (Create Student)', () => {
    const newStudent = {
      name: 'Student One',
      profile: { classroom: '1A', age: 6 }
    };

    it('should create a student successfully as admin', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip')
        .send({ ...newStudent, teacherId: teacherUser._id });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(newStudent.name);
      expect(res.body.data.role).toBe('student');
    });

    it('should fail to create a student as teacher (Forbidden)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip')
        .send(newStudent);

      expect(res.statusCode).toEqual(403);
    });

    it('should fail if creating student with same name and classroom', async () => {
      // Create first
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip')
        .send({ ...newStudent, teacherId: teacherUser._id });

      // Create second
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip')
        .send({ ...newStudent, teacherId: teacherUser._id });

      expect(res.statusCode).toEqual(409);
    });

    it('should fail if creating student without age', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip')
        .send({
          name: 'Student Without Age',
          profile: { classroom: '1A' },
          teacherId: teacherUser._id
        });

      expect(res.statusCode).toEqual(400);
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
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination).toHaveProperty('page');
      expect(res.body.pagination).toHaveProperty('hasNext');
      expect(res.body.pagination).toHaveProperty('hasPrev');
      expect(res.body.data[0]).not.toHaveProperty('password');
      expect(res.body.data[0]).not.toHaveProperty('__v');
    });
  });

  describe('GET /api/users/:id', () => {
    it('should not expose password or __v', async () => {
      const student = await User.create({
        name: 'Student Safe',
        role: 'student',
        createdBy: teacherUser._id,
        status: 'active'
      });

      const res = await request(app)
        .get(`/api/users/${student._id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.statusCode).toEqual(200);
      expect(res.body.data).not.toHaveProperty('password');
      expect(res.body.data).not.toHaveProperty('__v');
    });
  });

  describe('GET /api/users/teacher/:teacherId/students', () => {
    let studentOne;

    beforeEach(async () => {
      studentOne = await User.create({
        name: 'Student T1',
        role: 'student',
        createdBy: teacherUser._id,
        status: 'active',
        profile: { classroom: 'A1', age: 6 }
      });

      await User.create({
        name: 'Student T2',
        role: 'student',
        createdBy: teacherUser._id,
        status: 'active',
        profile: { classroom: 'B1', age: 7 }
      });
    });

    it('should allow teacher to list own students', async () => {
      const res = await request(app)
        .get(`/api/users/teacher/${teacherUser._id}/students`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).not.toHaveProperty('password');
    });

    it('should allow super_admin to list students of any teacher', async () => {
      const res = await request(app)
        .get(`/api/users/teacher/${teacherUser._id}/students?classroom=A1`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toHaveProperty('id', studentOne._id.toString());
    });

    it('should deny teacher trying to list students from another teacher', async () => {
      const anotherTeacher = await User.create({
        name: 'Another Teacher',
        email: 'another-teacher@test.com',
        password: 'Password123',
        role: 'teacher',
        status: 'active'
      });

      const res = await request(app)
        .get(`/api/users/teacher/${anotherTeacher._id}/students`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.statusCode).toEqual(403);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should reject createdBy update in generic endpoint as admin', async () => {
      const student = await User.create({
        name: 'Student Ownership',
        role: 'student',
        createdBy: teacherUser._id,
        status: 'active',
        profile: { classroom: 'A1' }
      });

      const res = await request(app)
        .put(`/api/users/${student._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip')
        .send({ createdBy: new User()._id.toString() });

      expect(res.statusCode).toBe(400);
    });

    it('should fail to update student as teacher (Forbidden)', async () => {
      const student = await User.create({
        name: 'Student Forbidden Update',
        role: 'student',
        createdBy: teacherUser._id,
        status: 'active'
      });

      const res = await request(app)
        .put(`/api/users/${student._id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip')
        .send({ name: 'New Name' });

      expect(res.statusCode).toBe(403);
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

    it('should soft delete a student as admin', async () => {
      const res = await request(app)
        .delete(`/api/users/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.statusCode).toEqual(200);

      // Verify in DB
      const deletedUser = await User.findById(studentId);
      expect(deletedUser.status).toBe('inactive');
    });

    it('should fail to delete student as teacher (Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/users/${studentId}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.statusCode).toEqual(403);
    });
  });
});
