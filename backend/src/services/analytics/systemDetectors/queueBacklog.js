/**
 * @fileoverview Detector: colas BullMQ con acumulación (T-942).
 *
 * Itera todas las queues conocidas en `ctx.queues` y consulta `getJobCounts()`.
 * Si una cola supera los umbrales o tiene jobs failed, emite un finding por
 * cola. El `component` lleva el nombre de la cola para que el dedup global
 * por (type=queue_backlog, status=active) no impida ver varias colas en
 * problemas a la vez — en cuyo caso el motor crea una alerta general y el
 * payload `data.queues` lista todas.
 *
 * Decisión: una sola alerta `queue_backlog` activa a la vez (dedup natural).
 * El payload agrega todas las colas afectadas.
 *
 * @module services/analytics/systemDetectors/queueBacklog
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

class QueueBacklogDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'queue_backlog', source: 'queue' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.queue_backlog;
    const queues = ctx.queues || {};
    if (Object.keys(queues).length === 0) {
      return [];
    }

    const offenders = [];
    let worstSeverity = null;

    for (const [name, queue] of Object.entries(queues)) {
      try {
        // Solo los estados que se usan (pending = waiting+delayed, failed, active).
        // `completed` se pedía pero nunca se leía: cada estado es un comando Redis
        // extra por cola y por corrida → se elimina para aligerar el coste Upstash.
        const counts = await queue.getJobCounts('waiting', 'delayed', 'failed', 'active');
        const pending = (counts.waiting || 0) + (counts.delayed || 0);
        const failed = counts.failed || 0;
        let sev = null;
        if (pending >= cfg.thresholds.criticalPending) {
          sev = 'critical';
        } else if (pending >= cfg.thresholds.warningPending || failed >= cfg.thresholds.failedAny) {
          sev = 'warning';
        }
        if (sev) {
          offenders.push({ name, pending, failed, active: counts.active || 0, severity: sev });
          if (sev === 'critical' || worstSeverity !== 'critical') {
            worstSeverity = sev;
          }
        }
      } catch {
        // Si no podemos leer la cola, no emitimos finding por ella.
      }
    }

    if (offenders.length === 0) {
      return [];
    }

    const offenderNames = offenders.map(o => o.name).join(', ');
    return [
      {
        type: this.type,
        severity: worstSeverity || 'warning',
        source: this.source,
        component: `queues:${offenders.length}`,
        title: cfg.label,
        description: `${offenders.length} cola(s) con problemas: ${offenderNames}.`,
        recommendation: 'Revisa el worker correspondiente y los logs de jobs fallidos.',
        data: { queues: offenders },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

module.exports = new QueueBacklogDetector();
