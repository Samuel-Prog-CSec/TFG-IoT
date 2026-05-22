/**
 * @fileoverview Detector: mejora rápida periodo-sobre-periodo (T-941).
 *
 * Mismo enfoque que `declining_performance` pero con signo invertido. Genera
 * alerta `info` (positiva) cuando la mejora supera el 15 %.
 *
 * @module services/analytics/detectors/improvingFast
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const gamePlayRepository = require('../../../repositories/gamePlayRepository');
const { toObjectId, getPeriodDates } = require('../analyticsHelpers');

class ImprovingFastDetector extends AlertDetector {
  constructor() {
    super({ type: 'improving_fast' });
  }

  async run({ students, referenceDate = new Date() } = {}) {
    if (!students?.length) {
      return [];
    }

    const threshold = ALERT_TYPES.improving_fast.thresholds.info;
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

    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    const findings = [];

    for (const [sid, data] of Object.entries(byStudent)) {
      if (!data.current || !data.previous) {
        continue;
      }
      if (data.previous.count < 2 || data.current.count < 2) {
        continue;
      }
      if (data.previous.avgScore <= 0) {
        continue;
      }

      const improvementPercent =
        ((data.current.avgScore - data.previous.avgScore) / data.previous.avgScore) * 100;
      if (improvementPercent <= threshold) {
        continue;
      }
      if (!studentMap.has(sid)) {
        continue;
      }

      findings.push({
        studentId: sid,
        type: this.type,
        severity: 'info',
        description: `Ha mejorado un ${Math.round(improvementPercent)}% en la última semana`,
        recommendation: 'Reforzar positivamente el progreso del alumno',
        detectedAt: new Date(data.current.lastCompletedAt),
        data: {
          previousAvg: Math.round(data.previous.avgScore),
          currentAvg: Math.round(data.current.avgScore),
          improvementPercent: Math.round(improvementPercent * 10) / 10
        }
      });
    }

    return findings;
  }
}

module.exports = new ImprovingFastDetector();
