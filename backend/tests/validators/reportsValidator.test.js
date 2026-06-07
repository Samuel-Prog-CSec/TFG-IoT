/**
 * @fileoverview Tests unitarios dirigidos para reportsValidator (T-942 Fase B).
 *
 * Cubre las transformaciones de recentReportsQuerySchema (page/limit string→int
 * con default y tope 50), el superRefine de saveGeneratedBodySchema (studentId
 * obligatorio si reportType=student), createTemplateBodySchema (regex de key,
 * default de icon, defaults anidados) y los params de ObjectId.
 */

const {
  reportDefaultsSchema,
  createTemplateBodySchema,
  templateIdParamsSchema,
  generatedReportIdParamsSchema,
  recentReportsQuerySchema,
  saveGeneratedBodySchema
} = require('../../src/validators/reportsValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

describe('reportsValidator (unit)', () => {
  describe('reportDefaultsSchema', () => {
    it('acepta una combinación válida', () => {
      const result = reportDefaultsSchema.safeParse({
        reportType: 'classroom',
        period: '30d',
        format: 'summary'
      });
      expect(result.success).toBe(true);
    });

    it('rechaza reportType desconocido', () => {
      expect(
        reportDefaultsSchema.safeParse({ reportType: 'global', period: '7d', format: 'summary' })
          .success
      ).toBe(false);
    });

    it('rechaza period fuera del enum', () => {
      expect(
        reportDefaultsSchema.safeParse({
          reportType: 'student',
          period: '1d',
          format: 'detailed'
        }).success
      ).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(
        reportDefaultsSchema.safeParse({
          reportType: 'student',
          period: '7d',
          format: 'summary',
          extra: 1
        }).success
      ).toBe(false);
    });
  });

  describe('createTemplateBodySchema', () => {
    const buildTemplate = () => ({
      key: 'mi-plantilla',
      name: 'Mi Plantilla',
      defaults: { reportType: 'classroom', period: '30d', format: 'summary' }
    });

    it('acepta una plantilla válida y aplica default icon=FileText', () => {
      const result = createTemplateBodySchema.safeParse(buildTemplate());
      expect(result.success).toBe(true);
      expect(result.data.icon).toBe('FileText');
    });

    it('acepta description y icon explícitos', () => {
      const result = createTemplateBodySchema.safeParse({
        ...buildTemplate(),
        description: 'Una descripción multilinea\ncon salto',
        icon: 'BarChart'
      });
      expect(result.success).toBe(true);
      expect(result.data.icon).toBe('BarChart');
    });

    it('rechaza key vacía', () => {
      expect(createTemplateBodySchema.safeParse({ ...buildTemplate(), key: '' }).success).toBe(
        false
      );
    });

    it('rechaza key con mayúsculas (regex lowercase/números/guiones)', () => {
      expect(
        createTemplateBodySchema.safeParse({ ...buildTemplate(), key: 'MiPlantilla' }).success
      ).toBe(false);
    });

    it('rechaza key con espacios o símbolos', () => {
      expect(
        createTemplateBodySchema.safeParse({ ...buildTemplate(), key: 'mi plantilla' }).success
      ).toBe(false);
      expect(
        createTemplateBodySchema.safeParse({ ...buildTemplate(), key: 'mi_plantilla' }).success
      ).toBe(false);
    });

    it('rechaza key de más de 50 caracteres', () => {
      expect(
        createTemplateBodySchema.safeParse({ ...buildTemplate(), key: 'a'.repeat(51) }).success
      ).toBe(false);
    });

    it('rechaza icon de más de 40 caracteres', () => {
      expect(
        createTemplateBodySchema.safeParse({ ...buildTemplate(), icon: 'a'.repeat(41) }).success
      ).toBe(false);
    });

    it('rechaza name demasiado corto (min 2)', () => {
      expect(createTemplateBodySchema.safeParse({ ...buildTemplate(), name: 'A' }).success).toBe(
        false
      );
    });

    it('rechaza si falta defaults', () => {
      const template = buildTemplate();
      delete template.defaults;
      expect(createTemplateBodySchema.safeParse(template).success).toBe(false);
    });

    it('rechaza isSystem (no aceptado del cliente, strict)', () => {
      expect(
        createTemplateBodySchema.safeParse({ ...buildTemplate(), isSystem: true }).success
      ).toBe(false);
    });
  });

  describe('recentReportsQuerySchema (transform string→int)', () => {
    it('aplica defaults page=1 limit=20 con query vacía', () => {
      const result = recentReportsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    });

    it('parsea page/limit string a number', () => {
      const result = recentReportsQuerySchema.safeParse({ page: '2', limit: '10' });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    });

    it('rechaza limit > 50 (tope)', () => {
      expect(recentReportsQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
    });

    it('rechaza page < 1', () => {
      expect(recentReportsQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(recentReportsQuerySchema.safeParse({ foo: '1' }).success).toBe(false);
    });
  });

  describe('saveGeneratedBodySchema (superRefine studentId)', () => {
    const buildClassroom = () => ({
      reportType: 'classroom',
      period: '30d',
      format: 'summary',
      title: 'Informe de Aula',
      payload: { rows: [] }
    });

    it('acepta un informe classroom sin studentId', () => {
      expect(saveGeneratedBodySchema.safeParse(buildClassroom()).success).toBe(true);
    });

    it('acepta un informe student con studentId', () => {
      const result = saveGeneratedBodySchema.safeParse({
        ...buildClassroom(),
        reportType: 'student',
        studentId: VALID_OBJECT_ID
      });
      expect(result.success).toBe(true);
    });

    it('rechaza student SIN studentId (superRefine) con path studentId', () => {
      const result = saveGeneratedBodySchema.safeParse({
        ...buildClassroom(),
        reportType: 'student'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => i.path.includes('studentId'))).toBe(true);
    });

    it('rechaza payload null (refine obligatorio)', () => {
      const result = saveGeneratedBodySchema.safeParse({ ...buildClassroom(), payload: null });
      expect(result.success).toBe(false);
    });

    it('rechaza payload undefined (refine obligatorio)', () => {
      const body = buildClassroom();
      delete body.payload;
      expect(saveGeneratedBodySchema.safeParse(body).success).toBe(false);
    });

    it('acepta metadata con contextIds/mechanicIds válidos', () => {
      const result = saveGeneratedBodySchema.safeParse({
        ...buildClassroom(),
        metadata: { contextIds: [VALID_OBJECT_ID], mechanicIds: [VALID_OBJECT_ID] }
      });
      expect(result.success).toBe(true);
    });

    it('rechaza metadata.contextIds con ObjectId inválido', () => {
      expect(
        saveGeneratedBodySchema.safeParse({
          ...buildClassroom(),
          metadata: { contextIds: ['bad'] }
        }).success
      ).toBe(false);
    });

    it('rechaza metadata con campos extra (strict anidado)', () => {
      expect(
        saveGeneratedBodySchema.safeParse({
          ...buildClassroom(),
          metadata: { extra: true }
        }).success
      ).toBe(false);
    });

    it('acepta templateKey opcional', () => {
      expect(
        saveGeneratedBodySchema.safeParse({ ...buildClassroom(), templateKey: 'plantilla-x' })
          .success
      ).toBe(true);
    });

    it('rechaza templateKey de más de 50 caracteres', () => {
      expect(
        saveGeneratedBodySchema.safeParse({ ...buildClassroom(), templateKey: 'a'.repeat(51) })
          .success
      ).toBe(false);
    });

    it('rechaza title demasiado corto (min 2)', () => {
      expect(saveGeneratedBodySchema.safeParse({ ...buildClassroom(), title: 'A' }).success).toBe(
        false
      );
    });
  });

  describe('params schemas', () => {
    it('templateIdParamsSchema acepta ObjectId, rechaza basura', () => {
      expect(templateIdParamsSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(templateIdParamsSchema.safeParse({ id: 'bad' }).success).toBe(false);
    });

    it('generatedReportIdParamsSchema acepta ObjectId, rechaza basura', () => {
      expect(generatedReportIdParamsSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(generatedReportIdParamsSchema.safeParse({ id: 'bad' }).success).toBe(false);
    });
  });
});
