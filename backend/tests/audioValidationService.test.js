/**
 * @fileoverview Tests para audioValidationService.
 * Valida la validación de archivos de audio por magic bytes.
 */

// Mocks deben declararse antes de cualquier import del módulo a testear
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

mockLogger.child = jest.fn(() => mockLogger);

const mockFromBuffer = jest.fn();

// Registrar mocks ANTES de cualquier import
jest.mock('../src/utils/logger', () => mockLogger);
jest.mock('file-type', () => ({ fromBuffer: mockFromBuffer }));

describe('audioValidationService', () => {
  let audioValidationService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Resetear el módulo para forzar re-import con mocks frescos
    jest.resetModules();

    // Re-registrar los mocks después del reset
    jest.doMock('../src/utils/logger', () => mockLogger);
    jest.doMock('file-type', () => ({ fromBuffer: mockFromBuffer }));

    // Importar el servicio con los mocks activos
    audioValidationService = require('../src/services/audioValidationService');
  });

  describe('validateAudio', () => {
    it('should validate a valid MP3 file', async () => {
      const mockFile = {
        buffer: Buffer.from('fake-mp3-content'),
        originalname: 'sound.mp3',
        mimetype: 'audio/mpeg',
        size: 1024 * 100 // 100KB
      };

      mockFromBuffer.mockResolvedValue({ mime: 'audio/mpeg', ext: 'mp3' });
      jest.spyOn(audioValidationService, 'readDurationSeconds').mockResolvedValue(2.35);

      const result = await audioValidationService.validateAudio(mockFile);

      expect(result).toHaveProperty('buffer');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata.format).toBe('mp3');
      expect(result.metadata.mime).toBe('audio/mpeg');
      expect(result.metadata.formatName).toBe('MP3');
      expect(result.metadata.durationSeconds).toBe(2.35);
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
    });

    it('should validate a valid OGG file', async () => {
      const mockFile = {
        buffer: Buffer.from('fake-ogg-content'),
        originalname: 'sound.ogg',
        mimetype: 'audio/ogg',
        size: 1024 * 50 // 50KB
      };

      mockFromBuffer.mockResolvedValue({ mime: 'audio/ogg', ext: 'ogg' });
      jest.spyOn(audioValidationService, 'readDurationSeconds').mockResolvedValue(12.5);

      const result = await audioValidationService.validateAudio(mockFile);

      expect(result.metadata.format).toBe('ogg');
      expect(result.metadata.mime).toBe('audio/ogg');
      expect(result.metadata.durationSeconds).toBe(12.5);
    });

    it('should reject files exceeding max size', async () => {
      const mockFile = {
        buffer: Buffer.alloc(6 * 1024 * 1024), // 6MB
        originalname: 'large.mp3',
        mimetype: 'audio/mpeg',
        size: 6 * 1024 * 1024
      };

      await expect(audioValidationService.validateAudio(mockFile)).rejects.toThrow(
        /excede el tamaño máximo/i
      );
    });

    it('should reject files with invalid magic bytes', async () => {
      const mockFile = {
        buffer: Buffer.from('not-audio'),
        originalname: 'fake.mp3',
        mimetype: 'audio/mpeg',
        size: 1024
      };

      mockFromBuffer.mockResolvedValue(null);

      await expect(audioValidationService.validateAudio(mockFile)).rejects.toThrow(
        /no se pudo determinar el tipo/i
      );
    });

    it('should reject files with disallowed MIME types', async () => {
      const mockFile = {
        buffer: Buffer.from('wav-content'),
        originalname: 'sound.wav',
        mimetype: 'audio/wav',
        size: 1024
      };

      mockFromBuffer.mockResolvedValue({ mime: 'audio/wav', ext: 'wav' });

      await expect(audioValidationService.validateAudio(mockFile)).rejects.toThrow(
        /formato de audio no permitido/i
      );
    });

    it('should handle audio/mp3 MIME normalization', async () => {
      const mockFile = {
        buffer: Buffer.from('mp3-content'),
        originalname: 'sound.mp3',
        mimetype: 'audio/mp3',
        size: 1024
      };

      // Some systems report audio/mp3 instead of audio/mpeg
      mockFromBuffer.mockResolvedValue({ mime: 'audio/mp3', ext: 'mp3' });
      jest.spyOn(audioValidationService, 'readDurationSeconds').mockResolvedValue(8);

      const result = await audioValidationService.validateAudio(mockFile);

      expect(result.metadata.formatName).toBe('MP3');
    });

    it('should reject files exceeding max duration', async () => {
      const mockFile = {
        buffer: Buffer.from('long-audio-content'),
        originalname: 'long.mp3',
        mimetype: 'audio/mpeg',
        size: 1024 * 200
      };

      mockFromBuffer.mockResolvedValue({ mime: 'audio/mpeg', ext: 'mp3' });
      jest.spyOn(audioValidationService, 'readDurationSeconds').mockResolvedValue(80);

      await expect(audioValidationService.validateAudio(mockFile)).rejects.toThrow(
        /duración máxima/i
      );
    });

    it('should reject files when duration cannot be read', async () => {
      const mockFile = {
        buffer: Buffer.from('broken-audio-content'),
        originalname: 'broken.mp3',
        mimetype: 'audio/mpeg',
        size: 1024 * 20
      };

      mockFromBuffer.mockResolvedValue({ mime: 'audio/mpeg', ext: 'mp3' });
      jest
        .spyOn(audioValidationService, 'readDurationSeconds')
        .mockRejectedValue(new Error('metadata parse failed'));

      await expect(audioValidationService.validateAudio(mockFile)).rejects.toThrow(
        /duración del audio/i
      );
    });
  });

  describe('getConfig', () => {
    it('should return configuration object', () => {
      const config = audioValidationService.getConfig();

      expect(config).toHaveProperty('allowedFormats');
      expect(config.allowedFormats).toContain('MP3');
      expect(config.allowedFormats).toContain('OGG');
      expect(config).toHaveProperty('maxSizeMB', 5);
      expect(config).toHaveProperty('maxDurationSeconds', 45);
      expect(config).toHaveProperty('recommendedMaxDurationSeconds', 30);
    });
  });
});
