/**
 * @fileoverview Tests unitarios para los validadores Zod.
 * Verifica schemas de commonValidator, userValidator, cardDeckValidator y rfidValidator.
 */

const {
  objectIdSchema,
  uidSchema,
  paginationSchema
} = require('../src/validators/commonValidator');
const {
  loginSchema,
  registerTeacherSchema,
  passwordSchema,
  createStudentSchema,
  updateConsentSchema,
  hardDeleteSchema
} = require('../src/validators/userValidator');
const { createCardDeckSchema } = require('../src/validators/cardDeckValidator');
const { rfidClientEventSchema } = require('../src/validators/rfidValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

describe('Validators', () => {
  describe('commonValidator', () => {
    describe('objectIdSchema', () => {
      it('accepts a valid 24-char hex ObjectId', () => {
        expect(objectIdSchema.safeParse(VALID_OBJECT_ID).success).toBe(true);
      });

      it('rejects an invalid ObjectId', () => {
        expect(objectIdSchema.safeParse('invalid').success).toBe(false);
        expect(objectIdSchema.safeParse('507f1f77bcf86cd79943901').success).toBe(false);
        expect(objectIdSchema.safeParse('').success).toBe(false);
      });

      it('rejects non-hex characters', () => {
        expect(objectIdSchema.safeParse('507f1f77bcf86cd79943901g').success).toBe(false);
      });
    });

    describe('uidSchema', () => {
      it('accepts 8-char hex UID', () => {
        const result = uidSchema.safeParse('32B8FA05');
        expect(result.success).toBe(true);
        expect(result.data).toBe('32B8FA05');
      });

      it('accepts 14-char hex UID', () => {
        expect(uidSchema.safeParse('32B8FA0512AB34').success).toBe(true);
      });

      it('converts to uppercase', () => {
        const result = uidSchema.safeParse('32b8fa05');
        expect(result.success).toBe(true);
        expect(result.data).toBe('32B8FA05');
      });

      it('trims whitespace', () => {
        const result = uidSchema.safeParse('  32B8FA05  ');
        expect(result.success).toBe(true);
        expect(result.data).toBe('32B8FA05');
      });

      it('rejects invalid lengths', () => {
        expect(uidSchema.safeParse('32B8FA').success).toBe(false);
        expect(uidSchema.safeParse('32B8FA0512').success).toBe(false);
        expect(uidSchema.safeParse('').success).toBe(false);
      });

      it('rejects non-hex characters', () => {
        expect(uidSchema.safeParse('ZZZZZZZZ').success).toBe(false);
      });
    });

    describe('paginationSchema', () => {
      it('uses defaults when no values provided', () => {
        const result = paginationSchema.safeParse({});
        expect(result.success).toBe(true);
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sortBy).toBe('createdAt');
        expect(result.data.order).toBe('desc');
      });

      it('parses string page/limit to numbers', () => {
        const result = paginationSchema.safeParse({ page: '3', limit: '50' });
        expect(result.success).toBe(true);
        expect(result.data.page).toBe(3);
        expect(result.data.limit).toBe(50);
      });

      it('rejects page < 1', () => {
        expect(paginationSchema.safeParse({ page: '0' }).success).toBe(false);
      });

      it('rejects limit > 100', () => {
        expect(paginationSchema.safeParse({ limit: '101' }).success).toBe(false);
      });

      it('rejects unknown fields (strict)', () => {
        expect(paginationSchema.safeParse({ unknown: 'x' }).success).toBe(false);
      });
    });
  });

  describe('userValidator', () => {
    describe('loginSchema', () => {
      it('accepts valid email and password', () => {
        const result = loginSchema.safeParse({
          email: 'test@example.com',
          password: 'Test1234!'
        });
        expect(result.success).toBe(true);
      });

      it('rejects invalid email', () => {
        expect(
          loginSchema.safeParse({
            email: 'not-an-email',
            password: 'Test1234!'
          }).success
        ).toBe(false);
      });

      it('rejects empty password', () => {
        expect(
          loginSchema.safeParse({
            email: 'test@example.com',
            password: ''
          }).success
        ).toBe(false);
      });

      it('rejects extra fields (strict)', () => {
        expect(
          loginSchema.safeParse({
            email: 'test@example.com',
            password: 'x',
            extra: 'field'
          }).success
        ).toBe(false);
      });
    });

    describe('passwordSchema', () => {
      it('accepts a strong password', () => {
        expect(passwordSchema.safeParse('Test1234!').success).toBe(true);
      });

      it('rejects password shorter than 8 chars', () => {
        expect(passwordSchema.safeParse('Te1!').success).toBe(false);
      });

      it('rejects password without uppercase', () => {
        expect(passwordSchema.safeParse('test1234!').success).toBe(false);
      });

      it('rejects password without lowercase', () => {
        expect(passwordSchema.safeParse('TEST1234!').success).toBe(false);
      });

      it('rejects password without digit', () => {
        expect(passwordSchema.safeParse('Testtest!').success).toBe(false);
      });
    });

    describe('registerTeacherSchema', () => {
      const validTeacher = {
        name: 'Prof Test',
        email: 'prof@test.com',
        password: 'Test1234!'
      };

      it('accepts valid teacher registration', () => {
        expect(registerTeacherSchema.safeParse(validTeacher).success).toBe(true);
      });

      it('rejects name shorter than 2 chars', () => {
        expect(
          registerTeacherSchema.safeParse({
            ...validTeacher,
            name: 'A'
          }).success
        ).toBe(false);
      });

      it('rejects extra fields like role (strict)', () => {
        expect(
          registerTeacherSchema.safeParse({
            ...validTeacher,
            role: 'super_admin'
          }).success
        ).toBe(false);
      });

      it('rejects non-empty honeypot website field', () => {
        expect(
          registerTeacherSchema.safeParse({
            ...validTeacher,
            website: 'https://spam.com'
          }).success
        ).toBe(false);
      });
    });

    describe('createStudentSchema', () => {
      const validStudent = {
        name: 'Alumno Test',
        profile: { age: 8 },
        teacherId: VALID_OBJECT_ID,
        consent: {
          granted: true,
          grantedBy: 'Tutor Test'
        }
      };

      it('accepts valid student', () => {
        expect(createStudentSchema.safeParse(validStudent).success).toBe(true);
      });

      it('rejects student without teacherId', () => {
        const { teacherId: _removed, ...noTeacher } = validStudent;
        expect(createStudentSchema.safeParse(noTeacher).success).toBe(false);
      });

      it('rejects student with age below 3', () => {
        expect(
          createStudentSchema.safeParse({
            ...validStudent,
            profile: { age: 2 }
          }).success
        ).toBe(false);
      });

      it('rejects extra fields like email (strict)', () => {
        expect(
          createStudentSchema.safeParse({
            ...validStudent,
            email: 'student@test.com'
          }).success
        ).toBe(false);
      });
    });
  });

  describe('cardDeckValidator', () => {
    const buildValidDeck = () => ({
      name: 'Test Deck',
      contextId: VALID_OBJECT_ID,
      cardMappings: [
        { uid: '32B8FA05', assignedValue: 'Cat' },
        { uid: 'AABB1122', assignedValue: 'Dog' }
      ]
    });

    it('accepts a valid deck with 2+ mappings', () => {
      expect(createCardDeckSchema.safeParse(buildValidDeck()).success).toBe(true);
    });

    it('rejects deck with fewer than 2 mappings', () => {
      const deck = buildValidDeck();
      deck.cardMappings = [{ uid: '32B8FA05', assignedValue: 'Cat' }];
      expect(createCardDeckSchema.safeParse(deck).success).toBe(false);
    });

    it('rejects deck with duplicate UIDs', () => {
      const deck = buildValidDeck();
      deck.cardMappings[1].uid = deck.cardMappings[0].uid;
      expect(createCardDeckSchema.safeParse(deck).success).toBe(false);
    });

    it('rejects deck with duplicate assignedValues', () => {
      const deck = buildValidDeck();
      deck.cardMappings[1].assignedValue = deck.cardMappings[0].assignedValue;
      expect(createCardDeckSchema.safeParse(deck).success).toBe(false);
    });

    it('rejects deck with invalid UID format', () => {
      const deck = buildValidDeck();
      deck.cardMappings[0].uid = 'INVALID';
      expect(createCardDeckSchema.safeParse(deck).success).toBe(false);
    });

    it('rejects deck without name', () => {
      const deck = buildValidDeck();
      delete deck.name;
      expect(createCardDeckSchema.safeParse(deck).success).toBe(false);
    });

    it('rejects deck without contextId', () => {
      const deck = buildValidDeck();
      delete deck.contextId;
      expect(createCardDeckSchema.safeParse(deck).success).toBe(false);
    });
  });

  describe('rfidValidator', () => {
    const buildValidRfidEvent = () => ({
      uid: '32B8FA05',
      type: 'MIFARE_1KB',
      sensorId: 'sensor-001',
      timestamp: Date.now(),
      source: 'web_serial'
    });

    it('accepts valid RFID client event', () => {
      expect(rfidClientEventSchema.safeParse(buildValidRfidEvent()).success).toBe(true);
    });

    it('rejects unknown source', () => {
      const event = buildValidRfidEvent();
      event.source = 'bluetooth';
      expect(rfidClientEventSchema.safeParse(event).success).toBe(false);
    });

    it('rejects invalid card type', () => {
      const event = buildValidRfidEvent();
      event.type = 'INVALID_TYPE';
      expect(rfidClientEventSchema.safeParse(event).success).toBe(false);
    });

    it('rejects timestamp too far in the past', () => {
      const event = buildValidRfidEvent();
      event.timestamp = Date.now() - 60000;
      expect(rfidClientEventSchema.safeParse(event).success).toBe(false);
    });

    it('rejects invalid sensorId characters', () => {
      const event = buildValidRfidEvent();
      event.sensorId = 'sensor with spaces!';
      expect(rfidClientEventSchema.safeParse(event).success).toBe(false);
    });

    it('rejects extra fields (strict)', () => {
      const event = buildValidRfidEvent();
      event.extra = 'field';
      expect(rfidClientEventSchema.safeParse(event).success).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Validators RGPD — Consentimiento y borrado (ADR-031/032)
  // ────────────────────────────────────────────────────────────

  describe('updateConsentSchema (Art. 7.3 RGPD)', () => {
    it('acepta revocación válida (granted: false)', () => {
      expect(updateConsentSchema.safeParse({ granted: false }).success).toBe(true);
    });

    it('acepta otorgamiento con grantedBy', () => {
      expect(
        updateConsentSchema.safeParse({ granted: true, grantedBy: 'Ana García' }).success
      ).toBe(true);
    });

    it('rechaza otorgamiento sin grantedBy (refine)', () => {
      const result = updateConsentSchema.safeParse({ granted: true });
      expect(result.success).toBe(false);
    });

    it('rechaza grantedBy demasiado corto', () => {
      const result = updateConsentSchema.safeParse({ granted: true, grantedBy: 'A' });
      expect(result.success).toBe(false);
    });

    it('acepta purposes opcionales válidos', () => {
      const result = updateConsentSchema.safeParse({
        granted: true,
        grantedBy: 'Ana García',
        purposes: ['educational_tracking']
      });
      expect(result.success).toBe(true);
    });

    it('rechaza purposes inválidos', () => {
      const result = updateConsentSchema.safeParse({
        granted: true,
        grantedBy: 'Ana García',
        purposes: ['invalid_purpose']
      });
      expect(result.success).toBe(false);
    });

    it('rechaza campos extra (strict mode)', () => {
      const result = updateConsentSchema.safeParse({
        granted: true,
        grantedBy: 'Ana García',
        extraField: 'hack'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('hardDeleteSchema (Art. 17 RGPD)', () => {
    it('acepta confirmDeletion: true', () => {
      expect(hardDeleteSchema.safeParse({ confirmDeletion: true }).success).toBe(true);
    });

    it('rechaza confirmDeletion: false', () => {
      expect(hardDeleteSchema.safeParse({ confirmDeletion: false }).success).toBe(false);
    });

    it('rechaza sin confirmDeletion', () => {
      expect(hardDeleteSchema.safeParse({}).success).toBe(false);
    });

    it('rechaza campos extra (strict mode)', () => {
      expect(hardDeleteSchema.safeParse({ confirmDeletion: true, extra: 1 }).success).toBe(false);
    });
  });
});
