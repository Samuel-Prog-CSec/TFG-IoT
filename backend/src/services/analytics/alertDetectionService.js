/**
 * @fileoverview Servicio orquestador de detección y lifecycle de SmartAlerts (T-941).
 *
 * Responsabilidades:
 * - Cargar estudiantes activos con consentimiento RGPD vigente.
 * - Ejecutar todos los detectores en paralelo.
 * - Reconciliar findings contra alertas activas existentes:
 *     - nuevo finding → insert SmartAlert + notification critical si aplica
 *     - finding ya activo → update lastSeenAt + occurrencesCount + severity escalation
 *     - alerta activa sin finding 2 corridas → resolved automático
 * - Reactivar snoozed expirados (D.5).
 * - Auto-reabrir dismissed críticos que reaparecen tras N días (H.5).
 * - Listar/dismiss/resolve/snooze/pin con autorización.
 *
 * Invarianza: este servicio **no expone PII en logs**. Los logs solo
 * contienen counts, teacherId, y `studentPseudoId` (nunca `studentId` plano).
 *
 * @module services/analytics/alertDetectionService
 */

const userRepository = require('../../repositories/userRepository');
const smartAlertRepository = require('../../repositories/smartAlertRepository');
const notificationService = require('../notificationService');
const { cacheInvalidatePattern } = require('../../utils/cacheHelper');
const { toObjectId } = require('./analyticsHelpers');
const { ALL_DETECTORS } = require('./detectors');
const { DETECTION_CONFIG, DISMISS_REASONS } = require('../../config/alerts');
const { pseudonymize } = require('../../utils/pseudonymize');
const { NotFoundError, ValidationError, ForbiddenError } = require('../../utils/errors');
const logger = require('../../utils/logger').child({ component: 'alertDetectionService' });

// Sets pre-construidos al cargar el módulo: `.has()` es O(1) frente al O(N) de
// `.includes()`. El array es pequeño (~5 elementos), así que el ahorro en
// ciclos es marginal; lo importante es la consistencia idiomática — el resto
// del codebase usa Set para validaciones de input enumeradas.
const DISMISS_REASONS_SET = new Set(DISMISS_REASONS);
const BULK_ALLOWED_ACTIONS_SET = new Set(['dismiss', 'resolve', 'snooze']);

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
const ALERT_CACHE_NAMESPACE = 'cache:alerts';

// ─────────────────────────────── Helpers ─────────────────────────────

const severityRank = sev => SEVERITY_ORDER[sev] ?? 9;

const isMoreSevere = (a, b) => severityRank(a) < severityRank(b);

const generateStudentPseudoId = (studentId, teacherId) => pseudonymize(`${studentId}|${teacherId}`);

const invalidateTeacherCache = async teacherId => {
  try {
    await cacheInvalidatePattern(ALERT_CACHE_NAMESPACE, `teacher:${teacherId}:*`);
  } catch (err) {
    logger.warn('No se pudo invalidar cache de alertas', {
      teacherId,
      error: err.message
    });
  }
};

/**
 * Carga estudiantes activos del docente con consentimiento RGPD vigente.
 * Excluye estudiantes con `consent.withdrawnAt` (CRÍTICO RGPD).
 *
 * @param {string} teacherId
 * @returns {Promise<Array<object>>}
 */
