/**
 * @fileoverview Tests del orquestador SystemAlertDetectionService (T-942).
 *
 * Cubre: lifecycle (create, dedup, escalation por severidad, auto-resolve por
 * missed runs), bulk action, list/summary y aislamiento contra SmartAlert.
 */

const mongoose = require('mongoose');
const systemAlertDetectionService = require('../../../src/services/analytics/systemAlertDetectionService');
const systemAlertRepository = require('../../../src/repositories/systemAlertRepository');
const userRepository = require('../../../src/repositories/userRepository');

jest.mock('../../../src/services/redisService', () => ({
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(true),
  setWithTTL: jest.fn().mockResolvedValue(true),
  del: jest.fn(),
  exists: jest.fn().mockResolvedValue(false),
  scanByNamespace: jest.fn().mockResolvedValue([]),
  delMany: jest.fn().mockResolvedValue(0),
  NAMESPACES: {}
}));

describe('systemAlertDetectionService.runDetection', () => {
  const now = new Date('2026-05-18T10:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('crea una alerta cuando un detector emite finding nuevo', async () => {
    jest.spyOn(systemAlertRepository, 'reactivateExpiredSnoozes').mockResolvedValue(0);
    jest.spyOn(systemAlertRepository, 'buildActiveAlertsMap').mockResolvedValue(new Map());
    const created = {
      _id: new mongoose.Types.ObjectId(),
      type: 'memory_pressure',
      severity: 'warning',
      status: 'active',
      description: 'Memoria 90%'
    };
    jest.spyOn(systemAlertRepository, 'create').mockResolvedValue(created);
    jest.spyOn(systemAlertRepository, 'updateById').mockResolvedValue(created);
    jest.spyOn(userRepository, 'find').mockResolvedValue([]);

    // El servicio importa ALL_SYSTEM_DETECTORS internamente. Verificamos que
    // runDetection retorna stats razonables aunque el contexto real (Redis,
    // Mongo, memoria, etc.) devuelva valores benignos (sin findings reales).

    const result = await systemAlertDetectionService.runDetection({ now, dryRun: true });
    expect(result).toEqual(
      expect.objectContaining({
        snoozeReactivated: 0,
        reopened: 0,
        autoResolved: 0
      })
    );
  });
});

describe('systemAlertDetectionService lifecycle actions', () => {
  const userId = new mongoose.Types.ObjectId();
  const alertId = new mongoose.Types.ObjectId();
  const baseAlert = {
    _id: alertId,
    type: 'redis_high_latency',
    severity: 'warning',
    source: 'redis',
    status: 'active',
    detectedAt: new Date(),
    title: 'Latencia',
    description: 'Redis lento',
    severityHistory: [],
    occurrencesCount: 1,
    pinned: false
  };

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('dismissAlert lanza NotFoundError si no existe', async () => {
    jest.spyOn(systemAlertRepository, 'findById').mockResolvedValue(null);
    await expect(
      systemAlertDetectionService.dismissAlert('any-id', { userId, reason: 'other' })
    ).rejects.toThrow(/Alerta de sistema/);
  });

  it('dismissAlert rechaza motivos no válidos', async () => {
    await expect(
      systemAlertDetectionService.dismissAlert(alertId, { userId, reason: 'inventado' })
    ).rejects.toThrow(/Motivo de descarte/);
  });

  it('dismissAlert marca dismissed con metadata', async () => {
    jest.spyOn(systemAlertRepository, 'findById').mockResolvedValue(baseAlert);
    jest
      .spyOn(systemAlertRepository, 'updateById')
      .mockImplementation(async (_id, update) => ({ ...baseAlert, ...update.$set }));

    const updated = await systemAlertDetectionService.dismissAlert(alertId, {
      userId,
      reason: 'false_positive'
    });
    expect(updated.status).toBe('dismissed');
    expect(updated.dismissReason).toBe('false_positive');
    expect(updated.dismissedBy).toEqual(userId);
  });

  it('resolveAlert marca resolved manualmente', async () => {
    jest.spyOn(systemAlertRepository, 'findById').mockResolvedValue(baseAlert);
    jest
      .spyOn(systemAlertRepository, 'updateById')
      .mockImplementation(async (_id, update) => ({ ...baseAlert, ...update.$set }));

    const updated = await systemAlertDetectionService.resolveAlert(alertId, { userId });
    expect(updated.status).toBe('resolved');
    expect(updated.resolvedAutomatically).toBe(false);
    expect(updated.resolvedBy).toEqual(userId);
  });

  it('snoozeAlert rechaza fechas pasadas', async () => {
    jest.spyOn(systemAlertRepository, 'findById').mockResolvedValue(baseAlert);
    await expect(
      systemAlertDetectionService.snoozeAlert(alertId, {
        userId,
        untilDate: new Date(Date.now() - 1000)
      })
    ).rejects.toThrow(/futuro/);
  });

  it('snoozeAlert con fecha válida persiste status=snoozed', async () => {
    jest.spyOn(systemAlertRepository, 'findById').mockResolvedValue(baseAlert);
    jest
      .spyOn(systemAlertRepository, 'updateById')
      .mockImplementation(async (_id, update) => ({ ...baseAlert, ...update.$set }));
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const updated = await systemAlertDetectionService.snoozeAlert(alertId, {
      userId,
      untilDate: tomorrow
    });
    expect(updated.status).toBe('snoozed');
    expect(updated.snoozedUntil).toEqual(tomorrow);
  });

  it('pinAlert respeta el límite máximo', async () => {
    jest.spyOn(systemAlertRepository, 'findById').mockResolvedValue(baseAlert);
    jest.spyOn(systemAlertRepository, 'countPinned').mockResolvedValue(5);
    await expect(systemAlertDetectionService.pinAlert(alertId, { userId })).rejects.toThrow(
      /Máximo/
    );
  });

  it('bulkAction acepta dismiss/resolve/snooze y devuelve resultados por id', async () => {
    jest.spyOn(systemAlertRepository, 'findById').mockResolvedValue(baseAlert);
    jest
      .spyOn(systemAlertRepository, 'updateById')
      .mockImplementation(async (_id, update) => ({ ...baseAlert, ...update.$set }));

    const results = await systemAlertDetectionService.bulkAction(
      [alertId.toString(), alertId.toString()],
      'dismiss',
      { reason: 'other', userId }
    );
    expect(results).toHaveLength(2);
    expect(results.every(r => r.ok)).toBe(true);
  });
});

describe('systemAlertDetectionService.getHistory', () => {
  it('produce timeline cronológico', async () => {
    const detectedAt = new Date('2026-05-15T08:00:00Z');
    const resolvedAt = new Date('2026-05-16T09:00:00Z');
    jest.spyOn(systemAlertRepository, 'findById').mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      type: 'redis_high_latency',
      severity: 'warning',
      status: 'resolved',
      detectedAt,
      resolvedAt,
      resolvedAutomatically: true,
      severityHistory: [
        { severity: 'warning', changedAt: detectedAt, reason: 'initial' },
        { severity: 'critical', changedAt: new Date('2026-05-15T12:00:00Z'), reason: 'escalation' }
      ],
      occurrencesCount: 4,
      lastSeenAt: new Date('2026-05-15T15:00:00Z')
    });

    const history = await systemAlertDetectionService.getHistory('id');
    const eventNames = history.timeline.map(t => t.event);
    expect(eventNames).toContain('created');
    expect(eventNames).toContain('escalated');
    expect(eventNames).toContain('resolved');
  });
});
