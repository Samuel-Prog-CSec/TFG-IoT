/**
 * @fileoverview Tests unitarios dirigidos para systemAnnouncementsValidator (T-942).
 *
 * Cubre la transform de `active` (string→boolean/undefined) en el listado, el
 * refine "Sin cambios" del update, los defaults de severity/audience en create,
 * y los límites de title/body/linkUrl/expiresAt.
 */

const {
  announcementIdParamsSchema,
  listAnnouncementsQuerySchema,
  createAnnouncementBodySchema,
  updateAnnouncementBodySchema
} = require('../../src/validators/systemAnnouncementsValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

describe('systemAnnouncementsValidator (unit)', () => {
  describe('announcementIdParamsSchema', () => {
    it('acepta ObjectId válido', () => {
      expect(announcementIdParamsSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
    });

    it('rechaza ObjectId inválido', () => {
      expect(announcementIdParamsSchema.safeParse({ id: 'nope' }).success).toBe(false);
    });
  });

  describe('listAnnouncementsQuerySchema (transform active)', () => {
    it('deja active=undefined cuando se omite', () => {
      const result = listAnnouncementsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.active).toBeUndefined();
    });

    it('transforma active="true" → true', () => {
      const result = listAnnouncementsQuerySchema.safeParse({ active: 'true' });
      expect(result.success).toBe(true);
      expect(result.data.active).toBe(true);
    });

    it('transforma active="false" → false', () => {
      const result = listAnnouncementsQuerySchema.safeParse({ active: 'false' });
      expect(result.success).toBe(true);
      expect(result.data.active).toBe(false);
    });

    it('transforma cualquier otro string → false', () => {
      const result = listAnnouncementsQuerySchema.safeParse({ active: 'banana' });
      expect(result.success).toBe(true);
      expect(result.data.active).toBe(false);
    });

    it('acepta audience permitida', () => {
      expect(listAnnouncementsQuerySchema.safeParse({ audience: 'all_teachers' }).success).toBe(
        true
      );
      expect(listAnnouncementsQuerySchema.safeParse({ audience: 'all_users' }).success).toBe(true);
    });

    it('rechaza audience fuera del catálogo', () => {
      expect(listAnnouncementsQuerySchema.safeParse({ audience: 'students' }).success).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(listAnnouncementsQuerySchema.safeParse({ foo: 1 }).success).toBe(false);
    });
  });

  describe('createAnnouncementBodySchema', () => {
    const buildBody = () => ({ title: 'Mantenimiento', body: 'El sistema estará caído.' });

    it('acepta cuerpo mínimo y aplica defaults severity=info audience=all_teachers', () => {
      const result = createAnnouncementBodySchema.safeParse(buildBody());
      expect(result.success).toBe(true);
      expect(result.data.severity).toBe('info');
      expect(result.data.audience).toBe('all_teachers');
    });

    it('acepta severity=urgent y audience=all_users explícitos', () => {
      const result = createAnnouncementBodySchema.safeParse({
        ...buildBody(),
        severity: 'urgent',
        audience: 'all_users'
      });
      expect(result.success).toBe(true);
    });

    it('rechaza title demasiado corto (min 3)', () => {
      expect(createAnnouncementBodySchema.safeParse({ ...buildBody(), title: 'ab' }).success).toBe(
        false
      );
    });

    it('rechaza title de más de 120 caracteres', () => {
      expect(
        createAnnouncementBodySchema.safeParse({ ...buildBody(), title: 'a'.repeat(121) }).success
      ).toBe(false);
    });

    it('rechaza body de más de 500 caracteres', () => {
      expect(
        createAnnouncementBodySchema.safeParse({ ...buildBody(), body: 'a'.repeat(501) }).success
      ).toBe(false);
    });

    it('acepta body multilinea (allowMultiline)', () => {
      expect(
        createAnnouncementBodySchema.safeParse({ ...buildBody(), body: 'línea1\nlínea2' }).success
      ).toBe(true);
    });

    it('acepta linkUrl válida y linkLabel', () => {
      const result = createAnnouncementBodySchema.safeParse({
        ...buildBody(),
        linkUrl: 'https://status.test/incident',
        linkLabel: 'Ver estado'
      });
      expect(result.success).toBe(true);
    });

    it('acepta linkUrl null (nullable)', () => {
      expect(
        createAnnouncementBodySchema.safeParse({ ...buildBody(), linkUrl: null }).success
      ).toBe(true);
    });

    it('rechaza linkUrl no-URL', () => {
      expect(
        createAnnouncementBodySchema.safeParse({ ...buildBody(), linkUrl: 'no-url' }).success
      ).toBe(false);
    });

    it('acepta expiresAt ISO datetime', () => {
      expect(
        createAnnouncementBodySchema.safeParse({
          ...buildBody(),
          expiresAt: '2030-01-01T00:00:00.000Z'
        }).success
      ).toBe(true);
    });

    it('rechaza expiresAt no-ISO', () => {
      expect(
        createAnnouncementBodySchema.safeParse({ ...buildBody(), expiresAt: '2030-01-01' }).success
      ).toBe(false);
    });

    it('rechaza severity fuera del catálogo', () => {
      expect(
        createAnnouncementBodySchema.safeParse({ ...buildBody(), severity: 'panic' }).success
      ).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(createAnnouncementBodySchema.safeParse({ ...buildBody(), extra: 1 }).success).toBe(
        false
      );
    });
  });

  describe('updateAnnouncementBodySchema (refine "Sin cambios")', () => {
    it('acepta actualización parcial de title', () => {
      expect(updateAnnouncementBodySchema.safeParse({ title: 'Nuevo título' }).success).toBe(true);
    });

    it('acepta actualización de severity sola', () => {
      expect(updateAnnouncementBodySchema.safeParse({ severity: 'warning' }).success).toBe(true);
    });

    it('rechaza objeto vacío (refine) con mensaje "Sin cambios"', () => {
      const result = updateAnnouncementBodySchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /Sin cambios/.test(i.message))).toBe(true);
    });

    it('acepta linkUrl=null y linkLabel=null', () => {
      expect(
        updateAnnouncementBodySchema.safeParse({ linkUrl: null, linkLabel: null }).success
      ).toBe(true);
    });

    it('rechaza body de más de 500 caracteres', () => {
      expect(updateAnnouncementBodySchema.safeParse({ body: 'a'.repeat(501) }).success).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(updateAnnouncementBodySchema.safeParse({ foo: 1 }).success).toBe(false);
    });
  });
});
