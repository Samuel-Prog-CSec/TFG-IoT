/**
 * @fileoverview Servicio orquestador de detección de SystemAlerts (T-942).
 *
 * Espejo conceptual de `alertDetectionService` (T-941, alertas pedagógicas)
 * pero para alertas globales del super_admin. Cambios clave:
 *  - Sin teacherId/students: el contexto es del sistema completo.
 *  - Dedup global por tipo (una sola alerta activa por type).
 *  - Audiencia: notificación crítica a TODOS los super_admins.
 *  - Escalas temporales en horas (no días).
 *  - Cache namespace `cache:system-alerts`.
 *
 * @module services/analytics/systemAlertDetectionService
 */

const mongoose = require('mongoose');
const systemAlertRepository = require('../../repositories/systemAlertRepository');
const userRepository = require('../../repositories/userRepository');
const notificationService = require('../notificationService');
const securityCounters = require('../security/securityCountersService');
const redisService = require('../redisService');
const runtimeMetrics = require('../../utils/runtimeMetrics');
const { ping: pingRedis } = require('../../config/redis');
const { cacheInvalidatePattern } = require('../../utils/cacheHelper');
const { ALL_SYSTEM_DETECTORS } = require('./systemDetectors');
const { SYSTEM_DETECTION_CONFIG, SYSTEM_DISMISS_REASONS } = require('../../config/systemAlerts');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger').child({ component: 'systemAlertDetectionService' });

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
const SYSTEM_ALERT_CACHE_NAMESPACE = 'cache:system-alerts';
const REDIS_SAMPLES_KEEP = 6;
const MONGO_SAMPLES_KEEP = 4;

const severityRank = sev => SEVERITY_ORDER[sev] ?? 9;
const isMoreSevere = (a, b) => severityRank(a) < severityRank(b);

// Buffers en memoria — mantienen últimas N muestras para detectores
// "sostenidos" (Redis, Mongo). Se reinician al reiniciar el proceso, lo que
// es aceptable: una caída se detectará en las siguientes corridas.
const redisLatencyBuffer = [];
const mongoStateBuffer = [];

// Cache trivial para `lastRetentionRun` — actualizado externamente vía
// `markRetentionRunCompleted()`. En primer arranque será null.
let lastRetentionRunAt = null;

// Rango aceptable: 1 h en el futuro (tolerancia clock skew worker/web) y 7 días
// en el pasado (suficiente para reanudar tras outages largos). Fuera de este
// rango el timestamp suele ser fruto de bug o input corrupto y aceptarlo
// haría que el detector `retention_stale` produjera falsos positivos.
const RETENTION_TIMESTAMP_MAX_FUTURE_MS = 60 * 60 * 1000;
const RETENTION_TIMESTAMP_MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000;

const markRetentionRunCompleted = (timestamp = new Date()) => {
  const dt = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (!Number.isFinite(dt.getTime())) {
    logger.warn('markRetentionRunCompleted: timestamp inválido, ignorado', { timestamp });
    return;
  }
  const now = Date.now();
  const delta = dt.getTime() - now;
  if (delta > RETENTION_TIMESTAMP_MAX_FUTURE_MS || delta < -RETENTION_TIMESTAMP_MAX_PAST_MS) {
    logger.warn('markRetentionRunCompleted: timestamp fuera de rango, ignorado', {
      timestamp: dt.toISOString(),
      now: new Date(now).toISOString()
    });
    return;
  }
  lastRetentionRunAt = dt;
};

const invalidateCache = async () => {
  try {
    await cacheInvalidatePattern(SYSTEM_ALERT_CACHE_NAMESPACE, '*');
  } catch (err) {
    logger.warn('No se pudo invalidar cache system-alerts', { error: err.message });
  }
};

/**
 * Recoge muestras de runtime para los detectores sostenidos.
 */
async function captureRuntimeSamples() {
  // Redis ping
  try {
    const result = await pingRedis();
    if (result.connected && Number.isFinite(result.latency)) {
      redisLatencyBuffer.push(result.latency);
      if (redisLatencyBuffer.length > REDIS_SAMPLES_KEEP) {
        redisLatencyBuffer.shift();
      }
    }
  } catch {
    // Si el ping falla, no añadimos muestra (lo cubre `mongo_disconnected`/
    // `queue_backlog` y otras señales del sistema; no inflamos el detector de
    // latencia con valores artificiales).
  }

  // Mongo readyState
  try {
    const state = mongoose.connection?.readyState ?? 0;
    mongoStateBuffer.push(state);
    if (mongoStateBuffer.length > MONGO_SAMPLES_KEEP) {
      mongoStateBuffer.shift();
    }
  } catch {
    mongoStateBuffer.push(0);
  }
}

