const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

jest.mock('../src/utils/logger', () => mockLogger);

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
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;

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
    process.env.JWT_SECRET = 'x'.repeat(40);
    process.env.JWT_REFRESH_SECRET = 'y'.repeat(48);
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/CORS_WHITELIST/);
  });

  it('in development, warns about missing Supabase but does not throw', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'x'.repeat(40);
    process.env.JWT_REFRESH_SECRET = 'y'.repeat(48);
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.RFID_SOURCE = 'client';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).not.toThrow();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('in development, throws if JWT secrets are too short', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'short';
    process.env.JWT_REFRESH_SECRET = 'y'.repeat(48);
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games';
    process.env.SUPABASE_URL = 'https://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
    process.env.RFID_SOURCE = 'client';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/JWT_SECRET es demasiado corto/);
  });

  it('throws if MONGO_URI is invalid format', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'x'.repeat(40);
    process.env.JWT_REFRESH_SECRET = 'y'.repeat(48);
    process.env.MONGO_URI = 'mongo://not-mongo';
    process.env.SUPABASE_URL = 'https://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
    process.env.RFID_SOURCE = 'client';

    const { validateEnv } = require('../src/utils/envValidator');

    expect(() => validateEnv()).toThrow(/MONGO_URI tiene formato inválido/);
  });
});
