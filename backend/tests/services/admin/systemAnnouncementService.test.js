/**
 * @fileoverview Tests del servicio SystemAnnouncement (T-942).
 */

const mongoose = require('mongoose');
const systemAnnouncementService = require('../../../src/services/admin/systemAnnouncementService');
const systemAnnouncementRepository = require('../../../src/repositories/systemAnnouncementRepository');

jest.mock('../../../src/services/redisService', () => ({
  get: jest.fn(),
  setWithTTL: jest.fn().mockResolvedValue(true),
  del: jest.fn(),
  scanByNamespace: jest.fn().mockResolvedValue([]),
  delMany: jest.fn().mockResolvedValue(0),
  flushNamespace: jest.fn().mockResolvedValue(0),
  NAMESPACES: {}
}));

describe('systemAnnouncementService.create', () => {
  const createdBy = new mongoose.Types.ObjectId();
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('exige title y body', async () => {
    await expect(
      systemAnnouncementService.create({ title: '', body: '', createdBy })
    ).rejects.toThrow(/obligatorios/);
  });

  it('rechaza expiresAt en el pasado', async () => {
    jest.spyOn(systemAnnouncementRepository, 'countActiveForAudience').mockResolvedValue(0);
    await expect(
      systemAnnouncementService.create({
        title: 'Aviso',
        body: 'Cuerpo',
        expiresAt: new Date(Date.now() - 1000),
        createdBy
      })
    ).rejects.toThrow(/futuro/);
  });

  it('respeta el límite máximo de avisos activos por audiencia', async () => {
    jest.spyOn(systemAnnouncementRepository, 'countActiveForAudience').mockResolvedValue(3);
    await expect(
      systemAnnouncementService.create({
        title: 'Aviso',
        body: 'Cuerpo',
        createdBy
      })
    ).rejects.toThrow(/Máximo/);
  });

  it('crea con defaults razonables', async () => {
    jest.spyOn(systemAnnouncementRepository, 'countActiveForAudience').mockResolvedValue(0);
    jest.spyOn(systemAnnouncementRepository, 'create').mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      title: 'A',
      body: 'B',
      severity: 'info',
      audience: 'all_teachers',
      createdBy
    });

    const doc = await systemAnnouncementService.create({
      title: 'A',
      body: 'B',
      createdBy
    });
    expect(doc.severity).toBe('info');
    expect(doc.audience).toBe('all_teachers');
  });
});

describe('systemAnnouncementService.archive', () => {
  it('lanza NotFound si no existe', async () => {
    jest.spyOn(systemAnnouncementRepository, 'findById').mockResolvedValue(null);
    await expect(
      systemAnnouncementService.archive('nada', new mongoose.Types.ObjectId())
    ).rejects.toThrow(/Aviso/);
  });
});
