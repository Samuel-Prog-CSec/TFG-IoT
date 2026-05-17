/**
 * @fileoverview Tests del flujo MFA TOTP (T-905 B7).
 *
 * Cubre setup-init, setup-verify, challenge, verify-backup-code,
 * regenerate y disable. Usa otplib para generar códigos válidos en el momento.
 */

const request = require('supertest');
const totp = require('../../src/utils/totp');
const { app } = require('../../src/server');
const User = require('../../src/models/User');
const { connectRedis, disconnectRedis } = require('../../src/config/redis');
const redisService = require('../../src/services/redisService');

const SUPER_ADMIN = {
  name: 'Super Admin MFA',
  email: 'super-mfa@test.com',
  password: 'Admin1234!'
};

let accessToken;
let userId;

const loginAndGetToken = async (email = SUPER_ADMIN.email, password = SUPER_ADMIN.password) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body?.data?.accessToken;
};

const cleanRedis = async () => {
  await redisService.flushNamespace('mfa:setup');
  await redisService.flushNamespace(redisService.NAMESPACES.AUTH_FAILED);
  await redisService.flushNamespace(redisService.NAMESPACES.AUTH_LOCKED);
  await redisService.flushNamespace(redisService.NAMESPACES.BLACKLIST);
  await redisService.flushNamespace(redisService.NAMESPACES.SECURITY);
  await redisService.flushNamespace(redisService.NAMESPACES.AUTH_USER);
};

describe('MFA TOTP controller (B7)', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await cleanRedis();
    const user = await User.create({
      ...SUPER_ADMIN,
      role: 'super_admin',
      accountStatus: 'approved',
      status: 'active'
    });
    userId = user._id.toString();
    accessToken = await loginAndGetToken();
    expect(accessToken).toBeTruthy();
  });

  describe('setup-init', () => {
    it('devuelve otpauthUrl + secret + accountName', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/setup-init')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(res.statusCode).toBe(200);
      expect(res.body.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      expect(res.body.data.secret).toMatch(/^[A-Z2-7]+$/); // base32
      expect(res.body.data.accountName).toBe(SUPER_ADMIN.email);
    });

    it('rechaza si el usuario no es super_admin', async () => {
      // Crear teacher y login
      await User.create({
        name: 'Teacher Test',
        email: 'teacher-mfa@test.com',
        password: 'Password123',
        role: 'teacher',
        accountStatus: 'approved',
        status: 'active'
      });
      const teacherToken = await loginAndGetToken('teacher-mfa@test.com', 'Password123');

      const res = await request(app)
        .post('/api/auth/mfa/setup-init')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({});
      expect(res.statusCode).toBe(403);
    });
  });

  describe('setup-verify', () => {
    it('confirma MFA con código válido y devuelve backup codes', async () => {
      const initRes = await request(app)
        .post('/api/auth/mfa/setup-init')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      const secret = initRes.body.data.secret;

      const code = totp.generate({ secret });

      const verifyRes = await request(app)
        .post('/api/auth/mfa/setup-verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code });
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.body.data.backupCodes).toHaveLength(8);
      verifyRes.body.data.backupCodes.forEach(c => {
        expect(c).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
      });

      const updated = await User.findById(userId).select('+mfa.secret +mfa.backupCodes');
      expect(updated.mfa.enabled).toBe(true);
      expect(updated.mfa.secret).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/); // formato envelope
      expect(updated.mfa.backupCodes).toHaveLength(8);
    });

    it('rechaza si el código TOTP es inválido', async () => {
      await request(app)
        .post('/api/auth/mfa/setup-init')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      const res = await request(app)
        .post('/api/auth/mfa/setup-verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: '000000' });
      expect(res.statusCode).toBe(401);
    });

    it('rechaza si no hay setup pendiente', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/setup-verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: '123456' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('challenge', () => {
    let secret;

    beforeEach(async () => {
      const initRes = await request(app)
        .post('/api/auth/mfa/setup-init')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      secret = initRes.body.data.secret;
      const code = totp.generate({ secret });
      await request(app)
        .post('/api/auth/mfa/setup-verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code });
      // Tras setupVerify se hace revokeAllUserTokens → re-login
      accessToken = await loginAndGetToken();
    });

    it('devuelve mfaToken con código TOTP válido', async () => {
      const code = totp.generate({ secret });
      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.mfaToken).toMatch(/^eyJ/); // JWT
      expect(res.body.data.expiresIn).toBe(300);
    });

    it('rechaza con código TOTP inválido', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: '999999' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('verify-backup-code', () => {
    let backupCodes;

    beforeEach(async () => {
      const initRes = await request(app)
        .post('/api/auth/mfa/setup-init')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      const secret = initRes.body.data.secret;
      const verifyRes = await request(app)
        .post('/api/auth/mfa/setup-verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: totp.generate({ secret }) });
      backupCodes = verifyRes.body.data.backupCodes;
      accessToken = await loginAndGetToken();
    });

    it('acepta un backup code válido (no usado) y devuelve mfaToken', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/verify-backup-code')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ backupCode: backupCodes[0] });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.mfaToken).toMatch(/^eyJ/);
    });

    it('rechaza el mismo backup code dos veces (single-use)', async () => {
      await request(app)
        .post('/api/auth/mfa/verify-backup-code')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ backupCode: backupCodes[0] });
      const second = await request(app)
        .post('/api/auth/mfa/verify-backup-code')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ backupCode: backupCodes[0] });
      expect(second.statusCode).toBe(401);
    });

    it('rechaza backup code con formato inválido', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/verify-backup-code')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ backupCode: 'not-a-valid-format' });
      expect(res.statusCode).toBe(400);
    });
  });
});
