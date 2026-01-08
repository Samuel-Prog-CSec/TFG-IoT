const path = require('path');

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

jest.mock('../src/utils/logger', () => mockLogger);

describe('storageService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('disables service in test/dev when creds missing', async () => {
    process.env.NODE_ENV = 'test';

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => {
        throw new Error('should not be called');
      })
    }));

    const storageService = require('../src/services/storageService');

    expect(storageService.enabled).toBe(false);
    expect(storageService.supabase).toBe(null);
    expect(mockLogger.warn).toHaveBeenCalled();

    // Nueva firma: uploadFile(buffer, contextId, type, originalFilename, mimeType)
    await expect(
      storageService.uploadFile(Buffer.from('x'), 'ctx1', 'misc', 'a.txt', 'text/plain')
    ).rejects.toThrow('Fallo en la subida del archivo');

    await expect(
      storageService.deleteFile('https://example.com/anything')
    ).resolves.toBeUndefined();
  });

  it('throws fast in production when creds missing', async () => {
    process.env.NODE_ENV = 'production';

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn()
    }));

    expect(() => require('../src/services/storageService')).toThrow(
      /Credenciales de Supabase faltantes/
    );
  });

  it('uploads file and returns public url when enabled', async () => {
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';

    const upload = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://public/url' } });

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => ({
        storage: {
          from: () => ({
            upload,
            getPublicUrl,
            remove: jest.fn()
          })
        }
      }))
    }));

    const storageService = require('../src/services/storageService');

    // Nueva firma: uploadFile(buffer, contextId, type, originalFilename, mimeType)
    const url = await storageService.uploadFile(
      Buffer.from('x'),
      'ctx1',
      'misc',
      'a b.txt',
      'text/plain'
    );

    expect(url).toBe('https://public/url');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(getPublicUrl).toHaveBeenCalledTimes(1);
  });

  it('deleteFile removes object when url contains bucket path', async () => {
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';

    const remove = jest.fn().mockResolvedValue({ error: null });

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => ({
        storage: {
          from: () => ({
            upload: jest.fn(),
            getPublicUrl: jest.fn(),
            remove
          })
        }
      }))
    }));

    const storageService = require('../src/services/storageService');

    await storageService.deleteFile(
      'https://xyz.supabase.co/storage/v1/object/public/game-assets/ctx-123/image/abc.png'
    );

    expect(remove).toHaveBeenCalledWith(['ctx-123/image/abc.png']);
  });

  it('deleteFile warns and no-ops when url is not parseable', async () => {
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';

    const remove = jest.fn().mockResolvedValue({ error: null });

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => ({
        storage: {
          from: () => ({
            upload: jest.fn(),
            getPublicUrl: jest.fn(),
            remove
          })
        }
      }))
    }));

    const storageService = require('../src/services/storageService');

    await storageService.deleteFile('https://example.com/not-supabase');

    expect(mockLogger.warn).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