async function loadActiveStudentsForTeacher(teacherId) {
  // Filtro base en BD (role/status/teacher). El filtro de consent.withdrawnAt
  // se aplica a posteriori en código para evitar ambigüedades de Mongoose
  // con paths anidados nullable (`null` por default no es lo mismo que ausente).
  const students = await userRepository.find(
    {
      createdBy: toObjectId(teacherId),
      role: 'student',
      status: 'active',
      // CRÍTICO RGPD (Art. 21): solo alumnos con consentimiento de
      // `performance_analytics` ACTIVO. Misma fuente de verdad que
      // `getAnalyticsExcludedPlayerIds` y `getClassroomExport`: el resto de
      // analytics ya excluye a quien no consintió este propósito. Sin este filtro,
      // las Alertas analizaban y notificaban sobre alumnos que el sistema excluye
      // de Insights → incoherencia + tratamiento no consentido de un menor.
      'consent.granted': true,
      'consent.purposes': 'performance_analytics'
    },
    {
      select: 'name studentMetrics profile.classroom consent',
      lean: true
    }
  );
  // Defensa adicional: excluir también consentimiento retirado a posteriori
  // (`withdrawnAt`) por si el flag `granted` no se hubiera bajado en la retirada.
  return students.filter(s => !s.consent?.withdrawnAt);
}

/**
 * Crea o actualiza una SmartAlert tras una corrida.
 *
 * @param {object} ctx
 * @param {string} ctx.teacherId
 * @param {object} ctx.finding - shape AlertFinding
 * @param {SmartAlert|null} ctx.existing - alerta activa existente o null
 * @param {Date} ctx.now
 * @returns {Promise<{ created: boolean, updated: boolean, escalated: boolean, alert: object }>}
 */
async function upsertAlert({ teacherId, finding, existing, now }) {
  const studentPseudoId = generateStudentPseudoId(finding.studentId, teacherId);

  if (!existing) {
    const doc = await smartAlertRepository.create({
      teacherId,
      studentId: finding.studentId,
      type: finding.type,
      severity: finding.severity,
      status: 'active',
      detectedAt: finding.detectedAt || now,
      lastSeenAt: now,
      occurrencesCount: 1,
      missedRuns: 0,
      description: finding.description,
      recommendation: finding.recommendation || null,
      data: finding.data || {},
      gamePlayId: finding.gamePlayId || null,
      studentPseudoId,
      severityHistory: [{ severity: finding.severity, changedAt: now, reason: 'initial' }]
    });
    return { created: true, updated: false, escalated: false, alert: doc };
  }

  // Existing: refresh y posible escalation
  let newSeverity = existing.severity;
  let escalated = false;
  const history = Array.isArray(existing.severityHistory) ? [...existing.severityHistory] : [];

  if (isMoreSevere(finding.severity, existing.severity)) {
    newSeverity = finding.severity;
    history.push({ severity: newSeverity, changedAt: now, reason: 'detector_update' });
    escalated = true;
  } else {
    // Severity escalation por antigüedad si lleva muchos días en warning
    const daysActive = Math.floor((now - new Date(existing.detectedAt)) / 86400000);
    if (
      existing.severity === 'warning' &&
      daysActive >= DETECTION_CONFIG.escalateWarningAfterDays &&
      (existing.occurrencesCount || 0) + 1 >= DETECTION_CONFIG.escalateMinOccurrences
    ) {
      newSeverity = 'critical';
      history.push({ severity: 'critical', changedAt: now, reason: 'escalation' });
      escalated = true;
    }
  }

  const updated = await smartAlertRepository.updateById(existing._id, {
    $set: {
      lastSeenAt: now,
      severity: newSeverity,
      description: finding.description,
      recommendation: finding.recommendation || existing.recommendation,
      data: finding.data || existing.data,
      severityHistory: history,
      missedRuns: 0
    },
    $inc: { occurrencesCount: 1 }
  });

  return { created: false, updated: true, escalated, alert: updated };
}

/**
 * Emite una notificación realtime al docente cuando una alerta crítica es nueva
 * (o cuando una existente acaba de escalar a critical).
 *
 * @param {string} teacherId
 * @param {object} alert - SmartAlert doc
 * @param {object} student
 */
