/**
 * @fileoverview Tests del orquestador de SmartAlerts (T-941).
 *
 * Cubre los caminos críticos del lifecycle:
 *  - dedup por (studentId, type, status=active)
 *  - upsert: nuevo finding → create; existing → update lastSeenAt+occurrencesCount
 *  - auto-resolve tras N corridas sin reaparecer
 *  - severity escalation por antigüedad
 *  - dismiss/resolve/snooze manuales con autorización
 *  - bulk action con ok/failed
 *  - getHistory con timeline
 *  - listForTeacher hidrata studentName
 *  - filtrado RGPD: estudiantes con consent.withdrawnAt excluidos
 *
 * Estrategia: mockea `userRepository`, `gamePlayRepository`, los detectores
 * (parcial — sólo controlamos sus findings) y verifica el efecto sobre BD
 * (SmartAlert real, persistencia en MongoDB de test).
 */

const mongoose = require('mongoose');
const SmartAlert = require('../../../src/models/SmartAlert');
const User = require('../../../src/models/User');
const alertDetectionService = require('../../../src/services/analytics/alertDetectionService');
const detectors = require('../../../src/services/analytics/detectors');

const NOW = new Date('2026-05-15T10:00:00Z');

const mockDetectors = findings => {
  // Reemplazamos run() de cada detector por uno que devuelve los findings
  // mapeados por type. Si no hay match, devuelve [].
  for (const det of detectors.ALL_DETECTORS) {
    const fs = findings.filter(f => f.type === det.type);
    jest.spyOn(det, 'run').mockResolvedValue(fs);
  }
};

const restoreDetectors = () => {
  for (const det of detectors.ALL_DETECTORS) {
    if (det.run.mockRestore) {
      det.run.mockRestore();
    }
  }
};

const teacherId = new mongoose.Types.ObjectId();
const studentAId = new mongoose.Types.ObjectId();
const studentBId = new mongoose.Types.ObjectId();
const otherTeacherId = new mongoose.Types.ObjectId();

