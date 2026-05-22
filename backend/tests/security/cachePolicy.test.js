/**
 * @fileoverview Tests del middleware Cache-Control anti-leak (T-905 B2).
 *
 * Verifica que las rutas con PII (auth, users, sessions, etc.) responden con
 * `Cache-Control: no-store` y headers complementarios, y que rutas no
 * sensibles (mechanics, health) NO aplican la política (cacheables por
 * navegador / Cloudflare).
 */

const request = require('supertest');
const { app } = require('../../src/server');
const User = require('../../src/models/User');
const { connectRedis, disconnectRedis } = require('../../src/config/redis');

const TEACHER = {
  name: 'Cache Tester',
  email: 'cache-tester@test.com',
  password: 'Password123'
};

let teacherToken;

describe('cachePolicy middleware (B2)', () => {
  beforeAll(async () => {
    await connectRedis();
    await User.deleteMany({});
    await User.create({
      ...TEACHER,
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEACHER.email, password: TEACHER.password });
    teacherToken = res.body.data.accessToken;
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  describe('rutas sensibles aplican no-store', () => {
    const sensitiveRoutes = [
      { method: 'get', path: '/api/auth/me', auth: true },
      { method: 'get', path: '/api/users', auth: true },
      { method: 'get', path: '/api/sessions', auth: true },
      { method: 'get', path: '/api/decks', auth: true },
      { method: 'get', path: '/api/notifications', auth: true }
    ];

    for (const route of sensitiveRoutes) {
      it(`${route.method.toUpperCase()} ${route.path} → Cache-Control: no-store`, async () => {
        const req = request(app)[route.method](route.path);
        if (route.auth) {
          req.set('Authorization', `Bearer ${teacherToken}`);
        }
        const res = await req;
        expect(res.headers['cache-control']).toMatch(/no-store/);
        expect(res.headers['cache-control']).toMatch(/private/);
        expect(res.headers.pragma).toBe('no-cache');
        expect(res.headers.expires).toBe('0');
        expect(res.headers['surrogate-control']).toBe('no-store');
      });
    }
  });

  describe('aplicación universal a /api (defense in depth)', () => {
    it('GET /api/health también recibe no-store (decisión consciente: respuestas de API uniformes)', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['cache-control']).toMatch(/no-store/);
    });

    it('GET /api/mechanics también recibe no-store (datos de config viva, evitar 304 sin body)', async () => {
      const res = await request(app)
        .get('/api/mechanics')
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(res.headers['cache-control']).toMatch(/no-store/);
    });
  });
});
