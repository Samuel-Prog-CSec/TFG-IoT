/**
 * @fileoverview Detector NUEVO (T-941): recuperación tras bache.
 *
 * Si un alumno tuvo en los últimos 30 días una alerta `sudden_score_drop` o
 * `declining_performance` que ya está resuelta, genera una alerta `info`
 * positiva durante 7 días para reforzar al docente que el alumno se recuperó.
 *
 * Esta alerta convierte el sistema de alertas en algo que el docente "quiere
 * abrir" — no solo malas noticias.
 *
 * @module services/analytics/detectors/recoveryAfterDrop
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const smartAlertRepository = require('../../../repositories/smartAlertRepository');

class RecoveryAfterDropDetector extends AlertDetector {
  constructor() {
    super({ type: 'recovery_after_drop' });
  }

  async run({ teacherId, students, referenceDate = new Date() } = {}) {
    if (!students?.length) {
      return [];
    }

    const windowDays = ALERT_TYPES.recovery_after_drop.thresholds.windowDays;
    const windowStart = new Date(referenceDate);
    windowStart.setDate(windowStart.getDate() - windowDays);

    const studentIds = students.map(s => s._id.toString());
    const studentMap = new Map(students.map(s => [s._id.toString(), s]));

    // Buscar alertas negativas RESUELTAS recientemente para estos alumnos
    const recentResolved = await smartAlertRepository.find(
      {
        teacherId,
        studentId: { $in: studentIds },
        status: 'resolved',
        type: { $in: ['sudden_score_drop', 'declining_performance'] },
        resolvedAt: { $gte: windowStart }
      },
      { sort: { resolvedAt: -1 } }
    );

    // Dedupear por estudiante: solo la última resuelta por alumno
    const latestByStudent = new Map();
    for (const a of recentResolved) {
      const sid = a.studentId.toString();
      if (!latestByStudent.has(sid)) {
        latestByStudent.set(sid, a);
      }
    }

    const findings = [];
    // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
    for (const [sid, resolvedAlert] of latestByStudent.entries()) {
      const student = studentMap.get(sid);
      if (!student) {
        continue;
      }

      const daysSinceRecovery = Math.floor(
        (referenceDate - new Date(resolvedAlert.resolvedAt)) / 86400000
      );
      // Solo durante 7 días tras la recuperación
      if (daysSinceRecovery > 7) {
        continue;
      }

      findings.push({
        studentId: sid,
        type: this.type,
        severity: 'info',
        description: `Se ha recuperado del bache de hace ${daysSinceRecovery + 1} días`,
        recommendation: 'Reforzar positivamente — el alumno ha vuelto a su línea base',
        detectedAt: new Date(resolvedAlert.resolvedAt),
        data: {
          previousAlertType: resolvedAlert.type,
          daysSinceRecovery
        }
      });
    }

    return findings;
  }
}

module.exports = new RecoveryAfterDropDetector();