describe('alertDetectionService — runForTeacher lifecycle', () => {
  beforeEach(async () => {
    await SmartAlert.deleteMany({});
    await User.deleteMany({});

    // Crear teacher + 2 estudiantes con consent vigente
    await User.create([
      {
        _id: teacherId,
        name: 'Teacher Alpha',
        email: 'teacher-alpha@test.com',
        password: 'Password123!',
        role: 'teacher',
        status: 'active',
        accountStatus: 'approved'
      },
      {
        _id: studentAId,
        name: 'Alumno A',
        role: 'student',
        status: 'active',
        createdBy: teacherId,
        consent: {
          granted: true,
          grantedAt: new Date(),
          grantedBy: 'Tutor test',
          withdrawnAt: null
        },
        studentMetrics: { lastPlayedAt: NOW, averageScore: 60, totalGamesPlayed: 10 }
      },
      {
        _id: studentBId,
        name: 'Alumno B',
        role: 'student',
        status: 'active',
        createdBy: teacherId,
        consent: {
          granted: true,
          grantedAt: new Date(),
          grantedBy: 'Tutor test',
          withdrawnAt: null
        },
        studentMetrics: { lastPlayedAt: NOW, averageScore: 75, totalGamesPlayed: 8 }
      }
    ]);
  });

  afterEach(() => {
    restoreDetectors();
  });

  it('crea SmartAlert nueva cuando aparece un finding por primera vez', async () => {
    mockDetectors([
      {
        studentId: studentAId.toString(),
        type: 'declining_performance',
        severity: 'warning',
        description: 'Caída 12% en 7 días',
        recommendation: 'Refuerzo',
        detectedAt: new Date('2026-05-14T08:00:00Z'),
        data: { previousAvg: 70, currentAvg: 61 }
      }
    ]);

    const result = await alertDetectionService.runForTeacher(teacherId.toString(), {
      referenceDate: NOW
    });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);

    const alerts = await SmartAlert.find({ teacherId });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('declining_performance');
    expect(alerts[0].status).toBe('active');
    expect(alerts[0].occurrencesCount).toBe(1);
    expect(alerts[0].studentPseudoId).toMatch(/^[a-f0-9]+$/);
    expect(alerts[0].severityHistory).toHaveLength(1);
    expect(alerts[0].severityHistory[0].reason).toBe('initial');
  });

  it('actualiza lastSeenAt+occurrencesCount cuando el mismo finding se re-detecta (dedup)', async () => {
    // Corrida 1 — crea la alerta
    mockDetectors([
      {
        studentId: studentAId.toString(),
        type: 'inactivity',
        severity: 'warning',
        description: 'No juega hace 14 días',
        recommendation: 'Contactar',
        detectedAt: new Date('2026-05-01T08:00:00Z'),
        data: { daysSinceLastPlay: 14 }
      }
    ]);
    await alertDetectionService.runForTeacher(teacherId.toString(), { referenceDate: NOW });

    restoreDetectors();

    // Corrida 2 — mismo finding
    mockDetectors([
      {
        studentId: studentAId.toString(),
        type: 'inactivity',
        severity: 'warning',
        description: 'No juega hace 15 días',
        recommendation: 'Contactar',
        detectedAt: new Date('2026-05-01T08:00:00Z'),
        data: { daysSinceLastPlay: 15 }
      }
    ]);
    const result = await alertDetectionService.runForTeacher(teacherId.toString(), {
      referenceDate: new Date(NOW.getTime() + 86400000)
    });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);

    const alerts = await SmartAlert.find({ teacherId });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].occurrencesCount).toBe(2);
    expect(alerts[0].data.daysSinceLastPlay).toBe(15);
  });

  it('auto-resuelve tras 2 corridas sin reaparecer (default autoResolveAfterMissedRuns)', async () => {
    // Crea una alerta y luego no la re-detectamos
    mockDetectors([
      {
        studentId: studentAId.toString(),
        type: 'high_abandonment',
        severity: 'warning',
        description: 'Abandona 50% últimas 6',
        recommendation: 'Reducir duración',
        detectedAt: new Date('2026-05-14T10:00:00Z'),
        data: { abandonmentRate: 50 }
      }
    ]);
    await alertDetectionService.runForTeacher(teacherId.toString(), { referenceDate: NOW });

    restoreDetectors();
    // Corrida 1 sin findings → missedRuns=1, NO se resuelve aún
    mockDetectors([]);
    const r1 = await alertDetectionService.runForTeacher(teacherId.toString(), {
      referenceDate: new Date(NOW.getTime() + 86400000)
    });
    expect(r1.autoResolved).toBe(0);
    let alert = await SmartAlert.findOne({ teacherId });
    expect(alert.status).toBe('active');
    expect(alert.missedRuns).toBe(1);

    // Corrida 2 sin findings → debe auto-resolverse
    const r2 = await alertDetectionService.runForTeacher(teacherId.toString(), {
      referenceDate: new Date(NOW.getTime() + 2 * 86400000)
    });
    expect(r2.autoResolved).toBe(1);
    alert = await SmartAlert.findOne({ teacherId });
    expect(alert.status).toBe('resolved');
    expect(alert.resolvedAutomatically).toBe(true);
  });

  it('escala severidad warning → critical si lleva >7 días activa con ≥3 ocurrencias', async () => {
    // Crear alerta como si llevase 8 días activa
    const oldDate = new Date(NOW.getTime() - 8 * 86400000);
    await SmartAlert.create({
      teacherId,
      studentId: studentAId,
      type: 'consistent_timeout',
      severity: 'warning',
      status: 'active',
      detectedAt: oldDate,
      lastSeenAt: oldDate,
      occurrencesCount: 3,
      description: 'Timeouts 35%',
      data: { avgTimeoutRate: 35 },
      studentPseudoId: 'abc12345',
      severityHistory: [{ severity: 'warning', changedAt: oldDate, reason: 'initial' }]
    });

    mockDetectors([
      {
        studentId: studentAId.toString(),
        type: 'consistent_timeout',
        severity: 'warning',
        description: 'Timeouts 38%',
        detectedAt: NOW,
        data: { avgTimeoutRate: 38 }
      }
    ]);

    const result = await alertDetectionService.runForTeacher(teacherId.toString(), {
      referenceDate: NOW
    });
    expect(result.escalated).toBe(1);

    const alert = await SmartAlert.findOne({ teacherId });
    expect(alert.severity).toBe('critical');
    expect(alert.severityHistory.some(s => s.reason === 'escalation')).toBe(true);
  });

  it('NO crea alertas para estudiantes con consent.withdrawnAt (RGPD)', async () => {
    // Retiramos consent de studentA — bypassa validador con $set directo
    await User.collection.updateOne(
      { _id: studentAId },
      { $set: { 'consent.withdrawnAt': new Date() } }
    );
    // Verificación con .lean() para ver el objeto raw
    const updated = await User.findById(studentAId).lean();
    expect(updated.consent.withdrawnAt).toBeTruthy();

    mockDetectors([
      {
        studentId: studentAId.toString(),
        type: 'declining_performance',
        severity: 'warning',
        description: 'algo',
        detectedAt: NOW,
        data: {}
      },
      {
        studentId: studentBId.toString(),
        type: 'declining_performance',
        severity: 'warning',
        description: 'B también',
        detectedAt: NOW,
        data: {}
      }
    ]);

    await alertDetectionService.runForTeacher(teacherId.toString(), { referenceDate: NOW });

    // Solo debería crearse la alerta de B
    const alerts = await SmartAlert.find({ teacherId });
    expect(alerts).toHaveLength(1);
    expect(String(alerts[0].studentId)).toBe(String(studentBId));
  });
});

