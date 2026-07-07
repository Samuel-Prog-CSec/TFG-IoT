/**
 * @fileoverview Tests adversariales del hardening JWT (T-905 B1).
 *
 * Verifica que el middleware de auth rechaza:
 * - Tokens con alg: none (forjados).
 * - Tokens con algoritmo distinto a HS256 (downgrade / algorithm confusion).
 * - Tokens sin claim jti.
 * - Tokens sin claim iat o con iat en el futuro.
 * - Tokens con type swap (refresh usado como access o viceversa).
 *
 * Y que el envValidator falla-fast con:
 * - Secrets < 64 chars.
 * - Secrets con entropía Shannon < 3.5.
 * - JWT_SECRET == JWT_REFRESH_SECRET.
 */

const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../../src/server');
const User = require('../../src/models/User');

const buildForgedToken = (payload, secret, options = {}) =>
  jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: 'rfid-games-platform',
    audience: 'rfid-games-client',
    ...options
  });

describe('JWT hardening (B1)', () => {
  let approvedTeacher;
  let validAccessToken;

  beforeEach(async () => {
    await User.deleteMany({});
    approvedTeacher = await User.create({
      name: 'JWT Hardening Tester',
      email: 'jwt-hardening@test.com',
      password: 'Password123',
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: approvedTeacher.email, password: 'Password123' });
    expect(loginRes.statusCode).toBe(200);
    validAccessToken = loginRes.body.data.accessToken;
  });

  describe('Algorithm whitelist', () => {
    it('rechaza tokens firmados con alg: none', async () => {
      // jsonwebtoken@9 ya no permite firmar con none, así que construimos el token a mano
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          jti: crypto.randomUUID(),
          id: approvedTeacher._id.toString(),
          email: approvedTeacher.email,
          role: 'teacher',
          fp: 'forged-fp',
          type: 'access',
          iss: 'rfid-games-platform',
          aud: 'rfid-games-client',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900
        })
      ).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${noneToken}`);
      expect(res.statusCode).toBe(401);
    });

    it('rechaza tokens firmados con algoritmo distinto a HS256 (algorithm confusion)', async () => {
      // Generamos un par RSA temporal para firmar el token "atacante"
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048
      });

      const forgedToken = jwt.sign(
        {
          jti: crypto.randomUUID(),
          id: approvedTeacher._id.toString(),
          email: approvedTeacher.email,
          role: 'super_admin', // intento de escalada
          fp: 'forged',
          type: 'access'
        },
        privateKey,
        {
          algorithm: 'RS256',
          issuer: 'rfid-games-platform',
          audience: 'rfid-games-client',
          expiresIn: '15m'
        }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Strict claims', () => {
    it('rechaza tokens sin claim jti', async () => {
      const forged = buildForgedToken(
        {
          id: approvedTeacher._id.toString(),
          email: approvedTeacher.email,
          role: 'teacher',
          fp: 'fp',
          type: 'access'
        },
        process.env.JWT_SECRET,
        { expiresIn: '15m', noTimestamp: false }
      );

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
      expect(res.statusCode).toBe(401);
    });

    it('rechaza tokens con iat en el futuro (> 5s tolerance)', async () => {
      const futureIat = Math.floor(Date.now() / 1000) + 60; // 1 minuto en el futuro
      const forged = jwt.sign(
        {
          jti: crypto.randomUUID(),
          id: approvedTeacher._id.toString(),
          email: approvedTeacher.email,
          role: 'teacher',
          fp: 'fp',
          type: 'access',
          iat: futureIat,
          exp: futureIat + 900
        },
        process.env.JWT_SECRET,
        {
          algorithm: 'HS256',
          issuer: 'rfid-games-platform',
          audience: 'rfid-games-client',
          noTimestamp: true
        }
      );

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
      expect(res.statusCode).toBe(401);
    });

    it('rechaza tokens type=refresh usados como access', async () => {
      const forged = buildForgedToken(
        {
          jti: crypto.randomUUID(),
          id: approvedTeacher._id.toString(),
          email: approvedTeacher.email,
          role: 'teacher',
          fp: 'fp',
          type: 'refresh' // intento de swap
        },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Issuer / audience mismatch', () => {
    it('rechaza token con issuer distinto', async () => {
      const forged = jwt.sign(
        {
          jti: crypto.randomUUID(),
          id: approvedTeacher._id.toString(),
          email: approvedTeacher.email,
          role: 'teacher',
          fp: 'fp',
          type: 'access'
        },
        process.env.JWT_SECRET,
        {
          algorithm: 'HS256',
          issuer: 'evil-platform',
          audience: 'rfid-games-client',
          expiresIn: '15m'
        }
      );

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Token válido como referencia', () => {
    it('un access token válido sí accede a /api/auth/me', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validAccessToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.email).toBe(approvedTeacher.email);
    });
  });
});

// Nota: los tests de envValidator (longitud, entropía, igualdad) están
// cubiertos en `tests/envValidator.test.js` que ya verifica los casos:
// - throws if JWT secrets are too short
// - throws if JWT secrets have low entropy (B1)
// - throws if JWT_SECRET === JWT_REFRESH_SECRET (B1)
// Se evita duplicarlos aquí para no incurrir en jest.resetModules() que
// interfiere con el transport de pino en el harness.
