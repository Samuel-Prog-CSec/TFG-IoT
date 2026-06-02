/**
 * @fileoverview Detector: caída de rendimiento periodo-sobre-periodo (T-941).
 *
 * Compara el score promedio del alumno en los últimos 7 días con los 7 días
 * anteriores. Si la caída supera el umbral warning genera alerta `warning`;
 * si supera el critical, `critical`.
 *
 * Fix vs versión legacy: validamos `previousAvg > 0` antes de calcular el
 * porcentaje, evitando una falsa alerta crítica con `Infinity %` cuando el
 * periodo previo tenía score = 0.
 *
 * @module services/analytics/detectors/decliningPerformance
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const gamePlayRepository = require('../../../repositories/gamePlayRepository');
const { toObjectId, getPeriodDates } = require('../analyticsHelpers');

class DecliningPerformanceDetector extends AlertDetector {
  constructor() {
    super({ type: 'declining_performance' });
  }

  async run({ students, referenceDate = new Date() } = {}) {
    if (!students?.length) {
      return [];
    }

    const { warning: warningThreshold, critical: criticalThreshold } =
      ALERT_TYPES.declining_performance.thresholds;

    const { currentStart, previousStart, now } = getPeriodDates('7d', referenceDate);
    const studentIds = students.map(s => toObjectId(s._id));

    const pipeline = [
      {
        $match: {
          playerId: { $in: studentIds },
          status: 'completed',
          completedAt: { $gte: previousStart, $lte: now }
        }
      },
      {
        $addFields: {
          period: {
            $cond: [{ $gte: ['$completedAt', currentStart] }, 'current', 'previous']
          }
        }
      },
      {
        $group: {
          _id: { playerId: '$playerId', period: '$period' },
          avgScore: { $avg: '$score' },
          count: { $sum: 1 },
          lastCompletedAt: { $max: '$completedAt' }
        }
      }
    ];

    const results = await gamePlayRepository.aggregate(pipeline);

    const byStudent = {};
    for (const r of results) {
      const sid = r._id.playerId.toString();
      if (!byStudent[sid]) {
        byStudent[sid] = {};
      }
      byStudent[sid][r._id.period] = {
        avgScore: r.avgScore,
        count: r.count,
        lastCompletedAt: r.lastCompletedAt
      };
    }

    const findings = [];
    // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
    for (const student of students) {
      const sid = student._id.toString();
      const data = byStudent[sid];
      if (!data?.current || !data?.previous) {
        continue;
      }
      if (data.previous.count < 2 || data.current.count < 2) {
        continue;
      }
      // FIX (T-941): previousAvg=0 generaba Infinity y alerta crítica falsa
      if (data.previous.avgScore <= 0) {
        continue;
      }

      const declinePercent =
        ((data.previous.avgScore - data.current.avgScore) / data.previous.avgScore) * 100;
      if (declinePercent <= warningThreshold) {
        continue;
      }

      const severity = declinePercent > criticalThreshold ? 'critical' : 'warning';

      findings.push({
        studentId: sid,
        type: this.type,
        severity,
        description: `Su rendimiento ha bajado un ${Math.round(declinePercent)}% en la última semana`,
        recommendation:
          'Considerar revisar el contenido asignado o proporcionar sesiones de refuerzo',
        detectedAt: new Date(data.current.lastCompletedAt),
        data: {
          previousAvg: Math.round(data.previous.avgScore),
          currentAvg: Math.round(data.current.avgScore),
          declinePercent: Math.round(declinePercent * 10) / 10
        }
      });
    }

    return findings;
  }
}

module.exports = new DecliningPerformanceDetector();