async function emitCriticalNotification(teacherId, alert, student) {
  try {
    const dto = await notificationService.notify({
      userId: teacherId,
      type: 'student_at_risk',
      title: `Alerta crítica: ${student?.name || 'Alumno'}`,
      body: alert.description.slice(0, 280),
      link: `/students/${alert.studentId}?alertId=${alert._id}`,
      priority: 'critical',
      metadata: {
        alertId: String(alert._id),
        studentId: String(alert.studentId),
        alertType: alert.type
      }
    });
    if (dto && dto.id) {
      // Linkear notification con alert para audit
      await smartAlertRepository.updateById(alert._id, {
        $set: { notificationId: dto.id }
      });
    }
  } catch (err) {
    // Fallos de notificación NUNCA bloquean detección
    logger.warn('No se pudo emitir notification critical', {
      teacherId,
      alertId: String(alert._id),
      error: err.message
    });
  }
}

/**
 * Marca como auto-resolved las alertas activas que no aparecieron en esta corrida
 * (acumulando `missedRuns` y aplicando el umbral de DETECTION_CONFIG).
 *
 * @param {Map<string, object>} unseenActiveMap - alertas activas no reaparecidas
 * @param {Date} now
 * @returns {Promise<number>} cantidad de alertas auto-resolved
 */
async function autoResolveUnseen(unseenActiveMap, now) {
  let resolvedCount = 0;
  for (const alert of unseenActiveMap.values()) {
    const newMissed = (alert.missedRuns || 0) + 1;
    if (newMissed >= DETECTION_CONFIG.autoResolveAfterMissedRuns) {
      await smartAlertRepository.updateById(alert._id, {
        $set: {
          status: 'resolved',
          resolvedAt: now,
          resolvedAutomatically: true
        }
      });
      resolvedCount += 1;
    } else {
      await smartAlertRepository.updateById(alert._id, {
        $set: { missedRuns: newMissed }
      });
    }
  }
  return resolvedCount;
}

/**
 * Reabre alertas dismissed críticas que reaparecen tras N días (H.5).
 * Solo si el finding es critical Y han pasado > reopenAfterDays desde dismiss.
 *
 * @param {string} teacherId
 * @param {Array<object>} findings - findings del lote actual
 * @param {Date} now
 * @returns {Promise<number>} cantidad de alertas reabiertas
 */
async function maybeReopenDismissed(teacherId, findings, now) {
  const reopenThresholdMs = DETECTION_CONFIG.reopenAfterDays * 86400000;
  let reopenedCount = 0;

  const criticalFindings = findings.filter(f => f.severity === 'critical');
  if (criticalFindings.length === 0) {
    return 0;
  }

  // Una sola query trae TODOS los descartados candidatos (antes: un findOne por
  // finding crítico → N+1 en cada ejecución del worker). Se indexan en memoria por
  // studentId+type con el más reciente (el find viene ordenado por dismissedAt desc,
  // así que la primera ocurrencia de cada clave es la última descartada).
  const dismissedList = await smartAlertRepository.find(
    {
      teacherId,
      status: 'dismissed',
      $or: criticalFindings.map(f => ({ studentId: f.studentId, type: f.type }))
    },
    { sort: { dismissedAt: -1 } }
  );
  const latestDismissedByKey = new Map();
  for (const d of dismissedList) {
    const key = `${d.studentId}:${d.type}`;
    if (!latestDismissedByKey.has(key)) {
      latestDismissedByKey.set(key, d);
    }
  }

  // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
  for (const finding of criticalFindings) {
    const dismissed = latestDismissedByKey.get(`${finding.studentId}:${finding.type}`);
    if (!dismissed || !dismissed.dismissedAt) {
      continue;
    }
    if (now - new Date(dismissed.dismissedAt) < reopenThresholdMs) {
      continue;
    }

    const history = Array.isArray(dismissed.severityHistory) ? [...dismissed.severityHistory] : [];
    history.push({ severity: finding.severity, changedAt: now, reason: 'reopened' });

    await smartAlertRepository.updateById(dismissed._id, {
      $set: {
        status: 'active',
        severity: finding.severity,
        description: finding.description,
        recommendation: finding.recommendation || dismissed.recommendation,
        data: finding.data || dismissed.data,
        lastSeenAt: now,
        severityHistory: history,
        missedRuns: 0
      },
      $inc: { occurrencesCount: 1 }
    });
    reopenedCount += 1;
  }
  return reopenedCount;
}

