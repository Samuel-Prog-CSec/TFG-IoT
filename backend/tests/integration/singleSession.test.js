const request = require('supertest');
const { app } = require('../../src/server');
const User = require('../../src/models/User');

describe('Single Session Enforcement', () => {
  let superAdminToken;
  const teacherCreds = {
    name: 'Session Teacher',
    email: 'session_teacher@test.com',
    password: 'Password123'
  };

  const createAndLoginSuperAdmin = async () => {
    await User.create({
      name: 'Super Admin',
      email: 'superadmin@test.com',
      password: 'Admin1234!',
      role: 'super_admin',
      accountStatus: 'approved',
      status: 'active'
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'superadmin@test.com',
      password: 'Admin1234!'
    });

    return loginRes.body.data.accessToken;
  };

  beforeEach(async () => {
    await User.deleteMany({});
    superAdminToken = await createAndLoginSuperAdmin();

    // Create and approve teacher
    const regRes = await request(app).post('/api/auth/register').send(teacherCreds);
    const teacherId = regRes.body.data.user.id; // UserDTO uses id, not _id

    await request(app)
      .post(`/api/admin/users/${teacherId}/approve`)
      .set('Authorization', `Bearer ${superAdminToken}`);
  });

  it('should invalidate first session after second login', async () => {
    // 1. First Login
    const login1 = await request(app).post('/api/auth/login').send({
      email: teacherCreds.email,
      password: teacherCreds.password
    });
    expect(login1.statusCode).toBe(200);
    const token1 = login1.body.data.accessToken;

    // Verify token1 works
    const check1 = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token1}`);
    expect(check1.statusCode).toBe(200);

    // 2. Second Login (Same user, different "device")
    const login2 = await request(app).post('/api/auth/login').send({
      email: teacherCreds.email,
      password: teacherCreds.password
    });
    expect(login2.statusCode).toBe(200);
    const token2 = login2.body.data.accessToken;

    // Verify token2 works
    const check2 = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token2}`);
    expect(check2.statusCode).toBe(200);

    // 3. Verify token1 is now INVALID
    const check1Again = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token1}`);
    expect(check1Again.statusCode).toBe(401);
    expect(check1Again.body.message).toMatch(/expirado|inicia sesión/i);
  });

  it('should invalidate refresh token from first session', async () => {
    // 1. First Login
    const login1 = await request(app).post('/api/auth/login').send({
      email: teacherCreds.email,
      password: teacherCreds.password
    });
    const refreshCookie1 = login1.headers['set-cookie']?.find(cookie =>
      cookie.startsWith('refreshToken=')
    );
    expect(refreshCookie1).toBeTruthy();

    // 2. Second Login
    await request(app).post('/api/auth/login').send({
      email: teacherCreds.email,
      password: teacherCreds.password
    });

    // 3. Try access token refresh with cookie from first session
    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie1);

    // Should fail because session ID in refreshToken1 mismatch user.currentSessionId
    expect(refreshRes.statusCode).toBe(401);
  });
});