describe('alertDetectionService — acciones lifecycle', () => {
  let alertId;

  beforeEach(async () => {
    await SmartAlert.deleteMany({});
    await User.deleteMany({});

    await User.create([
      {
        _id: teacherId,
        name: 'Teacher A',
        email: 't1@test.com',
        password: 'Password123!',
        role: 'teacher',
        status: 'active',
        accountStatus: 'approved'
      },
      {
        _id: otherTeacherId,
        name: 'Teacher B',
        email: 't2@test.com',
        password: 'Password123!',
        role: 'teacher',
        status: 'active',
        accountStatus: 'approved'
      },
      {
        _id: studentAId,
        name: 'Alumno A',
        role: 'student',
        status: 'active',
        createdBy: teacherId,
        consent: { granted: true, grantedAt: new Date(), grantedBy: 'Tutor test' }
      }
    ]);

    const alert = await SmartAlert.create({
      teacherId,
      studentId: studentAId,
      type: 'inactivity',
      severity: 'warning',
      status: 'active',
      detectedAt: NOW,
      lastSeenAt: NOW,
      description: 'test',
      studentPseudoId: 'abcd1234',
      severityHistory: [{ severity: 'warning', changedAt: NOW, reason: 'initial' }]
    });
    alertId = alert._id.toString();
  });

  it('dismissAlert: marca dismissed y registra usuario+motivo', async () => {
    const updated = await alertDetectionService.dismissAlert(teacherId.toString(), alertId, {
      reason: 'false_positive',
      userId: teacherId
    });
    expect(updated.status).toBe('dismissed');
    expect(updated.dismissReason).toBe('false_positive');
    expect(String(updated.dismissedBy)).toBe(String(teacherId));
  });

  it('dismissAlert: rechaza si la alerta no pertenece al teacher', async () => {
    await expect(
      alertDetectionService.dismissAlert(otherTeacherId.toString(), alertId, {
        userId: otherTeacherId
      })
    ).rejects.toThrow();
  });

  it('resolveAlert: marca resolved manualmente', async () => {
    const updated = await alertDetectionService.resolveAlert(teacherId.toString(), alertId, {
      userId: teacherId
    });
    expect(updated.status).toBe('resolved');
    expect(updated.resolvedAutomatically).toBe(false);
  });

  it('snoozeAlert: requiere fecha futura', async () => {
    await expect(
      alertDetectionService.snoozeAlert(teacherId.toString(), alertId, {
        untilDate: new Date('2020-01-01'),
        userId: teacherId
      })
    ).rejects.toThrow(/futuro/);
  });

  it('snoozeAlert: marca snoozed con untilDate válido', async () => {
    const future = new Date(Date.now() + 7 * 86400000);
    const updated = await alertDetectionService.snoozeAlert(teacherId.toString(), alertId, {
      untilDate: future,
      userId: teacherId
    });
    expect(updated.status).toBe('snoozed');
    expect(new Date(updated.snoozedUntil).getTime()).toBe(future.getTime());
  });

  it('pinAlert: respeta el límite máximo de pinned per teacher', async () => {
    // Creamos 3 alertas extras y las fijamos todas
    for (let i = 0; i < 3; i += 1) {
      await SmartAlert.create({
        teacherId,
        studentId: new mongoose.Types.ObjectId(),
        type: 'sudden_score_drop',
        severity: 'warning',
        status: 'active',
        detectedAt: NOW,
        lastSeenAt: NOW,
        description: `extra ${i}`,
        studentPseudoId: `xx${i}xxx`,
        pinned: true,
        pinnedAt: NOW
      });
    }

    // Intentar fijar la alerta principal (no pinned) — debería rechazar
    await expect(
      alertDetectionService.pinAlert(teacherId.toString(), alertId, { userId: teacherId })
    ).rejects.toThrow(/Máximo/);
  });

  it('bulkAction: dismiss 3 alertas devuelve ok=3', async () => {
    const ids = [alertId];
    for (let i = 0; i < 2; i += 1) {
      const a = await SmartAlert.create({
        teacherId,
        studentId: new mongoose.Types.ObjectId(),
        type: 'high_abandonment',
        severity: 'warning',
        status: 'active',
        detectedAt: NOW,
        lastSeenAt: NOW,
        description: `bulk ${i}`,
        studentPseudoId: `bk${i}1234`
      });
      ids.push(a._id.toString());
    }

    const results = await alertDetectionService.bulkAction(teacherId.toString(), ids, 'dismiss', {
      reason: 'already_addressed',
      userId: teacherId
    });
    expect(results).toHaveLength(3);
    expect(results.filter(r => r.ok).length).toBe(3);
  });

  it('getHistory: incluye created y dismissed events tras dismiss', async () => {
    await alertDetectionService.dismissAlert(teacherId.toString(), alertId, {
      reason: 'other',
      userId: teacherId
    });
    const history = await alertDetectionService.getHistory(teacherId.toString(), alertId);
    expect(history.alertId).toBe(alertId);
    const eventNames = history.timeline.map(e => e.event);
    expect(eventNames).toContain('created');
    expect(eventNames).toContain('dismissed');
  });
});