// ─────────────────────────────── Public API ──────────────────────────

/**
 * Ejecuta la detección completa para un docente.
 *
 * @param {string} teacherId
 * @param {object} [options]
 * @param {Date} [options.referenceDate] - "Hoy" simulado (útil para backfill).
 * @param {boolean} [options.dryRun=false]
 * @returns {Promise<{ created, updated, autoResolved, escalated, reopened, snoozeReactivated, ms }>}
 */
async function runForTeacher(teacherId, { referenceDate = new Date(), dryRun = false } = {}) {
  const startTs = Date.now();
  const now = referenceDate;

  const students = await loadActiveStudentsForTeacher(teacherId);
  if (students.length === 0) {
    return {
      created: 0,
      updated: 0,
      autoResolved: 0,
      escalated: 0,
      reopened: 0,
      snoozeReactivated: 0,
      ms: Date.now() - startTs
    };
  }

  // 1) Reactivar snoozed expirados DE ESTE teacher (scoped: evita repetir el
  //    updateMany global en cada iteración del bucle de runForAllTeachers).
  const snoozeReactivated = await smartAlertRepository.reactivateExpiredSnoozes(now, teacherId);

  // 2) Mapa de alertas activas existentes (+ snoozed, para respetar el silencio
  //    del docente y no crear duplicados — el índice único solo cubre active).
  const [activeMap, snoozedMap] = await Promise.all([
    smartAlertRepository.buildActiveAlertsMap(teacherId),
    smartAlertRepository.buildSnoozedAlertsMap(teacherId)
  ]);

  // 3) Ejecutar todos los detectores en paralelo
  const detectorResults = await Promise.allSettled(
    ALL_DETECTORS.map(det =>
      det.run({ teacherId, students, referenceDate: now }).catch(err => {
        logger.warn('Detector falló', {
          detector: det.type,
          teacherId,
          error: err.message
        });
        return [];
      })
    )
  );
  const findings = detectorResults.flatMap(r => (r.status === 'fulfilled' ? r.value : []));

  // 4) Reabrir dismissed críticos si procede (H.5)
  const reopened = dryRun ? 0 : await maybeReopenDismissed(teacherId, findings, now);

  // 5) Reconciliación: para cada finding, upsert
  let created = 0;
  let updated = 0;
  let escalated = 0;
  if (!dryRun) {
    const studentLookup = new Map(students.map(s => [String(s._id), s]));
    // Defensa en profundidad RGPD: descartar findings de students cuyo
    // consent ya no es válido (puede ocurrir si un detector retorna findings
    // de un alumno que loadActiveStudentsForTeacher ya excluyó).
    const validFindings = findings.filter(f => studentLookup.has(String(f.studentId)));
    for (const finding of validFindings) {
      const key = `${finding.studentId}:${finding.type}`;
      const existing = activeMap.get(key);
      try {
        // H1: si el docente SILENCIÓ esta alerta (snoozed no expirada) y el
        // detector la re-emite, NO crear un duplicado active. Refrescamos
        // lastSeenAt/occurrences sobre la snoozed (mantiene el conteo) sin
        // cambiar su estado — el snooze se respeta hasta su expiración natural
        // (reactivateExpiredSnoozes la reactivará cuando toque).
        if (!existing && snoozedMap.has(key)) {
          await smartAlertRepository.updateById(snoozedMap.get(key)._id, {
            $set: { lastSeenAt: now },
            $inc: { occurrencesCount: 1 }
          });
          continue;
        }
        const result = await upsertAlert({ teacherId, finding, existing, now });
        if (result.created) {
          created += 1;
        }
        if (result.updated) {
          updated += 1;
        }
        if (result.escalated) {
          escalated += 1;
        }

        // Emitir notification realtime SOLO si critical y (nueva o recién escalada)
        const becameCritical =
          result.alert?.severity === 'critical' && (result.created || result.escalated);
        if (becameCritical) {
          const student = studentLookup.get(String(finding.studentId));
          await emitCriticalNotification(teacherId, result.alert, student);
        }

        activeMap.delete(key); // marcar procesada
      } catch (err) {
        // Probablemente duplicate key error por dedup → ignorable; intentar refrescar
        if (err.code === 11000) {
          logger.debug('Dedup unique index protegió duplicado', {
            teacherId,
            type: finding.type
          });
        } else {
          logger.warn('upsertAlert falló', {
            teacherId,
            type: finding.type,
            error: err.message
          });
        }
      }
    }
  }

  // 6) Auto-resolve alertas activas que no aparecieron en findings
  const autoResolved = dryRun ? 0 : await autoResolveUnseen(activeMap, now);

  // 7) Invalidar cache del teacher
  if (!dryRun) {
    await invalidateTeacherCache(teacherId);
  }

  const ms = Date.now() - startTs;
  logger.info('alertDetection.runForTeacher.completed', {
    teacherId,
    ms,
    students: students.length,
    detectorsRun: ALL_DETECTORS.length,
    findings: findings.length,
    created,
    updated,
    escalated,
    autoResolved,
    reopened,
    snoozeReactivated,
    dryRun
  });

  return {
    created,
    updated,
    autoResolved,
    escalated,
    reopened,
    snoozeReactivated,
    findings: findings.length,
    ms
  };
}

