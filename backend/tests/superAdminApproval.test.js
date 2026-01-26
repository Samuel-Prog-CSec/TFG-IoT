const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');

describe('Super Admin Approval Flow', () => {
  let superAdminToken;

  const loginSuperAdmin = async () => {
    await User.create({
      name: 'Super Admin',
      email: 'superadmin@test.com',
      password: 'Admin1234!',
      role: 'super_admin',
      accountStatus: 'approved',
      status: 'active'
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'superadmin@test.com',
      password: 'Admin1234!'
    });

    expect(res.statusCode).toBe(200);
    return res.body.data.accessToken;
  };

  beforeEach(async () => {
    await User.deleteMany({});
    superAdminToken = await loginSuperAdmin();
  });

  it('should allow super_admin to approve a pending teacher, enabling login', async () => {
    const registerRes = await request(app).post('/api/auth/register').send({
      name: 'Pending Teacher',
      email: 'pending-teacher@test.com',
      password: 'Password123'
    });

    expect(registerRes.statusCode).toBe(201);

    const teacher = await User.findOne({ email: 'pending-teacher@test.com' });
    expect(teacher.accountStatus).toBe('pending_approval');

    const approveRes = await request(app)
      .post(`/api/admin/users/${teacher._id}/approve`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.body.data.user).toHaveProperty('accountStatus', 'approved');

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'pending-teacher@test.com',
      password: 'Password123'
    });

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body.data).toHaveProperty('accessToken');
  });

  it('should allow super_admin to reject a pending teacher, blocking login', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Rejected Teacher',
      email: 'rejected-teacher@test.com',
      password: 'Password123'
    });

    const teacher = await User.findOne({ email: 'rejected-teacher@test.com' });

    const rejectRes = await request(app)
      .post(`/api/admin/users/${teacher._id}/reject`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(rejectRes.statusCode).toBe(200);
    expect(rejectRes.body.data.user).toHaveProperty('accountStatus', 'rejected');

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'rejected-teacher@test.com',
      password: 'Password123'
    });

    expect(loginRes.statusCode).toBe(403);
  });

  it('should forbid teacher from approving/rejecting users', async () => {
    const approvedTeacher = await User.create({
      name: 'Teacher',
      email: 'teacher@test.com',
      password: 'Password123',
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });

    const teacherLoginRes = await request(app).post('/api/auth/login').send({
      email: 'teacher@test.com',
      password: 'Password123'
    });

    expect(teacherLoginRes.statusCode).toBe(200);
    const teacherToken = teacherLoginRes.body.data.accessToken;

    const target = await User.create({
      name: 'Another Teacher',
      email: 'another@test.com',
      password: 'Password123',
      role: 'teacher',
      accountStatus: 'pending_approval',
      status: 'active'
    });

    const res = await request(app)
      .post(`/api/admin/users/${target._id}/approve`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body).toHaveProperty('message');

    // sanity: creator teacher isn't used; keep reference to avoid lint
    expect(approvedTeacher).toBeTruthy();
  });

  it('should not allow approving a student or a super_admin', async () => {
    const teacher = await User.create({
      name: 'Teacher Creator',
      email: 'creator@test.com',
      password: 'Password123',
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });

    const student = await User.create({
      name: 'Student',
      role: 'student',
      status: 'active',
      createdBy: teacher._id,
      profile: { age: 5, classroom: 'A' }
    });

    const anotherSuperAdmin = await User.create({
      name: 'Another Super Admin',
      email: 'another-superadmin@test.com',
      password: 'Admin1234!',
      role: 'super_admin',
      accountStatus: 'approved',
      status: 'active'
    });

    const approveStudentRes = await request(app)
      .post(`/api/admin/users/${student._id}/approve`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(approveStudentRes.statusCode).toBe(400);

    const approveSuperAdminRes = await request(app)
      .post(`/api/admin/users/${anotherSuperAdmin._id}/approve`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(approveSuperAdminRes.statusCode).toBe(400);
  });
});
