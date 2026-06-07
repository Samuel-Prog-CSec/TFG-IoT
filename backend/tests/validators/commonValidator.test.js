/**
 * @fileoverview Tests unitarios dirigidos para commonValidator.
 *
 * El foco son las ramas del superRefine de sanitizedString (Unicode invisible /
 * direccional y caracteres de control ASCII, con y sin allowMultiline), además
 * de cardMappingSchema, userFiltersSchema, emptyObjectSchema y los helpers
 * exportados (containsInvisibleUnicode, regex de control chars).
 *
 * Nota: los caracteres "peligrosos" se escriben con escapes \\uXXXX para mantener
 * el source ASCII limpio (evita no-irregular-whitespace / detect-bidi-characters).
 */

const {
  uidSchema,
  sanitizedString,
  cardMappingSchema,
  userFiltersSchema,
  emptyObjectSchema,
  containsInvisibleUnicode,
  CONTROL_CHARS_MULTILINE_REGEX,
  CONTROL_CHARS_STRICT_REGEX
} = require('../../src/validators/commonValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

// Codepoints construidos en runtime para no ensuciar el source con invisibles.
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const ZERO_WIDTH_JOINER = String.fromCharCode(0x200d);
const RTL_OVERRIDE = String.fromCharCode(0x202e);
const BOM = String.fromCharCode(0xfeff);
const NUL = String.fromCharCode(0x00);

describe('commonValidator (unit)', () => {
  describe('sanitizedString', () => {
    it('hace trim y acepta texto normal', () => {
      const schema = sanitizedString({ min: 2, max: 10, label: 'campo' });
      const result = schema.safeParse('  hola  ');
      expect(result.success).toBe(true);
      expect(result.data).toBe('hola');
    });

    it('aplica min con mensaje en español', () => {
      const schema = sanitizedString({ min: 3, max: 10, label: 'campo' });
      const result = schema.safeParse('ab');
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /al menos 3 caracteres/.test(i.message))).toBe(true);
    });

    it('NO aplica min cuando min=0 (rama min>0 falsa) y acepta string vacío', () => {
      const schema = sanitizedString({ min: 0, max: 10, label: 'campo' });
      expect(schema.safeParse('').success).toBe(true);
    });

    it('aplica max con mensaje en español', () => {
      const schema = sanitizedString({ min: 0, max: 5, label: 'campo' });
      const result = schema.safeParse('demasiado largo');
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /no puede exceder 5 caracteres/.test(i.message))).toBe(
        true
      );
    });

    it('rechaza Unicode invisible (zero-width U+200B) con mensaje específico', () => {
      const schema = sanitizedString({ min: 1, max: 50, label: 'campo' });
      const result = schema.safeParse(`hola${ZERO_WIDTH_SPACE}mundo`);
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(i => /caracteres invisibles o direccionales/.test(i.message))
      ).toBe(true);
    });

    it('rechaza RTL override (U+202E)', () => {
      const schema = sanitizedString({ min: 1, max: 50, label: 'campo' });
      expect(schema.safeParse(`user${RTL_OVERRIDE}gnp.exe`).success).toBe(false);
    });

    it('rechaza caracteres de control en modo estricto (sin multiline)', () => {
      const schema = sanitizedString({ min: 1, max: 50, label: 'campo' });
      const result = schema.safeParse('linea1\nlinea2');
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /caracteres de control/.test(i.message))).toBe(true);
    });

    it('permite saltos de línea con allowMultiline=true', () => {
      const schema = sanitizedString({ min: 1, max: 50, label: 'campo', allowMultiline: true });
      expect(schema.safeParse('linea1\nlinea2\tcon tab').success).toBe(true);
    });

    it('rechaza control chars no permitidos incluso con allowMultiline (ej. NUL)', () => {
      const schema = sanitizedString({ min: 1, max: 50, label: 'campo', allowMultiline: true });
      expect(schema.safeParse(`texto${NUL}oculto`).success).toBe(false);
    });

    it('usa label por defecto "valor" cuando no se pasa', () => {
      const schema = sanitizedString();
      const result = schema.safeParse('');
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /valor/.test(i.message))).toBe(true);
    });
  });

  describe('containsInvisibleUnicode (helper)', () => {
    it('detecta zero-width joiner', () => {
      expect(containsInvisibleUnicode(`a${ZERO_WIDTH_JOINER}b`)).toBe(true);
    });

    it('detecta BOM (U+FEFF)', () => {
      expect(containsInvisibleUnicode(`${BOM}abc`)).toBe(true);
    });

    it('devuelve false para texto limpio', () => {
      expect(containsInvisibleUnicode('texto normal con tildes áéí')).toBe(false);
    });
  });

  describe('regex de control chars', () => {
    it('CONTROL_CHARS_STRICT_REGEX detecta \\n', () => {
      expect(CONTROL_CHARS_STRICT_REGEX.test('a\nb')).toBe(true);
    });

    it('CONTROL_CHARS_MULTILINE_REGEX NO detecta \\n/\\t/\\r', () => {
      expect(CONTROL_CHARS_MULTILINE_REGEX.test('a\nb\tc\rd')).toBe(false);
    });

    it('CONTROL_CHARS_MULTILINE_REGEX detecta NUL', () => {
      expect(CONTROL_CHARS_MULTILINE_REGEX.test(`a${NUL}b`)).toBe(true);
    });
  });

  describe('cardMappingSchema', () => {
    it('acepta mapping válido con displayData default {}', () => {
      const result = cardMappingSchema.safeParse({ uid: '32B8FA05', assignedValue: 'España' });
      expect(result.success).toBe(true);
      expect(result.data.displayData).toEqual({});
    });

    it('normaliza el uid a mayúsculas', () => {
      const result = cardMappingSchema.safeParse({ uid: '32b8fa05', assignedValue: 'X' });
      expect(result.success).toBe(true);
      expect(result.data.uid).toBe('32B8FA05');
    });

    it('acepta displayData arbitrario', () => {
      const result = cardMappingSchema.safeParse({
        uid: '32B8FA05',
        assignedValue: 'X',
        displayData: { display: '🇪🇸', audioUrl: 'https://x/y.mp3' }
      });
      expect(result.success).toBe(true);
    });

    it('rechaza uid inválido', () => {
      expect(cardMappingSchema.safeParse({ uid: 'XYZ', assignedValue: 'X' }).success).toBe(false);
    });

    it('rechaza assignedValue vacío', () => {
      expect(cardMappingSchema.safeParse({ uid: '32B8FA05', assignedValue: '' }).success).toBe(
        false
      );
    });

    it('rechaza campos extra (strict)', () => {
      expect(
        cardMappingSchema.safeParse({ uid: '32B8FA05', assignedValue: 'X', extra: 1 }).success
      ).toBe(false);
    });
  });

  describe('uidSchema (8 y 14 hex)', () => {
    it('rechaza longitud intermedia (10)', () => {
      expect(uidSchema.safeParse('32B8FA0512').success).toBe(false);
    });

    it('acepta 14 hex', () => {
      expect(uidSchema.safeParse('32B8FA0512AB34').success).toBe(true);
    });
  });

  describe('userFiltersSchema', () => {
    it('hereda paginación y acepta filtros', () => {
      const result = userFiltersSchema.safeParse({
        role: 'student',
        status: 'active',
        classroom: '1A',
        createdBy: VALID_OBJECT_ID,
        page: '2'
      });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(2);
    });

    it('rechaza role fuera del enum', () => {
      expect(userFiltersSchema.safeParse({ role: 'ghost' }).success).toBe(false);
    });

    it('rechaza createdBy inválido', () => {
      expect(userFiltersSchema.safeParse({ createdBy: 'bad' }).success).toBe(false);
    });
  });

  describe('emptyObjectSchema', () => {
    it('acepta vacío (default {}) y rechaza cualquier clave', () => {
      expect(emptyObjectSchema.safeParse(undefined).success).toBe(true);
      expect(emptyObjectSchema.safeParse({}).success).toBe(true);
      expect(emptyObjectSchema.safeParse({ a: 1 }).success).toBe(false);
    });
  });
});