/**
 * Itera sobre todos los teachers activos y ejecuta runForTeacher en cada uno
 * (en batches para no saturar la BD).
 *
 * @param {object} [options]
 * @returns {Promise<{ teachers, totalCreated, totalUpdated, totalResolved, totalEscalated, totalReopened, ms }>}
 */
async function runForAllTeachers(options = {}) {
  const start = Date.now();
  const teachers = await userRepository.find(
    { role: 'teacher', status: 'active' },
    { select: '_id', lean: true }
  );

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalResolved = 0;
  let totalEscalated = 0;
  let totalReopened = 0;

  const batchSize = DETECTION_CONFIG.teacherBatchSize;
  for (let i = 0; i < teachers.length; i += batchSize) {
    const batch = teachers.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(t => runForTeacher(String(t._id), options)));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        totalCreated += r.value.created;
        totalUpdated += r.value.updated;
        totalResolved += r.value.autoResolved;
        totalEscalated += r.value.escalated;
        totalReopened += r.value.reopened;
      }
    }
  }

  const ms = Date.now() - start;
  logger.info('alertDetection.runForAllTeachers.completed', {
    teachers: teachers.length,
    totalCreated,
    totalUpdated,
    totalResolved,
    totalEscalated,
    totalReopened,
    ms
  });

  return {
    teachers: teachers.length,
    totalCreated,
    totalUpdated,
    totalResolved,
    totalEscalated,
    totalReopened,
    ms
  };
}

/**
 * Listado paginado de alertas para un docente, con hidratación de studentName.
 *
 * @param {string} teacherId
 * @param {object} [options]
 */
async function listForTeacher(teacherId, options = {}) {
  const { items, nextCursor } = await smartAlertRepository.paginateForTeacher(teacherId, options);

  if (items.length === 0) {
    return { items: [], nextCursor: null };
  }

  // Hidratar studentName en un solo find
  const studentIds = [...new Set(items.map(a => String(a.studentId)))];
  const students = await userRepository.find(
    { _id: { $in: studentIds } },
    { select: 'name', lean: true }
  );
  const nameById = new Map(students.map(s => [String(s._id), s.name]));

  // Hidratar dismissedByName
  const dismisserIds = [
    ...new Set(items.filter(a => a.dismissedBy).map(a => String(a.dismissedBy)))
  ];
  let dismisserNameById = new Map();
  if (dismisserIds.length > 0) {
    const dismissers = await userRepository.find(
      { _id: { $in: dismisserIds } },
      { select: 'name', lean: true }
    );
    dismisserNameById = new Map(dismissers.map(s => [String(s._id), s.name]));
  }

  const hydrated = items.map(a => ({
    raw: a,
    studentName: nameById.get(String(a.studentId)) || null,
    dismissedByName: a.dismissedBy ? dismisserNameById.get(String(a.dismissedBy)) || null : null
  }));

  return { items: hydrated, nextCursor };
}

