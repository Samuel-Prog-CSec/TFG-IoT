/**
 * @fileoverview Tests del middleware turnstileGuard (T-905 B6).
 *
 * Verifica:
 * - Sin TURNSTILE_SECRET: middleware no aplica (siempre pasa).
 * - Con TURNSTILE_SECRET pero failureCount < threshold: pasa sin pedir CAPTCHA.
 * - Con TURNSTILE_SECRET y failureCount ≥ threshold: pide captchaToken.
 * - captchaToken inválido → 403 CAPTCHA_INVALID (mock fetch).
 */

const { requireCaptchaIfFlagged } = require('../../src/middlewares/turnstileGuard');
const accountLockoutService = require('../../src/services/accountLockoutService');
const { connectRedis, disconnectRedis } = require('../../src/config/redis');
const redisService = require('../../src/services/redisService');

const makeReq = (body = {}, ip = '203.0.113.42') => ({
  body,
  ip,
  headers: {}
});

const runMiddleware = req =>
  new Promise(resolve => {
    requireCaptchaIfFlagged(req, {}, err => resolve(err));
  });

describe('turnstileGuard requireCaptchaIfFlagged (B6)', () => {
  const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET;
  const ORIGINAL_FETCH = globalThis.fetch;

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
    process.env.TURNSTILE_SECRET = ORIGINAL_SECRET || '';
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.TURNSTILE_SECRET;
    }
    globalThis.fetch = ORIGINAL_FETCH;
  });

  beforeEach(async () => {
    await redisService.flushNamespace(redisService.NAMESPACES.AUTH_FAILED);
    await redisService.flushNamespace(redisService.NAMESPACES.AUTH_LOCKED);
  });

  it('sin TURNSTILE_SECRET, no aplica nunca', async () => {
    delete process.env.TURNSTILE_SECRET;
    const req = makeReq({ email: 'test@test.com' });
    const err = await runMiddleware(req);
    expect(err).toBeUndefined();
  });

  it('con secret pero pocos fallos, pasa sin pedir CAPTCHA', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret';
    process.env.TURNSTILE_FAILURE_THRESHOLD = '3';
    const req = makeReq({ email: 'pocos@test.com' });
    const err = await runMiddleware(req);
    expect(err).toBeUndefined();
  });

  it('con secret y N fallos previos, pide captchaToken (rechaza si falta)', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret';
    const email = 'flagged@test.com';
    // Forzar 3 fallos previos
    for (let i = 0; i < 3; i++) {
      await accountLockoutService.recordFailedAttempt(email);
    }
    const req = makeReq({ email });
    const err = await runMiddleware(req);
    expect(err).toBeDefined();
    expect(err.code).toBe('CAPTCHA_REQUIRED');
  });

  it('con captchaToken válido (mock fetch success), pasa', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret';
    const email = 'valid@test.com';
    for (let i = 0; i < 3; i++) {
      await accountLockoutService.recordFailedAttempt(email);
    }
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })
    );
    const req = makeReq({ email, captchaToken: 'good-token' });
    const err = await runMiddleware(req);
    expect(err).toBeUndefined();
  });

  it('con captchaToken inválido (mock fetch success=false), rechaza con CAPTCHA_INVALID', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret';
    const email = 'invalid@test.com';
    for (let i = 0; i < 3; i++) {
      await accountLockoutService.recordFailedAttempt(email);
    }
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: false, 'error-codes': ['invalid-input-response'] })
      })
    );
    const req = makeReq({ email, captchaToken: 'bad-token' });
    const err = await runMiddleware(req);
    expect(err).toBeDefined();
    expect(err.code).toBe('CAPTCHA_INVALID');
  });

  it('si fetch falla (network error), rechaza fail-closed', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret';
    const email = 'network@test.com';
    for (let i = 0; i < 3; i++) {
      await accountLockoutService.recordFailedAttempt(email);
    }
    globalThis.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
    const req = makeReq({ email, captchaToken: 'some-token' });
    const err = await runMiddleware(req);
    expect(err).toBeDefined();
    expect(err.code).toBe('CAPTCHA_INVALID');
  });
});