/**
 * Construye el SystemDetectionContext para los detectores.
 */
async function buildContext(now) {
  await captureRuntimeSamples();

  const usage = process.memoryUsage();
  const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
  const percentUsed = usage.heapTotal > 0 ? (usage.heapUsed / usage.heapTotal) * 100 : 0;

  // Lazy require para evitar dependencias circulares
  let queues = {};
  try {
    const queuesModule = require('../../queues');
    queues = {
      [queuesModule.QUEUE_NAMES.ALERT_DETECTION]: queuesModule.alertDetectionQueue,
      [queuesModule.QUEUE_NAMES.DATA_RETENTION]: queuesModule.dataRetentionQueue,
      [queuesModule.QUEUE_NAMES.NOTIFICATIONS]: queuesModule.notificationsQueue,
      [queuesModule.QUEUE_NAMES.GDPR_EXPORTS]: queuesModule.gdprExportsQueue
    };
  } catch (err) {
    logger.debug('queues no disponibles en buildContext', { error: err.message });
  }

  const [authFailed, accountLocked, tokenTheft, consentWithdrawn, adminApproval] =
    await Promise.all([
      securityCounters.countInLastHour('auth_failed'),
      securityCounters.countInLastHour('account_locked'),
      securityCounters.countInLastHour('token_theft'),
      securityCounters.countInLastHour('consent_withdrawn'),
      securityCounters.countInLastHour('admin_approval')
    ]);

  // lastRetentionRun: en memoria (este proceso) o de Redis (el worker lo
  // escribió la última vez que completó).
  let lastRetentionRun = lastRetentionRunAt;
  if (!lastRetentionRun) {
    try {
      const raw = await redisService.get('system:meta', 'lastRetentionRun');
      if (raw) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
          lastRetentionRun = parsed;
        }
      }
    } catch {
      // ignorar
    }
  }

  return {
    now,
    runtimeMetrics: {
      ...runtimeMetrics.getSnapshot(),
      memory: {
        heapUsedMB,
        heapTotalMB,
        percentUsed
      }
    },
    redisLatencySamples: [...redisLatencyBuffer],
    mongoStateSamples: [...mongoStateBuffer],
    mongooseConn: mongoose.connection,
    queues,
    lastRetentionRun,
    securityCounters: {
      auth_failed: authFailed,
      account_locked: accountLocked,
      token_theft: tokenTheft,
      consent_withdrawn: consentWithdrawn,
      admin_approval: adminApproval
    }
  };
}

/**
 * Crea o actualiza una SystemAlert.
 */