/**
 * Resumen con conteos para badges (cached).
 */
async function summaryForTeacher(teacherId) {
  return smartAlertRepository.summaryForTeacher(teacherId);
}

/**
 * Eficacia interna del sistema de alertas para el docente (H.3).
 * Resumen ejecutivo de cómo está usando el sistema en el último periodo.
 *
 * @param {string} teacherId
 * @param {object} [options]
 * @param {number} [options.days=30]
 */
async function effectivenessForTeacher(teacherId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000);

  const generated = await smartAlertRepository.find(
    { teacherId, detectedAt: { $gte: since } },
    { lean: true }
  );

  const activeNow = generated.filter(a => a.status === 'active').length;
  const resolvedAuto = generated.filter(
    a => a.status === 'resolved' && a.resolvedAutomatically
  ).length;
  const resolvedManual = generated.filter(
    a => a.status === 'resolved' && !a.resolvedAutomatically
  ).length;
  const dismissed = generated.filter(a => a.status === 'dismissed').length;
  const snoozed = generated.filter(a => a.status === 'snoozed').length;

  // Clampamos a >=0: backfills/jugadas con fechas retrocedidas pueden producir
  // transitoriamente un `detectedAt` posterior a `resolvedAt` (auto-resolve usa
  // la fecha de la corrida actual); una duración negativa no tiene sentido.
  const resolvedDurations = generated
    .filter(a => a.resolvedAt && a.detectedAt)
    .map(a => Math.max(0, (new Date(a.resolvedAt) - new Date(a.detectedAt)) / 86400000));
  const avgDaysToResolve =
    resolvedDurations.length === 0
      ? 0
      : Math.round((resolvedDurations.reduce((a, b) => a + b, 0) / resolvedDurations.length) * 10) /
        10;

  const typeCounts = {};
  for (const a of generated) {
    typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
  }
  const topTypes = Object.entries(typeCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const dismissedFP = generated.filter(
    a => a.status === 'dismissed' && a.dismissReason === 'false_positive'
  ).length;
  const falsePositiveRate =
    dismissed > 0 ? Math.round((dismissedFP / dismissed) * 100 * 10) / 10 : 0;

  return {
    period: `${days}d`,
    totalGenerated: generated.length,
    activeNow,
    resolvedAutomatically: resolvedAuto,
    resolvedManually: resolvedManual,
    dismissed,
    snoozed,
    averageDaysToResolve: avgDaysToResolve,
    topTypes,
    falsePositiveRate
  };
}

// ─────────────── Acciones de lifecycle (RESTful) ────────────────────

async function getOwnedAlert(teacherId, alertId, { allowSuperAdmin = false } = {}) {
  const alert = await smartAlertRepository.findById(alertId);
  if (!alert) {
    throw new NotFoundError('Alerta');
  }
  if (String(alert.teacherId) !== String(teacherId) && !allowSuperAdmin) {
    throw new ForbiddenError('La alerta pertenece a otro docente');
  }
  return alert;
}

