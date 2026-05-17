/**
 * @fileoverview Tests del middleware de validación por magic bytes (T-905 B3).
 *
 * Verifica que:
 * - Un PNG real (magic bytes correctos) pasa.
 * - Un PDF disfrazado de PNG es rechazado con 400.
 * - Un buffer vacío es rechazado.
 * - Un MP3 disfrazado de imagen es rechazado.
 *
 * Se ejecuta el middleware directamente con mocks de req/res/next.
 */

const {
  validateImageMagicBytes,
  validateAudioMagicBytes
} = require('../../src/middlewares/fileValidation');

// Magic bytes reales mínimos para producir detecciones positivas.
const PNG_MAGIC = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // signature
  0x00,
  0x00,
  0x00,
  0x0d, // IHDR length
  0x49,
  0x48,
  0x44,
  0x52, // IHDR
  0x00,
  0x00,
  0x00,
  0x01, // width
  0x00,
  0x00,
  0x00,
  0x01, // height
  0x08,
  0x06,
  0x00,
  0x00,
  0x00, // bit depth, color, etc.
  0x1f,
  0x15,
  0xc4,
  0x89 // crc
]);

const PDF_MAGIC = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
const MP3_MAGIC = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // ID3v2 tag

const makeReq = file => ({
  file,
  headers: { 'user-agent': 'test' },
  ip: '203.0.113.42'
});

const makeRes = () => ({});

const run = async (middleware, req) =>
  new Promise(resolve => {
    middleware(req, makeRes(), err => resolve(err));
  });

describe('fileValidationMiddleware (B3)', () => {
  describe('validateImageMagicBytes', () => {
    it('acepta PNG con magic bytes correctos', async () => {
      const req = makeReq({
        buffer: PNG_MAGIC,
        size: PNG_MAGIC.length,
        mimetype: 'image/png'
      });
      const err = await run(validateImageMagicBytes, req);
      expect(err).toBeUndefined();
      expect(req.file.mimetype).toBe('image/png');
    });

    it('rechaza PDF disfrazado de PNG (MIME spoofing)', async () => {
      const req = makeReq({
        buffer: PDF_MAGIC,
        size: PDF_MAGIC.length,
        mimetype: 'image/png'
      });
      const err = await run(validateImageMagicBytes, req);
      expect(err).toBeDefined();
      expect(err.message).toMatch(/no coincide|imagen/i);
    });

    it('rechaza buffer vacío', async () => {
      const req = makeReq({ buffer: Buffer.alloc(0), size: 0, mimetype: 'image/png' });
      const err = await run(validateImageMagicBytes, req);
      expect(err).toBeDefined();
      expect(err.message).toMatch(/vacío|ausente/i);
    });

    it('rechaza si no se puede detectar el formato (buffer aleatorio sin magic bytes)', async () => {
      const garbage = Buffer.from('totally-random-text-without-magic-bytes-12345');
      const req = makeReq({ buffer: garbage, size: garbage.length, mimetype: 'image/png' });
      const err = await run(validateImageMagicBytes, req);
      expect(err).toBeDefined();
    });

    it('rechaza MP3 enviado como image', async () => {
      const req = makeReq({ buffer: MP3_MAGIC, size: MP3_MAGIC.length, mimetype: 'image/png' });
      const err = await run(validateImageMagicBytes, req);
      expect(err).toBeDefined();
    });
  });

  describe('validateAudioMagicBytes', () => {
    it('acepta MP3 con tag ID3', async () => {
      const req = makeReq({
        buffer: MP3_MAGIC,
        size: MP3_MAGIC.length,
        mimetype: 'audio/mpeg'
      });
      const err = await run(validateAudioMagicBytes, req);
      expect(err).toBeUndefined();
    });

    it('rechaza PNG enviado como audio', async () => {
      const req = makeReq({
        buffer: PNG_MAGIC,
        size: PNG_MAGIC.length,
        mimetype: 'audio/mpeg'
      });
      const err = await run(validateAudioMagicBytes, req);
      expect(err).toBeDefined();
    });

    it('rechaza PDF disfrazado de audio', async () => {
      const req = makeReq({ buffer: PDF_MAGIC, size: PDF_MAGIC.length, mimetype: 'audio/mpeg' });
      const err = await run(validateAudioMagicBytes, req);
      expect(err).toBeDefined();
    });
  });
});