async function upsertSystemAlert({ finding, existing, now }) {
  if (!existing) {
    const doc = await systemAlertRepository.create({
      type: finding.type,
      severity: finding.severity,
      source: finding.source,
      component: finding.component || null,
      status: 'active',
      detectedAt: finding.detectedAt || now,
      lastSeenAt: now,
      occurrencesCount: 1,
      missedRuns: 0,
      title: finding.title,
      description: finding.description,
      recommendation: finding.recommendation || null,
      data: finding.data || {},
      runbookUrl: finding.runbookUrl || null,
      severityHistory: [{ severity: finding.severity, changedAt: now, reason: 'initial' }]
    });
    return { created: true, updated: false, escalated: false, alert: doc };
  }

  let newSeverity = existing.severity;
  let escalated = false;
  const history = Array.isArray(existing.severityHistory) ? [...existing.severityHistory] : [];

  if (isMoreSevere(finding.severity, existing.severity)) {
    newSeverity = finding.severity;
    history.push({ severity: newSeverity, changedAt: now, reason: 'detector_update' });
    escalated = true;
  } else {
    const hoursActive = (now - new Date(existing.detectedAt)) / (60 * 60 * 1000);
    if (
      existing.severity === 'warning' &&
      hoursActive >= SYSTEM_DETECTION_CONFIG.escalateWarningAfterHours &&
      (existing.occurrencesCount || 0) + 1 >= SYSTEM_DETECTION_CONFIG.escalateMinOccurrences
    ) {
      newSeverity = 'critical';
      history.push({ severity: 'critical', changedAt: now, reason: 'escalation' });
      escalated = true;
    }
  }

  const updated = await systemAlertRepository.updateById(existing._id, {
    $set: {
      lastSeenAt: now,
      severity: newSeverity,
      title: finding.title || existing.title,
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
 * Emite notificación realtime a TODOS los super_admins cuando una alerta es
 * critical y acaba de crearse o escalar.
 */
async function emitCriticalSystemNotification(alert) {
  try {
    const admins = await userRepository.find(
      { role: 'super_admin', status: 'active' },
      { select: '_id', lean: true }
    );
    if (!admins.length) {
      return;
    }
    const notificationIds = [];
    await Promise.all(
      admins.map(async admin => {
        try {
          const dto = await notificationService.notify({
            userId: String(admin._id),
            type: 'system_alert_critical',
            title: `Alerta crítica del sistema: ${alert.title}`,
            body: alert.description.slice(0, 280),
            link: `/admin/system-alerts?alertId=${alert._id}`,
            priority: 'critical',
            metadata: {
              alertId: String(alert._id),
              alertType: alert.type,
              source: alert.source
            }
          });
          if (dto?.id) {
            notificationIds.push(dto.id);
          }
        } catch (err) {
          logger.debug('Notification para super_admin falló (ignorado)', {
            admin: String(admin._id),
            error: err.message
          });
        }
      })
    );
    if (notificationIds.length > 0) {
      // Linkeamos la primera (suficiente para audit; las demás se pueden
      // recuperar buscando por metadata.alertId).
      await systemAlertRepository.updateById(alert._id, {
        $set: { notificationId: notificationIds[0] }
      });
    }
  } catch (err) {
    logger.warn('emitCriticalSystemNotification falló', {
      alertId: String(alert._id),
      error: err.message
    });
  }
}

/**
 * Auto-resolve alertas activas no reaparecidas.
 */
async function autoResolveUnseen(unseenActiveMap, now) {
  let resolvedCount = 0;
  for (const alert of unseenActiveMap.values()) {
    const newMissed = (alert.missedRuns || 0) + 1;
    if (newMissed >= SYSTEM_DETECTION_CONFIG.autoResolveAfterMissedRuns) {
      await systemAlertRepository.updateById(alert._id, {
        $set: {
          status: 'resolved',
          resolvedAt: now,
          resolvedAutomatically: true
        }
      });
      resolvedCount += 1;
    } else {
      await systemAlertRepository.updateById(alert._id, {
        $set: { missedRuns: newMissed }
      });
    }
  }
  return resolvedCount;
}

/**
 * Reabre alertas dismissed críticas que reaparecen tras N horas.
 */
async function maybeReopenDismissed(findings, now) {
  const reopenThresholdMs = SYSTEM_DETECTION_CONFIG.reopenAfterHours * 60 * 60 * 1000;
  let reopenedCount = 0;
  const criticalFindings = findings.filter(f => f.severity === 'critical');
  if (!criticalFindings.length) {
    return 0;
  }

  for (const finding of criticalFindings) {
    const dismissed = await systemAlertRepository.findOne(
      { type: finding.type, status: 'dismissed' },
      { sort: { dismissedAt: -1 } }
    );
    if (!dismissed || !dismissed.dismissedAt) {
      continue;
    }
    if (now - new Date(dismissed.dismissedAt) < reopenThresholdMs) {
      continue;
    }
    const history = Array.isArray(dismissed.severityHistory) ? [...dismissed.severityHistory] : [];
    history.push({ severity: finding.severity, changedAt: now, reason: 'reopened' });

    await systemAlertRepository.updateById(dismissed._id, {
      $set: {
        status: 'active',
        severity: finding.severity,
        title: finding.title || dismissed.title,
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
 * Ejecuta la detección completa para el sistema.
 */
async function runDetection({ now = new Date(), dryRun = false } = {}) {
  const startTs = Date.now();

  // 1) Reactivar snoozed expirados
  const snoozeReactivated = await systemAlertRepository.reactivateExpiredSnoozes(now);

  // 2) Mapa de alertas activas
  const activeMap = await systemAlertRepository.buildActiveAlertsMap();

  // 3) Construir contexto + ejecutar detectores en paralelo
  const ctx = await buildContext(now);
  const detectorResults = await Promise.allSettled(
    ALL_SYSTEM_DETECTORS.map(det =>
      det.run(ctx).catch(err => {
        logger.warn('SystemDetector falló', { detector: det.type, error: err.message });
        return [];
      })
    )
  );
  const findings = detectorResults.flatMap(r => (r.status === 'fulfilled' ? r.value : []));

  // 4) Reabrir dismissed críticas si aplica
  const reopened = dryRun ? 0 : await maybeReopenDismissed(findings, now);

  // 5) Reconciliación: upsert por finding
  let created = 0;
  let updated = 0;
  let escalated = 0;

  if (!dryRun) {
    for (const finding of findings) {
      const existing = activeMap.get(finding.type);
      try {
        const result = await upsertSystemAlert({ finding, existing, now });
        if (result.created) {
          created += 1;
        }
        if (result.updated) {
          updated += 1;
        }
        if (result.escalated) {
          escalated += 1;
        }

        const becameCritical =
          result.alert?.severity === 'critical' && (result.created || result.escalated);
        if (becameCritical) {
          await emitCriticalSystemNotification(result.alert);
        }

        activeMap.delete(finding.type);
      } catch (err) {
        if (err.code === 11000) {
          logger.debug('Dedup unique index protegió duplicado', { type: finding.type });
        } else {
          logger.warn('upsertSystemAlert falló', { type: finding.type, error: err.message });
        }
      }
    }
  }

  // 6) Auto-resolve no reaparecidas
  const autoResolved = dryRun ? 0 : await autoResolveUnseen(activeMap, now);

  // 7) Invalidar cache
  if (!dryRun) {
    await invalidateCache();
  }

  const ms = Date.now() - startTs;
  logger.info('systemAlertDetection.completed', {
    ms,
    detectorsRun: ALL_SYSTEM_DETECTORS.length,
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
 * Listado paginado global.
 */
async function list(options = {}) {
  const { items, nextCursor } = await systemAlertRepository.paginateGlobal(options);
  if (!items.length) {
    return { items: [], nextCursor: null };
  }

  // Hidratar nombres de actores (dismissedBy/resolvedBy/snoozedBy/pinnedBy)
  const userIds = new Set();
  for (const a of items) {
    if (a.dismissedBy) {
      userIds.add(String(a.dismissedBy));
    }
    if (a.resolvedBy) {
      userIds.add(String(a.resolvedBy));
    }
    if (a.snoozedBy) {
      userIds.add(String(a.snoozedBy));
    }
    if (a.pinnedBy) {
      userIds.add(String(a.pinnedBy));
    }
  }
  const nameById = new Map();
  if (userIds.size > 0) {
    const users = await userRepository.find(
      { _id: { $in: [...userIds] } },
      { select: 'name', lean: true }
    );
    for (const u of users) {
      nameById.set(String(u._id), u.name);
    }
  }

  const hydrated = items.map(a => ({
    raw: a,
    dismissedByName: a.dismissedBy ? nameById.get(String(a.dismissedBy)) || null : null,
    resolvedByName: a.resolvedBy ? nameById.get(String(a.resolvedBy)) || null : null,
    snoozedByName: a.snoozedBy ? nameById.get(String(a.snoozedBy)) || null : null,
    pinnedByName: a.pinnedBy ? nameById.get(String(a.pinnedBy)) || null : null
  }));

  return { items: hydrated, nextCursor };
}

async function summary() {
  return systemAlertRepository.summary();
}

async function effectiveness({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  const generated = await systemAlertRepository.find(
    { detectedAt: { $gte: since } },
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

  const resolvedDurations = generated
    .filter(a => a.resolvedAt && a.detectedAt)
    .map(a => Math.max(0, (new Date(a.resolvedAt) - new Date(a.detectedAt)) / (60 * 60 * 1000)));
  const avgHoursToResolve =
    resolvedDurations.length === 0
      ? 0
      : Math.round((resolvedDurations.reduce((a, b) => a + b, 0) / resolvedDurations.length) * 10) /
        10;

  const typeCounts = {};
  const sourceCounts = {};
  for (const a of generated) {
    typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
    sourceCounts[a.source] = (sourceCounts[a.source] || 0) + 1;
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
    averageHoursToResolve: avgHoursToResolve,
    topTypes,
    sourceCounts,
    falsePositiveRate
  };
}

// ─────────────── Acciones de lifecycle ──────────────────

async function getAlertOrThrow(alertId) {
  const alert = await systemAlertRepository.findById(alertId);
  if (!alert) {
    throw new NotFoundError('Alerta de sistema');
  }
  return alert;
}

async function dismissAlert(alertId, { reason, userId } = {}) {
  if (reason && !SYSTEM_DISMISS_REASONS.includes(reason)) {
    throw new ValidationError(`Motivo de descarte no válido: ${reason}`);
  }
  const alert = await getAlertOrThrow(alertId);
  const now = new Date();
  const updated = await systemAlertRepository.updateById(alert._id, {
    $set: {
      status: 'dismissed',
      dismissedAt: now,
      dismissedBy: userId,
      dismissReason: reason || 'other'
    }
  });
  await invalidateCache();
  logger.info('systemAlertLifecycle.dismissed', {
    alertId: String(alertId),
    type: alert.type,
    by: String(userId),
    reason: reason || 'other'
  });
  return updated;
}

async function resolveAlert(alertId, { userId } = {}) {
  const alert = await getAlertOrThrow(alertId);
  const now = new Date();
  const updated = await systemAlertRepository.updateById(alert._id, {
    $set: {
      status: 'resolved',
      resolvedAt: now,
      resolvedAutomatically: false,
      resolvedBy: userId
    }
  });
  await invalidateCache();
  logger.info('systemAlertLifecycle.resolvedManually', {
    alertId: String(alertId),
    type: alert.type,
    by: String(userId)
  });
  return updated;
}

async function snoozeAlert(alertId, { untilDate, userId } = {}) {
  if (!(untilDate instanceof Date) || Number.isNaN(untilDate.getTime())) {
    throw new ValidationError('untilDate requerido');
  }
  if (untilDate <= new Date()) {
    throw new ValidationError('untilDate debe ser futuro');
  }
  const alert = await getAlertOrThrow(alertId);
  const updated = await systemAlertRepository.updateById(alert._id, {
    $set: {
      status: 'snoozed',
      snoozedAt: new Date(),
      snoozedUntil: untilDate,
      snoozedBy: userId
    }
  });
  await invalidateCache();
  logger.info('systemAlertLifecycle.snoozed', {
    alertId: String(alertId),
    type: alert.type,
    until: untilDate.toISOString()
  });
  return updated;
}

async function pinAlert(alertId, { userId } = {}) {
  const alert = await getAlertOrThrow(alertId);
  if (!alert.pinned) {
    const currentPinned = await systemAlertRepository.countPinned();
    if (currentPinned >= SYSTEM_DETECTION_CONFIG.maxPinned) {
      throw new ValidationError(
        `Máximo ${SYSTEM_DETECTION_CONFIG.maxPinned} alertas fijadas simultáneamente`,
        { code: 'SYSTEM_PIN_LIMIT_REACHED', max: SYSTEM_DETECTION_CONFIG.maxPinned }
      );
    }
  }
  const updated = await systemAlertRepository.updateById(alert._id, {
    $set: { pinned: true, pinnedAt: new Date(), pinnedBy: userId }
  });
  await invalidateCache();
  return updated;
}

async function unpinAlert(alertId) {
  await getAlertOrThrow(alertId);
  const updated = await systemAlertRepository.updateById(alertId, {
    $set: { pinned: false },
    $unset: { pinnedAt: '', pinnedBy: '' }
  });
  await invalidateCache();
  return updated;
}

async function bulkAction(alertIds, action, { reason, untilDate, userId } = {}) {
  const allowed = ['dismiss', 'resolve', 'snooze'];
  if (!allowed.includes(action)) {
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
      if (action === 'dismiss') {
        r = await dismissAlert(id, { reason, userId });
      } else if (action === 'resolve') {
        r = await resolveAlert(id, { userId });
      } else if (action === 'snooze') {
        r = await snoozeAlert(id, { untilDate, userId });
      }
      results.push({ id, ok: true, status: r?.status });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }
  return results;
}

async function getHistory(alertId) {
  const alert = await getAlertOrThrow(alertId);
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
  timeline.sort((a, b) => new Date(a.at) - new Date(b.at));
  return { alertId: String(alert._id), timeline };
}

module.exports = {
  runDetection,
  list,
  summary,
  effectiveness,
  dismissAlert,
  resolveAlert,
  snoozeAlert,
  pinAlert,
  unpinAlert,
  bulkAction,
  getHistory,
  markRetentionRunCompleted,
  _internals: {
    SYSTEM_ALERT_CACHE_NAMESPACE,
    buildContext,
    upsertSystemAlert,
    redisLatencyBuffer,
    mongoStateBuffer
  }
};
