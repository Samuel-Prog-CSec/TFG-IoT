/**
 * @fileoverview Tests del modelo ReportTemplate (T-942 Fase B).
 *
 * Cubre las invariantes clave del esquema:
 * - `key` único.
 * - `isSystem` por defecto a false.
 * - `defaults` obligatorio con sus tres campos.
 */

require('../../src/server'); // registra modelos

const ReportTemplate = require('../../src/models/ReportTemplate');

describe('ReportTemplate model', () => {
  beforeAll(async () => {
    // Garantiza que los índices del esquema (unique sobre `key`) se crean
    // antes de cualquier insercion — `Model.create` no espera por defecto a
    // que `Model.init()` termine en colecciones recién creadas.
    await ReportTemplate.syncIndexes();
  });

  beforeEach(async () => {
    await ReportTemplate.deleteMany({});
  });

  afterAll(async () => {
    await ReportTemplate.deleteMany({});
  });

  it('aplica isSystem=false por defecto cuando no se especifica', async () => {
    const tpl = await ReportTemplate.create({
      key: 'custom-tpl',
      name: 'Plantilla custom',
      description: 'Plantilla creada por super_admin',
      defaults: {
        reportType: 'classroom',
        period: '30d',
        format: 'summary'
      }
    });
    expect(tpl.isSystem).toBe(false);
    expect(tpl.icon).toBe('FileText'); // default
  });

  it('rechaza dos plantillas con la misma key (índice unique)', async () => {
    await ReportTemplate.create({
      key: 'duplicate-key',
      name: 'Primera',
      defaults: { reportType: 'classroom', period: '30d', format: 'summary' }
    });

    await expect(
      ReportTemplate.create({
        key: 'duplicate-key',
        name: 'Segunda',
        defaults: { reportType: 'student', period: '7d', format: 'detailed' }
      })
    ).rejects.toThrow();
  });

  it('exige los tres campos de defaults (reportType, period, format)', async () => {
    await expect(
      ReportTemplate.create({
        key: 'incomplete',
        name: 'Sin defaults completos',
        defaults: { reportType: 'classroom' }
      })
    ).rejects.toThrow(/obligatorio/i);
  });
});
