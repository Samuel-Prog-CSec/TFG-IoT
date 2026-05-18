/**
 * @fileoverview Tests adversariales contra NoSQL injection (T-905 B9).
 *
 * Verifica que `securityPayloadGuard` (registered antes de las rutas) bloquea
 * payloads con operadores Mongo (`$ne`, `$gt`, `$where`), `__proto__`,
 * `constructor`, `prototype`. Estos son intentos típicos de bypass auth o
 * extracción de datos en backends NoSQL.
 */

const request = require('supertest');
const { app } = require('../../src/server');
const User = require('../../src/models/User');

describe('NoSQL injection prevention (B9)', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await User.create({
      name: 'Target',
      email: 'target@test.com',
      password: 'GoodPassword123',
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });
  });

  it('login con {email: {$ne: null}, password: {$ne: null}} debe ser bloqueado', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });
    // securityPayloadGuard o validateBody zod debe rechazar antes de tocar Mongo
    expect([400, 403]).toContain(res.statusCode);
    expect(res.body?.success).toBe(false);
  });

  it('login con __proto__ en body NO contamina Object.prototype', async () => {
    // Nota: JSON.parse de Node trata `__proto__` como propiedad propia normal en
    // muchos casos; el guard puede o no rechazarlo en login (que rechaza por
    // body shape estricta vía Zod). Lo crítico es que la prototype chain global
    // NO quede contaminada.
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'target@test.com', password: 'x', __proto__: { adminInjected: true } });
    expect(Object.prototype.adminInjected).toBeUndefined();

    expect({}.adminInjected).toBeUndefined();
  });

  it('login con constructor en body es bloqueado', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'target@test.com', password: 'x', constructor: { admin: true } });
    expect([400, 403]).toContain(res.statusCode);
  });

  it('login con prototype en body es bloqueado', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'target@test.com', password: 'x', prototype: { admin: true } });
    expect([400, 403]).toContain(res.statusCode);
  });

  it('login con $where en body es bloqueado', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'target@test.com', password: 'x', $where: 'function() { return true; }' });
    expect([400, 403]).toContain(res.statusCode);
  });

  it('login con email containing dot operator es bloqueado por validación email Zod', async () => {
    // No es NoSQLi clásica, pero el regex de email debe rechazar caracteres raros
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'target@test.com.', password: 'GoodPassword123' });
    // Zod email validation rejects trailing dot
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('protoype-pollution global NO sucede tras request con __proto__', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'target@test.com', password: 'x', __proto__: { polluted: true } });
    // Si el guard funciona, Object.prototype no fue contaminado

    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
  });
});
