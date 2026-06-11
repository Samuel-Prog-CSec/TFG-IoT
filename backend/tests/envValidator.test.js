const crypto = require('node:crypto');

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

mockLogger.child = jest.fn(() => mockLogger);

jest.mock('../src/utils/logger', () => mockLogger);

/**
 * Genera un secret hexadecimal ≥64 chars con entropía suficiente para pasar
 * las validaciones B1 (T-905). Usado en todos los tests que requieren un
 * secret "válido" para llegar a validar otras variables.
 */
const validSecret = () => crypto.randomBytes(48).toString('hex'); // 96 chars

describe('envValidator.validateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.MONGO_URI;
    delete process.env.CORS_WHITELIST;
    delete process.env.SENTRY_ENABLED;
    delete process.env.SENTRY_DSN;
    delete process.env.RFID_SOURCE;
    delete process.env.RFID_HMAC_ENABLED;
    delete process.env.RFID_HMAC_SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_REFRESH_EXPIRES_IN;
    delete process.env.LOG_SAMPLE_RATE;
    delete process.env.SHUTDOWN_TIMEOUT_MS;

    process.env.PORT = '5000';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('in test env, sets defaults and does not throw', () => {
    process.env.NODE_ENV = 'test';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).not.toThrow();
    expect(process.env.JWT_SECRET).toBeTruthy();
    expect(process.env.JWT_REFRESH_SECRET).toBeTruthy();
    expect(process.env.MONGO_URI).toMatch(/^mongodb:\/\//);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('in production, fails fast when critical vars missing', () => {
    process.env.NODE_ENV = 'production';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/CONFIGURACIÓN CRÍTICA FALTANTE/);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('in production, requires CORS_WHITELIST', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/CORS_WHITELIST/);
  });

  it('in development, warns about missing Supabase but does not throw', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).not.toThrow();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('in development, throws if JWT secrets are too short', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'short';
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.SUPABASE_URL = 'https://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
    process.env.RFID_SOURCE = 'client';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/JWT_SECRET es demasiado corto/);
  });

  it('in development, throws if JWT secrets have low entropy (B1)', () => {
    process.env.NODE_ENV = 'development';
    // 64 chars exactos pero solo 2 caracteres únicos → entropía ≈ 1
    process.env.JWT_SECRET = 'ab'.repeat(32);
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.SUPABASE_URL = 'https://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
    process.env.RFID_SOURCE = 'client';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/entropía baja/);
  });

  it('in development, throws if JWT_SECRET === JWT_REFRESH_SECRET (B1)', () => {
    process.env.NODE_ENV = 'development';
    const shared = validSecret();
    process.env.JWT_SECRET = shared;
    process.env.JWT_REFRESH_SECRET = shared;
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.SUPABASE_URL = 'https://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
    process.env.RFID_SOURCE = 'client';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/no pueden ser idénticos/);
  });

  it('RFID_HMAC_ENABLED=true sin RFID_HMAC_SECRET → warning en dev', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.RFID_HMAC_ENABLED = 'true';
    delete process.env.RFID_HMAC_SECRET;

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).not.toThrow();
    // El warning se reporta vía logger.warn(mensaje, warnings[]). El segundo
    // argumento es el array de warnings acumulados; comprobamos que contiene
    // la mención a RFID_HMAC_SECRET.
    const loggedWarnings = mockLogger.warn.mock.calls.flat(2).join(' ');
    expect(loggedWarnings).toMatch(/RFID_HMAC_SECRET/);
  });

  it('RFID_HMAC_ENABLED=TRUE (mayúsculas) sin RFID_HMAC_SECRET → también avisa', () => {
    // El parsing del flag es case-insensitive: en UIs cloud es frecuente teclear
    // "TRUE". El guard debe dispararse igual que con "true" minúscula.
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.RFID_HMAC_ENABLED = 'TRUE';
    delete process.env.RFID_HMAC_SECRET;

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).not.toThrow();
    const loggedWarnings = mockLogger.warn.mock.calls.flat(2).join(' ');
    expect(loggedWarnings).toMatch(/RFID_HMAC_SECRET/);
  });

  it('RFID_HMAC_ENABLED=true sin RFID_HMAC_SECRET → falla en producción', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.CORS_WHITELIST = 'https://app.local';
    process.env.PSEUDONYMIZE_SECRET = validSecret();
    process.env.RFID_SOURCE = 'client';
    process.env.SUPABASE_URL = 'https://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.RFID_HMAC_ENABLED = 'true';
    delete process.env.RFID_HMAC_SECRET;

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/RFID_HMAC_SECRET/);
  });

  it('RFID_HMAC_ENABLED=true con RFID_HMAC_SECRET no avisa ni falla', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.RFID_HMAC_ENABLED = 'true';
    process.env.RFID_HMAC_SECRET = validSecret();

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).not.toThrow();
    const loggedWarnings = mockLogger.warn.mock.calls.flat(2).join(' ');
    expect(loggedWarnings).not.toMatch(/RFID_HMAC_SECRET ausente/);
  });

  it('throws if MONGO_URI is invalid format', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongo://not-mongo';
    process.env.SUPABASE_URL = 'https://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
    process.env.RFID_SOURCE = 'client';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/MONGO_URI tiene formato inválido/);
  });

  it('accepts valid JWT_EXPIRES_IN values', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '30d';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).not.toThrow();
  });

  it('throws if JWT_EXPIRES_IN has invalid format', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.JWT_EXPIRES_IN = '15minutes';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/JWT_EXPIRES_IN tiene formato inválido/);
  });

  it('throws if JWT_REFRESH_EXPIRES_IN has invalid format', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.JWT_REFRESH_EXPIRES_IN = 'abc';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/JWT_REFRESH_EXPIRES_IN tiene formato inválido/);
  });

  it('accepts valid PORT values', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.PORT = '3000';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).not.toThrow();
  });

  it('throws if PORT is below 1024', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.PORT = '80';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/PORT tiene un valor inválido/);
  });

  it('throws if PORT is above 65535', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.PORT = '70000';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/PORT tiene un valor inválido/);
  });

  it('throws if PORT is not a number', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.PORT = 'abc';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/PORT tiene un valor inválido/);
  });

  it('accepts valid LOG_SAMPLE_RATE values', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.LOG_SAMPLE_RATE = '0.5';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).not.toThrow();
  });

  it('accepts LOG_SAMPLE_RATE boundary values 0 and 1', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.LOG_SAMPLE_RATE = '0';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).not.toThrow();
  });

  it('throws if LOG_SAMPLE_RATE is above 1', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.LOG_SAMPLE_RATE = '1.5';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/LOG_SAMPLE_RATE tiene un valor inválido/);
  });

  it('throws if LOG_SAMPLE_RATE is negative', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.LOG_SAMPLE_RATE = '-0.1';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/LOG_SAMPLE_RATE tiene un valor inválido/);
  });

  it('throws if LOG_SAMPLE_RATE is not a number', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.LOG_SAMPLE_RATE = 'high';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/LOG_SAMPLE_RATE tiene un valor inválido/);
  });

  it('accepts valid SHUTDOWN_TIMEOUT_MS values', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.SHUTDOWN_TIMEOUT_MS = '10000';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).not.toThrow();
  });

  it('throws if SHUTDOWN_TIMEOUT_MS is zero', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.SHUTDOWN_TIMEOUT_MS = '0';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/SHUTDOWN_TIMEOUT_MS tiene un valor inválido/);
  });

  it('throws if SHUTDOWN_TIMEOUT_MS is negative', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.SHUTDOWN_TIMEOUT_MS = '-500';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/SHUTDOWN_TIMEOUT_MS tiene un valor inválido/);
  });

  it('throws if SHUTDOWN_TIMEOUT_MS is not an integer', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = validSecret();
    process.env.JWT_REFRESH_SECRET = validSecret();
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';
    process.env.SHUTDOWN_TIMEOUT_MS = '10.5';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/SHUTDOWN_TIMEOUT_MS tiene un valor inválido/);
  });
});
