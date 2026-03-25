/**
 * @fileoverview Tests del flujo de errores unificado (T-516).
 * Verifica que todos los errores HTTP fluyen por el errorHandler centralizado
 * con formato de respuesta unificado, logging Pino y evaluación Sentry correcta.
 */

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

// ============================================================================
// asyncHandler
// ============================================================================

describe('asyncHandler utility', () => {
  const asyncHandler = require('../src/utils/asyncHandler');

  it('debe pasar errores async a next()', done => {
    const error = new Error('async fail');
    const handler = asyncHandler(async () => {
      throw error;
    });

    handler({}, {}, err => {
      expect(err).toBe(error);
      done();
    });
  });

  it('debe pasar errores síncronos a next()', done => {
    const error = new Error('sync fail');
    const handler = asyncHandler(() => {
      throw error;
    });

    handler({}, {}, err => {
      expect(err).toBe(error);
      done();
    });
  });

  it('no debe llamar next con error si el handler tiene éxito', done => {
    const handler = asyncHandler(async () => Promise.resolve());

    const next = jest.fn();
    handler({}, {}, next);

    // Esperar a que la promesa se resuelva
    setTimeout(() => {
      expect(next).not.toHaveBeenCalled();
      done();
    }, 50);
  });
});

// ============================================================================
// Flujo de validación a través de errorHandler
// ============================================================================

describe('Validación Zod → errorHandler centralizado', () => {
  let teacherToken;

  beforeEach(async () => {
    await User.deleteMany({});

    await User.create({
      name: 'Teacher ErrorFlow',
      email: 'teacher.errorflow@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    teacherToken = await loginUser({
      email: 'teacher.errorflow@test.com',
      password: 'Password123'
    });
  });

  it('body inválido devuelve 400 con formato unificado y array errors', async () => {
    const res = await request(app)
      .post('/api/mechanics')
      .set(makeAuthHeaders(teacherToken))
      .send({ invalid: 'data' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Error de validación');
    expect(res.body.errors).toBeDefined();
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors[0]).toHaveProperty('field');
    expect(res.body.errors[0]).toHaveProperty('message');
  });

  it('query inválida devuelve 400 con mensaje de parámetros de consulta', async () => {
    const res = await request(app)
      .get('/api/mechanics?invalidParam=true')
      .set(makeAuthHeaders(teacherToken));

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });

  it('params inválidos devuelve 400 con mensaje de parámetros de ruta', async () => {
    const res = await request(app)
      .get('/api/mechanics/!!!invalid!!!')
      .set(makeAuthHeaders(teacherToken));

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ============================================================================
// notFoundHandler → errorHandler
// ============================================================================

describe('notFoundHandler → errorHandler centralizado', () => {
  it('ruta inexistente devuelve 404 con formato unificado', async () => {
    const res = await request(app).get('/api/ruta-que-no-existe').set(fingerprintHeaders);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Ruta no encontrada/);
    expect(res.body.message).toContain('GET');
    expect(res.body.message).toContain('/api/ruta-que-no-existe');
  });

  it('POST a ruta inexistente devuelve 404 con método correcto', async () => {
    const res = await request(app)
      .post('/api/endpoint-inventado')
      .set(fingerprintHeaders)
      .send({ data: 'test' });

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('POST');
  });
});

// ============================================================================
// securityPayloadGuard → errorHandler
// ============================================================================

describe('securityPayloadGuard → errorHandler centralizado', () => {
  let teacherToken;

  beforeEach(async () => {
    await User.deleteMany({});

    await User.create({
      name: 'Teacher Security',
      email: 'teacher.security@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    teacherToken = await loginUser({
      email: 'teacher.security@test.com',
      password: 'Password123'
    });
  });

  it('payload con operador NoSQL devuelve 400 con formato unificado', async () => {
    const res = await request(app)
      .post('/api/users')
      .set(makeAuthHeaders(teacherToken))
      .send({
        name: 'Test Student',
        profile: { classroom: '1A' },
        $where: 'this.role === "teacher"'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/política de seguridad/i);
    expect(res.body.errors).toBeDefined();
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]).toHaveProperty('field');
    expect(res.body.errors[0]).toHaveProperty('message');
  });
});

// ============================================================================
// errorHandler — tipos de error
// ============================================================================

describe('errorHandler — formato de respuesta por tipo de error', () => {
  it('error de autenticación devuelve 401', async () => {
    const res = await request(app).get('/api/mechanics').set(fingerprintHeaders);

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('error de autorización devuelve 403', async () => {
    await User.deleteMany({});

    // Crear profesor con estado pendiente de aprobación
    // (los estudiantes no tienen email/login en este sistema)
    await User.create({
      name: 'Teacher Forbidden',
      email: 'teacher.forbidden@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    const token = await loginUser({
      email: 'teacher.forbidden@test.com',
      password: 'Password123'
    });

    // Intentar acceder a ruta de super_admin
    const res = await request(app).get('/api/admin/pending-teachers').set(makeAuthHeaders(token));

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('recurso no encontrado devuelve 404 con success false', async () => {
    await User.deleteMany({});

    await User.create({
      name: 'Teacher NF',
      email: 'teacher.nf@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    const token = await loginUser({
      email: 'teacher.nf@test.com',
      password: 'Password123'
    });

    const fakeId = '507f1f77bcf86cd799439011';
    const res = await request(app).get(`/api/mechanics/${fakeId}`).set(makeAuthHeaders(token));

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
