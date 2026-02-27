const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const { generateTokenPair } = require('../src/middlewares/auth');

describe('Student Transfer', () => {
  let teacherA, teacherB, teacherC, admin, student;
  let tokenA, tokenB, tokenC, adminToken;

  const mockTeacher = (name, email) => ({
    name,
    email,
    password: 'Password123',
    role: 'teacher',
    status: 'active'
  });

  beforeEach(async () => {
    await User.deleteMany({});

    // Create teachers
    teacherA = await User.create(mockTeacher('Teacher A', 'a@test.com'));
    teacherB = await User.create(mockTeacher('Teacher B', 'b@test.com'));
    teacherC = await User.create(mockTeacher('Teacher C', 'c@test.com'));
    admin = await User.create({
      name: 'Admin',
      email: 'admin.transfer@test.com',
      password: 'Password123',
      role: 'super_admin',
      status: 'active'
    });

    // Create student owned by A
    student = await User.create({
      name: 'Student S',
      role: 'student',
      createdBy: teacherA._id,
      status: 'active',
      profile: { classroom: 'Class A' }
    });

    // Generate tokens
    const mockReq = {
      headers: {
        'user-agent': 'test',
        'accept-language': 'en',
        'accept-encoding': 'gzip'
      }
    };
    tokenA = (await generateTokenPair(teacherA, mockReq)).accessToken;
    tokenB = (await generateTokenPair(teacherB, mockReq)).accessToken;
    tokenC = (await generateTokenPair(teacherC, mockReq)).accessToken;
    adminToken = (await generateTokenPair(admin, mockReq)).accessToken;
  });

  it('should allow Super Admin to transfer student from Teacher A to Teacher B', async () => {
    const res = await request(app)
      .post(`/api/users/${student._id}/transfer`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', 'test')
      .set('Accept-Language', 'en')
      .set('Accept-Encoding', 'gzip')
      .send({
        newTeacherId: teacherB._id,
        newClassroom: 'Class B'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.profile.classroom).toBe('Class B');

    // Verify DB
    const updatedStudent = await User.findById(student._id);
    expect(updatedStudent.createdBy.toString()).toBe(teacherB._id.toString());
    expect(updatedStudent.profile.classroom).toBe('Class B');
  });

  it('should NOT allow Teacher A (former owner) to transfer access anymore (403)', async () => {
    const res = await request(app)
      .post(`/api/users/${student._id}/transfer`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('User-Agent', 'test')
      .set('Accept-Language', 'en')
      .set('Accept-Encoding', 'gzip')
      .send({
        newTeacherId: teacherB._id,
        newClassroom: 'Class B'
      });

    expect(res.statusCode).toBe(403);
  });

  it('should NOT allow Teacher C to steal Student (403 Forbidden)', async () => {
    const res = await request(app)
      .post(`/api/users/${student._id}/transfer`)
      .set('Authorization', `Bearer ${tokenC}`)
      .set('User-Agent', 'test')
      .set('Accept-Language', 'en')
      .set('Accept-Encoding', 'gzip')
      .send({
        newTeacherId: teacherC._id, // Trying to steal
        newClassroom: 'Class C'
      });

    expect(res.statusCode).toBe(403);
  });

  it('should NOT allow Teacher B (future owner) to claim Student prematurely', async () => {
    const res = await request(app)
      .post(`/api/users/${student._id}/transfer`)
      .set('Authorization', `Bearer ${tokenB}`) // Not owner yet
      .set('User-Agent', 'test')
      .set('Accept-Language', 'en')
      .set('Accept-Encoding', 'gzip')
      .send({
        newTeacherId: teacherB._id,
        newClassroom: 'Class B'
      });

    expect(res.statusCode).toBe(403);
  });

  it('should fail if new teacher does not exist', async () => {
    const res = await request(app)
      .post(`/api/users/${student._id}/transfer`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', 'test')
      .set('Accept-Language', 'en')
      .set('Accept-Encoding', 'gzip')
      .send({
        newTeacherId: new User()._id, // Random ID
        newClassroom: 'Class X'
      });

    expect(res.statusCode).toBe(400);
  });

  it('should fail if payload is missing', async () => {
    const res = await request(app)
      .post(`/api/users/${student._id}/transfer`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', 'test')
      .set('Accept-Language', 'en')
      .set('Accept-Encoding', 'gzip')
      .send({}); // Empty body

    expect(res.statusCode).toBe(400);
  });
});
