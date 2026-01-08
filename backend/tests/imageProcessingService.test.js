/**
 * @fileoverview Tests para imageProcessingService.
 * Valida el procesamiento, conversión y validación de imágenes.
 */

// Mocks deben declararse antes de cualquier import del módulo a testear
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

const mockFromBuffer = jest.fn();

const mockSharpInstance = {
  metadata: jest.fn(),
  resize: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  toBuffer: jest.fn()
};

const mockSharp = jest.fn(() => mockSharpInstance);

// Registrar mocks ANTES de cualquier import
jest.mock('../src/utils/logger', () => mockLogger);
jest.mock('file-type', () => ({ fromBuffer: mockFromBuffer }));
jest.mock('sharp', () => mockSharp);

describe('imageProcessingService', () => {
  let imageProcessingService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Resetear el módulo para forzar re-import con mocks frescos
    jest.resetModules();

    // Re-registrar los mocks después del reset
    jest.doMock('../src/utils/logger', () => mockLogger);
    jest.doMock('file-type', () => ({ fromBuffer: mockFromBuffer }));
    jest.doMock('sharp', () => mockSharp);

    // Importar el servicio con los mocks activos
    imageProcessingService = require('../src/services/imageProcessingService');

    // Configurar valores por defecto para los mocks
    mockSharpInstance.metadata.mockResolvedValue({
      width: 500,
      height: 500,
      format: 'png'
    });
    mockSharpInstance.resize.mockReturnThis();
    mockSharpInstance.webp.mockReturnThis();
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('processed-image'));
  });

  describe('processImage', () => {
    it('should process a valid PNG image and return WebP buffers', async () => {
      const mockFile = {
        buffer: Buffer.from('fake-png-content'),
        originalname: 'test.png',
        mimetype: 'image/png',
        size: 1024 * 100 // 100KB
      };

      mockFromBuffer.mockResolvedValue({ mime: 'image/png', ext: 'png' });

      const result = await imageProcessingService.processImage(mockFile);

      expect(result).toHaveProperty('mainImage');
      expect(result).toHaveProperty('thumbnail');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata.format).toBe('webp');
      expect(result.metadata.quality).toBe(85);
      expect(Buffer.isBuffer(result.mainImage)).toBe(true);
      expect(Buffer.isBuffer(result.thumbnail)).toBe(true);
    });

    it('should reject files exceeding max size', async () => {
      const mockFile = {
        buffer: Buffer.alloc(10 * 1024 * 1024), // 10MB
        originalname: 'large.png',
        mimetype: 'image/png',
        size: 10 * 1024 * 1024
      };

      await expect(imageProcessingService.processImage(mockFile)).rejects.toThrow(
        /excede el tamaño máximo/i
      );
    });

    it('should reject files with invalid magic bytes', async () => {
      const mockFile = {
        buffer: Buffer.from('not-an-image'),
        originalname: 'fake.png',
        mimetype: 'image/png',
        size: 1024
      };

      mockFromBuffer.mockResolvedValue(null);

      await expect(imageProcessingService.processImage(mockFile)).rejects.toThrow(
        /no se pudo determinar el tipo/i
      );
    });

    it('should reject files with disallowed MIME types', async () => {
      const mockFile = {
        buffer: Buffer.from('executable-content'),
        originalname: 'malware.exe',
        mimetype: 'application/octet-stream',
        size: 1024
      };

      mockFromBuffer.mockResolvedValue({ mime: 'application/x-msdownload', ext: 'exe' });

      await expect(imageProcessingService.processImage(mockFile)).rejects.toThrow(
        /formato de imagen no permitido/i
      );
    });

    it('should reject images below minimum dimensions', async () => {
      const mockFile = {
        buffer: Buffer.from('small-image'),
        originalname: 'tiny.png',
        mimetype: 'image/png',
        size: 500
      };

      mockFromBuffer.mockResolvedValue({ mime: 'image/png', ext: 'png' });

      // Override metadata para retornar dimensiones pequeñas
      mockSharpInstance.metadata.mockResolvedValue({
        width: 100,
        height: 100,
        format: 'png'
      });

      await expect(imageProcessingService.processImage(mockFile)).rejects.toThrow(
        /demasiado pequeña/i
      );
    });
  });

  describe('getConfig', () => {
    it('should return configuration object', () => {
      const config = imageProcessingService.getConfig();

      expect(config).toHaveProperty('allowedFormats');
      expect(config).toHaveProperty('outputFormat', 'WebP');
      expect(config).toHaveProperty('maxInputSizeMB', 8);
      expect(config).toHaveProperty('minDimensions');
      expect(config).toHaveProperty('maxDimensions');
      expect(config).toHaveProperty('thumbnailDimensions');
    });
  });
});