async function dismissAlert(
  teacherId,
  alertId,
  { reason, userId, isSuperAdmin = false, skipCacheInvalidation = false } = {}
) {
  if (reason && !DISMISS_REASONS_SET.has(reason)) {
    throw new ValidationError(`Motivo de descarte no válido: ${reason}`);
  }
  const alert = await getOwnedAlert(teacherId, alertId, { allowSuperAdmin: isSuperAdmin });
  const now = new Date();
  const updated = await smartAlertRepository.updateById(alert._id, {
    $set: {
      status: 'dismissed',
      dismissedAt: now,
      dismissedBy: userId,
      dismissReason: reason || 'other'
    }
  });
  if (!skipCacheInvalidation) {
    await invalidateTeacherCache(teacherId);
  }
  logger.info('alertLifecycle.dismissed', {
    teacherId,
    alertId: String(alertId),
    pseudoId: alert.studentPseudoId,
    reason: reason || 'other'
  });
  return updated;
}

async function resolveAlert(
  teacherId,
  alertId,
  { userId, isSuperAdmin = false, skipCacheInvalidation = false } = {}
) {
  const alert = await getOwnedAlert(teacherId, alertId, { allowSuperAdmin: isSuperAdmin });
  const now = new Date();
  const updated = await smartAlertRepository.updateById(alert._id, {
    $set: {
      status: 'resolved',
      resolvedAt: now,
      resolvedAutomatically: false
    }
  });
  if (!skipCacheInvalidation) {
    await invalidateTeacherCache(teacherId);
  }
  logger.info('alertLifecycle.resolvedManually', {
    teacherId,
    alertId: String(alertId),
    pseudoId: alert.studentPseudoId,
    by: userId
  });
  return updated;
}

async function snoozeAlert(
  teacherId,
  alertId,
  { untilDate, userId, isSuperAdmin = false, skipCacheInvalidation = false } = {}
) {
  if (!(untilDate instanceof Date) || Number.isNaN(untilDate.getTime())) {
    throw new ValidationError('untilDate requerido');
  }
  if (untilDate <= new Date()) {
    throw new ValidationError('untilDate debe ser futuro');
  }
  const alert = await getOwnedAlert(teacherId, alertId, { allowSuperAdmin: isSuperAdmin });
  const updated = await smartAlertRepository.updateById(alert._id, {
    $set: {
      status: 'snoozed',
      snoozedAt: new Date(),
      snoozedUntil: untilDate,
      snoozedBy: userId
    }
  });
  if (!skipCacheInvalidation) {
    await invalidateTeacherCache(teacherId);
  }
  logger.info('alertLifecycle.snoozed', {
    teacherId,
    alertId: String(alertId),
    pseudoId: alert.studentPseudoId,
    until: untilDate.toISOString()
  });
  return updated;
}

async function pinAlert(teacherId, alertId, { userId: _userId, isSuperAdmin = false } = {}) {
  // _userId reservado para audit posterior (no se persiste hoy)
  const alert = await getOwnedAlert(teacherId, alertId, { allowSuperAdmin: isSuperAdmin });
  const currentPinned = await smartAlertRepository.countPinned(teacherId);
  if (!alert.pinned && currentPinned >= DETECTION_CONFIG.maxPinnedPerTeacher) {
    throw new ValidationError(
      `Máximo ${DETECTION_CONFIG.maxPinnedPerTeacher} alertas fijadas a la vez`,
      { code: 'PIN_LIMIT_REACHED', max: DETECTION_CONFIG.maxPinnedPerTeacher }
    );
  }
  const updated = await smartAlertRepository.updateById(alert._id, {
    $set: { pinned: true, pinnedAt: new Date() }
  });
  await invalidateTeacherCache(teacherId);
  return updated;
}

async function unpinAlert(teacherId, alertId, { userId: _userId, isSuperAdmin = false } = {}) {
  await getOwnedAlert(teacherId, alertId, { allowSuperAdmin: isSuperAdmin });
  const updated = await smartAlertRepository.updateById(alertId, {
    $set: { pinned: false },
    $unset: { pinnedAt: '' }
  });
  await invalidateTeacherCache(teacherId);
  return updated;
}

