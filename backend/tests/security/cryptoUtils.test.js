/**
 * @fileoverview Tests del cifrado simétrico AES-256-GCM (T-905 B2).
 *
 * Verifica:
 * - Round-trip encrypt/decrypt con y sin AAD.
 * - Cambiar la AAD invalida la descripción (domain separation).
 * - IV diferente en cada cifrado del mismo plaintext (no determinismo).
 * - Auth tag invalida si se modifica el ciphertext.
 * - Errores claros con envoltorios malformados.
 */

const crypto = require('node:crypto');
const {
  encryptField,
  decryptField,
  cryptoShred,
  _resetKeyCache
} = require('../../src/utils/cryptoUtils');

describe('cryptoUtils AES-256-GCM (B2)', () => {
  const ORIGINAL_KEY = process.env.MFA_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    _resetKeyCache();
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.MFA_ENCRYPTION_KEY;
    } else {
      process.env.MFA_ENCRYPTION_KEY = ORIGINAL_KEY;
    }
    _resetKeyCache();
  });

  describe('encryptField / decryptField', () => {
    it('round-trip sin AAD: plaintext recuperado intacto', () => {
      const plaintext = 'JBSWY3DPEHPK3PXP'; // formato típico TOTP secret
      const envelope = encryptField(plaintext);
      expect(decryptField(envelope)).toBe(plaintext);
    });

    it('round-trip con AAD: plaintext recuperado intacto si AAD coincide', () => {
      const plaintext = 'super-secreto';
      const envelope = encryptField(plaintext, 'mfa');
      expect(decryptField(envelope, 'mfa')).toBe(plaintext);
    });

    it('fallida si AAD distinta (domain separation)', () => {
      const envelope = encryptField('secret-A', 'mfa');
      expect(() => decryptField(envelope, 'notes')).toThrow();
    });

    it('fallida si AAD presente al cifrar pero ausente al descifrar', () => {
      const envelope = encryptField('x', 'mfa');
      expect(() => decryptField(envelope)).toThrow();
    });

    it('genera IV distinto en cada cifrado del mismo plaintext', () => {
      const plaintext = 'mismo-input';
      const e1 = encryptField(plaintext);
      const e2 = encryptField(plaintext);
      expect(e1).not.toBe(e2);
      // Pero ambos deberían descifrarse al mismo plaintext
      expect(decryptField(e1)).toBe(plaintext);
      expect(decryptField(e2)).toBe(plaintext);
    });

    it('auth tag detecta tampering en ciphertext', () => {
      const envelope = encryptField('original');
      const parts = envelope.split(':');
      // Flip 1 bit del ciphertext
      const lastChar = parts[2].slice(-1);
      const flipped = parts[2].slice(0, -1) + (lastChar === 'f' ? '0' : 'f');
      const tampered = `${parts[0]}:${parts[1]}:${flipped}`;
      expect(() => decryptField(tampered)).toThrow();
    });

    it('rechaza envoltorios con formato inválido', () => {
      expect(() => decryptField('no-tiene-separadores')).toThrow();
      expect(() => decryptField('iv:tag')).toThrow(); // solo 2 segmentos
      expect(() => decryptField('xx:yy:zz')).toThrow(); // longitudes incorrectas
    });

    it('rechaza plaintext no-string al cifrar', () => {
      expect(() => encryptField(42)).toThrow(TypeError);
      expect(() => encryptField(null)).toThrow(TypeError);
    });
  });

  describe('cryptoShred', () => {
    it('sobrescribe un Buffer in-place con ceros', () => {
      const buf = Buffer.from('sensible-secreto-12345678');
      cryptoShred(buf);
      expect(buf.every(byte => byte === 0)).toBe(true);
    });

    it('no-op silencioso si no es Buffer', () => {
      expect(() => cryptoShred('string')).not.toThrow();
      expect(() => cryptoShred(null)).not.toThrow();
    });
  });
});
