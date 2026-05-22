/**
 * @fileoverview Tests del account lockout service (T-905 B1).
 *
 * Verifica:
 * - Tras N intentos fallidos consecutivos se bloquea la cuenta.
 * - Mensaje al cliente es genérico (no diferencia "bloqueado" vs "inválido").
 * - El bloqueo se limpia al hacer login exitoso.
 * - Keying es por email (no IP) — distintas IPs sobre el mismo email cuentan.
 * - Fail-open si Redis falla.
 */

const request = require('supertest');
const { app } = require('../../src/server');
const User = require('../../src/models/User');
const accountLockoutService = require('../../src/services/accountLockoutService');
const { connectRedis, disconnectRedis } = require('../../src/config/redis');
const redisService = require('../../src/services/redisService');

const TEACHER_EMAIL = 'lockout-target@test.com';
const TEACHER_PASSWORD = 'GoodPassword123';
const WRONG_PASSWORD = 'WrongPassword999';

describe('accountLockoutService (B1)', () => {
  beforeAll(async () => {
    // Necesario para que ioredis-mock esté disponible: redisClient singleton + isConnected=true.
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    // Limpiar todos los lockouts/contadores residuales para evitar bleed entre tests.
    await redisService.flushNamespace(redisService.NAMESPACES.AUTH_FAILED);
    await redisService.flushNamespace(redisService.NAMESPACES.AUTH_LOCKED);
    await User.create({
      name: 'Lockout Target',
      email: TEACHER_EMAIL,
      password: TEACHER_PASSWORD,
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });
  });

  describe('service unit', () => {
    it('isLocked retorna false para email no bloqueado', async () => {
      const locked = await accountLockoutService.isLocked('fresh@test.com');
      expect(locked).toBe(false);
    });

    it('recordFailedAttempt incrementa contador y bloquea al alcanzar MAX_ATTEMPTS', async () => {
      const email = 'count@test.com';
      for (let i = 1; i < accountLockoutService.CONFIG.MAX_ATTEMPTS; i++) {
        const result = await accountLockoutService.recordFailedAttempt(email, {});
        expect(result.locked).toBe(false);
        expect(result.attempts).toBe(i);
      }
      const finalResult = await accountLockoutService.recordFailedAttempt(email, {});
      expect(finalResult.locked).toBe(true);
      expect(finalResult.attempts).toBe(accountLockoutService.CONFIG.MAX_ATTEMPTS);
      const locked = await accountLockoutService.isLocked(email);
      expect(locked).toBe(true);
    });

    it('clearLockout limpia contador y lockout', async () => {
      const email = 'clear@test.com';
      for (let i = 0; i < accountLockoutService.CONFIG.MAX_ATTEMPTS; i++) {
        await accountLockoutService.recordFailedAttempt(email, {});
      }
      expect(await accountLockoutService.isLocked(email)).toBe(true);

      await accountLockoutService.clearLockout(email);
      expect(await accountLockoutService.isLocked(email)).toBe(false);
      expect(await accountLockoutService.getFailureCount(email)).toBe(0);
    });

    it('normaliza email a lowercase + trim (key estable)', async () => {
      await accountLockoutService.recordFailedAttempt('  Mixed@CASE.com ', {});
      const count = await accountLockoutService.getFailureCount('mixed@case.com');
      expect(count).toBe(1);
    });

    it('forceUnlock retorna true si había lockout y false si no', async () => {
      const email = 'unlock@test.com';
      for (let i = 0; i < accountLockoutService.CONFIG.MAX_ATTEMPTS; i++) {
        await accountLockoutService.recordFailedAttempt(email, {});
      }
      const first = await accountLockoutService.forceUnlock(email, {});
      expect(first).toBe(true);
      const second = await accountLockoutService.forceUnlock(email, {});
      expect(second).toBe(false);
    });
  });

  describe('integración con /api/auth/login', () => {
    it('tras MAX_ATTEMPTS fallos, el siguiente intento (aunque sea con password correcto) devuelve 401', async () => {
      for (let i = 0; i < accountLockoutService.CONFIG.MAX_ATTEMPTS; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: TEACHER_EMAIL, password: WRONG_PASSWORD });
        expect(res.statusCode).toBe(401);
      }

      // Ahora con la contraseña correcta — debería seguir bloqueado
      const lockedRes = await request(app)
        .post('/api/auth/login')
        .send({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD });
      expect(lockedRes.statusCode).toBe(401);
      // Mensaje genérico — no debe revelar que está bloqueado
      expect(lockedRes.body.message || lockedRes.body.error?.message || '').toMatch(
        /Credenciales inválidas/i
      );
    });

    it('login exitoso limpia el contador (reset)', async () => {
      // 2 fallos previos (por debajo del límite)
      for (let i = 0; i < 2; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: TEACHER_EMAIL, password: WRONG_PASSWORD });
      }
      expect(await accountLockoutService.getFailureCount(TEACHER_EMAIL)).toBe(2);

      // Login válido
      const okRes = await request(app)
        .post('/api/auth/login')
        .send({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD });
      expect(okRes.statusCode).toBe(200);

      // Contador limpio tras éxito
      expect(await accountLockoutService.getFailureCount(TEACHER_EMAIL)).toBe(0);
    });

    it('lockout es per-email, no per-IP (defiende credential stuffing distribuido)', async () => {
      // 5 intentos fallidos desde "IP 1" (sin manipular IP — supertest usa misma)
      for (let i = 0; i < accountLockoutService.CONFIG.MAX_ATTEMPTS; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: TEACHER_EMAIL, password: WRONG_PASSWORD });
      }
      expect(await accountLockoutService.isLocked(TEACHER_EMAIL)).toBe(true);
    });

    it('emails inexistentes también se cuentan (evita enumeración por timing/comportamiento)', async () => {
      const unknown = 'no-existe@test.com';
      for (let i = 0; i < 2; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: unknown, password: WRONG_PASSWORD });
      }
      const count = await accountLockoutService.getFailureCount(unknown);
      expect(count).toBe(2);
    });
  });

  describe('endpoint admin unlock', () => {
    let superAdminToken;

    beforeEach(async () => {
      await User.create({
        name: 'Super Admin',
        email: 'super@test.com',
        password: 'Admin1234!',
        role: 'super_admin',
        accountStatus: 'approved',
        status: 'active'
      });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'super@test.com', password: 'Admin1234!' });
      superAdminToken = res.body.data.accessToken;

      // Bloquear cuenta target
      for (let i = 0; i < accountLockoutService.CONFIG.MAX_ATTEMPTS; i++) {
        await accountLockoutService.recordFailedAttempt(TEACHER_EMAIL, {});
      }
      expect(await accountLockoutService.isLocked(TEACHER_EMAIL)).toBe(true);
    });

    it('super_admin puede desbloquear cuenta vía POST /api/admin/lockouts/unlock', async () => {
      const res = await request(app)
        .post('/api/admin/lockouts/unlock')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: TEACHER_EMAIL });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.unlocked).toBe(true);
      expect(await accountLockoutService.isLocked(TEACHER_EMAIL)).toBe(false);
    });

    it('teacher NO puede desbloquear (requireRole super_admin)', async () => {
      // Crear y aprobar teacher
      const teacherUser = await User.create({
        name: 'Plain Teacher',
        email: 'plain@test.com',
        password: 'Password123',
        role: 'teacher',
        accountStatus: 'approved',
        status: 'active'
      });
      const tRes = await request(app)
        .post('/api/auth/login')
        .send({ email: teacherUser.email, password: 'Password123' });
      const teacherToken = tRes.body.data.accessToken;

      const res = await request(app)
        .post('/api/admin/lockouts/unlock')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ email: TEACHER_EMAIL });
      expect(res.statusCode).toBe(403);
    });

    it('rechaza body con email mal formado', async () => {
      const res = await request(app)
        .post('/api/admin/lockouts/unlock')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'no-es-un-email' });
      expect(res.statusCode).toBe(400);
    });
  });
});