async function bulkAction(
  teacherId,
  alertIds,
  action,
  { reason, untilDate, userId, isSuperAdmin = false } = {}
) {
  if (!BULK_ALLOWED_ACTIONS_SET.has(action)) {
    throw new ValidationError(`Acción bulk no soportada: ${action}`);
  }
  if (!Array.isArray(alertIds) || alertIds.length === 0) {
    throw new ValidationError('alertIds requerido');
  }
  if (alertIds.length > 100) {
    throw new ValidationError('Máximo 100 alertas por bulk action');
  }

  const results = [];
  for (const id of alertIds) {
    try {
      let r;
      // skipCacheInvalidation: una acción bulk toca alertas del MISMO docente; dejar
      // que cada llamada invalide por patrón (SCAN) sería N invalidaciones idénticas.
      if (action === 'dismiss') {
        r = await dismissAlert(teacherId, id, {
          reason,
          userId,
          isSuperAdmin,
          skipCacheInvalidation: true
        });
      } else if (action === 'resolve') {
        r = await resolveAlert(teacherId, id, {
          userId,
          isSuperAdmin,
          skipCacheInvalidation: true
        });
      } else if (action === 'snooze') {
        r = await snoozeAlert(teacherId, id, {
          untilDate,
          userId,
          isSuperAdmin,
          skipCacheInvalidation: true
        });
      }
      results.push({ id, ok: true, status: r?.status });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }
  // Invalidación única para el lote completo (antes: una por alerta → hasta 100 SCAN).
  if (results.some(r => r.ok)) {
    await invalidateTeacherCache(teacherId);
  }
  return results;
}

/**
 * Audit log / historia de una alerta concreta (H.2).
 */
async function getHistory(teacherId, alertId, { isSuperAdmin = false } = {}) {
  const alert = await getOwnedAlert(teacherId, alertId, { allowSuperAdmin: isSuperAdmin });
  const timeline = [];
  timeline.push({
    at: alert.detectedAt,
    event: 'created',
    severity: alert.severityHistory?.[0]?.severity || alert.severity,
    detector: alert.type
  });
  if ((alert.severityHistory || []).length > 1) {
    for (let i = 1; i < alert.severityHistory.length; i += 1) {
      const h = alert.severityHistory[i];
      timeline.push({
        at: h.changedAt,
        event: h.reason === 'escalation' ? 'escalated' : 'severity_changed',
        severity: h.severity,
        reason: h.reason
      });
    }
  }
  if (alert.occurrencesCount > 1) {
    timeline.push({
      at: alert.lastSeenAt,
      event: 'reseen',
      occurrencesCount: alert.occurrencesCount
    });
  }
  if (alert.snoozedAt) {
    timeline.push({
      at: alert.snoozedAt,
      event: 'snoozed',
      until: alert.snoozedUntil
    });
  }
  if (alert.dismissedAt) {
    timeline.push({
      at: alert.dismissedAt,
      event: 'dismissed',
      by: alert.dismissedBy ? String(alert.dismissedBy) : null,
      reason: alert.dismissReason
    });
  }
  if (alert.resolvedAt) {
    timeline.push({
      at: alert.resolvedAt,
      event: 'resolved',
      automatic: !!alert.resolvedAutomatically
    });
  }
  // Orden cronológico
  timeline.sort((a, b) => new Date(a.at) - new Date(b.at));
  return { alertId: String(alert._id), timeline };
}

module.exports = {
  runForTeacher,
  runForAllTeachers,
  listForTeacher,
  summaryForTeacher,
  effectivenessForTeacher,
  dismissAlert,
  resolveAlert,
  snoozeAlert,
  pinAlert,
  unpinAlert,
  bulkAction,
  getHistory,
  // Exposed para tests
  _internals: {
    loadActiveStudentsForTeacher,
    generateStudentPseudoId,
    upsertAlert,
    ALERT_CACHE_NAMESPACE
  }
};