describe('alertDetectionService — effectivenessForTeacher (T-941)', () => {
  beforeEach(async () => {
    await SmartAlert.deleteMany({});
    await User.deleteMany({});
    await User.create({
      _id: teacherId,
      name: 'Teacher Eff',
      email: 'teacher-eff@test.com',
      password: 'Password123!',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });
  });

  it('NO devuelve averageDaysToResolve negativo aunque resolvedAt < detectedAt (regresión BUG-T941-QA-1)', async () => {
    // Backfill / fechas retrocedidas pueden generar alertas cuyo detectedAt
    // queda en el futuro respecto al resolvedAt (auto-resolve usa now()).
    // Antes del fix, esto producía duraciones negativas que desfiguraban la
    // métrica (ej: "-30.1 d Tiempo medio a resolución" visible en QA 2026-05-18).
    const studentId = new mongoose.Types.ObjectId();
    const now = new Date();
    const futureDetected = new Date(now.getTime() + 30 * 86400000); // 30 días en el futuro
    const pastDetected = new Date(now.getTime() - 5 * 86400000); // 5 días en el pasado

    await SmartAlert.create([
      {
        teacherId,
        studentId,
        type: 'declining_performance',
        severity: 'warning',
        status: 'resolved',
        detectedAt: futureDetected,
        lastSeenAt: futureDetected,
        resolvedAt: now,
        resolvedAutomatically: true,
        description: 'Alerta con detectedAt en el futuro (backfill)',
        studentPseudoId: 'fa11baad',
        severityHistory: [{ severity: 'warning', changedAt: futureDetected, reason: 'initial' }]
      },
      {
        teacherId,
        studentId: new mongoose.Types.ObjectId(),
        type: 'inactivity',
        severity: 'warning',
        status: 'resolved',
        detectedAt: pastDetected,
        lastSeenAt: pastDetected,
        resolvedAt: now,
        resolvedAutomatically: true,
        description: 'Alerta normal (5 días para resolver)',
        studentPseudoId: 'b00b1e55',
        severityHistory: [{ severity: 'warning', changedAt: pastDetected, reason: 'initial' }]
      }
    ]);

    const result = await alertDetectionService.effectivenessForTeacher(teacherId.toString(), {
      days: 90
    });

    expect(result.totalGenerated).toBe(2);
    expect(result.resolvedAutomatically).toBe(2);
    // CRÍTICO: la media debe estar clampeada a >=0. La primera contribuye 0
    // (futureDetected → now sería negativo, clamp a 0), la segunda contribuye 5.
    // Media = (0 + 5) / 2 = 2.5
    expect(result.averageDaysToResolve).toBeGreaterThanOrEqual(0);
    expect(result.averageDaysToResolve).toBeCloseTo(2.5, 1);
  });

  it('topTypes devuelve los tipos ordenados por frecuencia', async () => {
    const baseDate = new Date();
    await SmartAlert.create([
      ...Array.from({ length: 3 }, (_, i) => ({
        teacherId,
        studentId: new mongoose.Types.ObjectId(),
        type: 'declining_performance',
        severity: 'warning',
        status: 'active',
        detectedAt: baseDate,
        lastSeenAt: baseDate,
        description: `decline ${i}`,
        studentPseudoId: `dec0000${i}`
      })),
      {
        teacherId,
        studentId: new mongoose.Types.ObjectId(),
        type: 'inactivity',
        severity: 'info',
        status: 'active',
        detectedAt: baseDate,
        lastSeenAt: baseDate,
        description: 'inactivity 1',
        studentPseudoId: 'ina00001'
      }
    ]);

    const result = await alertDetectionService.effectivenessForTeacher(teacherId.toString());
    expect(result.topTypes[0]).toEqual({ type: 'declining_performance', count: 3 });
    expect(result.topTypes[1]).toEqual({ type: 'inactivity', count: 1 });
  });
});
