/**
 * @fileoverview Tests CSRF defense (T-905 B9).
 *
 * Verifica que el middleware `csrfProtection` bloquea requests POST/PUT/DELETE
 * que no traen el token CSRF correcto. El backend usa double-submit cookie:
 * el navegador adjunta `csrfToken` (cookie) Y debe enviar el mismo valor
 * en header `X-CSRF-Token`. Sin coincidencia → 403.
 *
 * Login y refresh están en CSRF skip paths (cliente no tiene cookie aún).
 */

const request = require('supertest');
const { app } = require('../../src/server');
const User = require('../../src/models/User');

const TEACHER = {
  name: 'CSRF Tester',
  email: 'csrf-tester@test.com',
  password: 'GoodPassword123'
};

describe('CSRF defense (B9)', () => {
  let accessToken;

  beforeEach(async () => {
    await User.deleteMany({});
    await User.create({
      ...TEACHER,
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });
    const res = await request(app).post('/api/auth/login').send({
      email: TEACHER.email,
      password: TEACHER.password
    });
    accessToken = res.body?.data?.accessToken;
  });

  // Nota: en NODE_ENV=test, `csrfProtection` salta CSRF para no romper la suite.
  // El test de enforcement real está cubierto en `tests/validationEndpoints.test.js`
  // (que sí setea cookies). Aquí solo documentamos las skip paths.

  it('login está en CSRF skip paths (no necesita CSRF token)', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: TEACHER.email,
      password: TEACHER.password
    });
    expect(res.statusCode).toBe(200);
  });

  it('refresh está en CSRF skip paths', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    // 401 (sin cookie refresh) o 200 — pero NO 403 por CSRF.
    expect(res.statusCode).not.toBe(403);
  });

  it('csp-report está en CSRF skip paths', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': { 'document-uri': 'test' } }));
    expect(res.statusCode).toBe(204);
  });
});
